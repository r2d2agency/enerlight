
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const dbConfig = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {};
const pool = new Pool(dbConfig);

async function run() {
  console.log('--- DIAGNOSTICS ---');
  try {
    const diag = await pool.query('SELECT current_database(), current_schema()');
    console.log('Context:', diag.rows[0]);

    const tables = await pool.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_name ILIKE '%permission%template%'
    `);
    console.log('Tables found:', tables.rows);

    const columns = await pool.query(`
      SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name ILIKE '%permission%template%'
      ORDER BY table_schema, table_name, ordinal_position
    `);
    console.log('Columns found:', columns.rows);

    const hasStatus = columns.rows.some(c => c.column_name === 'status');
    const tableInfo = tables.rows.find(t => t.table_name === 'permission_templates' && t.table_schema === 'public');

    if (tableInfo && !hasStatus) {
      console.log('\n--- APPLYING MIGRATION ---');
      await pool.query('BEGIN');
      
      console.log('Adding column status...');
      await pool.query(`ALTER TABLE public.permission_templates ADD COLUMN IF NOT EXISTS status TEXT`);
      
      console.log('Setting default values...');
      await pool.query(`UPDATE public.permission_templates SET status = 'active' WHERE status IS NULL`);
      
      console.log('Setting column constraints...');
      await pool.query(`ALTER TABLE public.permission_templates ALTER COLUMN status SET DEFAULT 'active'`);
      await pool.query(`ALTER TABLE public.permission_templates ALTER COLUMN status SET NOT NULL`);
      
      await pool.query('COMMIT');
      console.log('Migration committed.');

      const verify = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'permission_templates'
          AND column_name = 'status'
      `);
      console.log('Verification:', verify.rows);
    } else if (hasStatus) {
      console.log('\nColumn "status" already exists. No migration applied.');
    } else {
      console.log('\nTable "public.permission_templates" not found.');
    }

  } catch (err) {
    console.error('Error:', err.message);
    if (err.message.includes('BEGIN') || err.message.includes('ALTER')) {
      await pool.query('ROLLBACK').catch(() => {});
    }
  } finally {
    await pool.end();
  }
}

run();
