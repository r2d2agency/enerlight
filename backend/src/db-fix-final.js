
import { pool } from './db.js';

async function diagnose() {
  console.log('--- STARTING DIAGNOSTICS ---');
  try {
    const diag = await pool.query('SELECT current_database(), current_schema()');
    console.log('DB Context:', diag.rows[0]);

    const tableInfo = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'permission_templates'
    `);
    console.log('Tables matching name:', tableInfo.rows);

    const columnInfo = await pool.query(`
      SELECT table_schema, table_name, column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'permission_templates'
      ORDER BY table_schema, table_name, ordinal_position
    `);
    console.log('Columns detail:', columnInfo.rows);

    // If we reach here, we are connected to the REAL database used by the backend.
    // The user wants a DEFINITIVE fix.
    const hasStatus = columnInfo.rows.some(c => c.column_name === 'status');
    const hasOrgId = columnInfo.rows.some(c => c.column_name === 'organization_id');

    if (!hasStatus || !hasOrgId) {
      console.log('\n--- APPLYING MIGRATION ---');
      await pool.query('BEGIN');
      
      if (!hasStatus) {
        console.log('Adding column status as TEXT...');
        await pool.query('ALTER TABLE public.permission_templates ADD COLUMN IF NOT EXISTS status TEXT');
        await pool.query("UPDATE public.permission_templates SET status = 'active' WHERE status IS NULL");
        await pool.query("ALTER TABLE public.permission_templates ALTER COLUMN status SET DEFAULT 'active'");
        await pool.query('ALTER TABLE public.permission_templates ALTER COLUMN status SET NOT NULL');
      }

      if (!hasOrgId) {
        console.log('Adding column organization_id...');
        await pool.query('ALTER TABLE public.permission_templates ADD COLUMN IF NOT EXISTS organization_id UUID');
      }

      await pool.query('COMMIT');
      console.log('Migration committed successfully.');

      const verify = await pool.query(`
        SELECT column_name, data_type, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'permission_templates'
          AND column_name IN ('status', 'organization_id')
      `);
      console.log('Final verification of columns:', verify.rows);
    } else {
      console.log('\nBoth status and organization_id columns already exist.');
    }

  } catch (err) {
    console.error('DIAGNOSTIC/FIX ERROR:', err.message);
    if (err.message.includes('permission') || err.message.includes('relation')) {
        console.log('Possible permission error or missing table.');
    }
  } finally {
    await pool.end();
  }
}

diagnose();
