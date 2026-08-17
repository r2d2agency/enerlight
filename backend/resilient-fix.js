
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const dbConfig = process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {};
const pool = new Pool(dbConfig);

async function run() {
  console.log('--- RESILIENT MIGRATION START ---');
  try {
    // 1. Get info
    const diag = await pool.query('SELECT current_database(), current_schema()');
    console.log('Context:', diag.rows[0]);

    const tableCheck = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'permission_templates'
    `);
    console.log('Table found:', tableCheck.rows);

    if (tableCheck.rows.length === 0) {
      console.log('Table permission_templates does not exist. Creating it...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS permission_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) NOT NULL,
          description TEXT,
          icon VARCHAR(50) DEFAULT 'Users',
          permissions JSONB NOT NULL DEFAULT '{}',
          is_default BOOLEAN DEFAULT false,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          organization_id UUID,
          status TEXT DEFAULT 'active' NOT NULL
        )
      `);
      console.log('Table created.');
    } else {
      console.log('Table exists. Checking columns...');
      const cols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'permission_templates'
      `);
      console.log('Columns:', cols.rows.map(c => c.column_name));

      const hasStatus = cols.rows.some(c => c.column_name === 'status');
      const hasOrg = cols.rows.some(c => c.column_name === 'organization_id');

      await pool.query('BEGIN');
      if (!hasStatus) {
        console.log('Adding status column...');
        await pool.query(`ALTER TABLE permission_templates ADD COLUMN status TEXT DEFAULT 'active' NOT NULL`);
      }
      if (!hasOrg) {
        console.log('Adding organization_id column...');
        await pool.query(`ALTER TABLE permission_templates ADD COLUMN organization_id UUID`);
      }
      await pool.query('COMMIT');
      console.log('Columns verified/added.');
    }

    const final = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates'
    `);
    console.log('Final schema:', final.rows);

  } catch (err) {
    console.error('CRITICAL MIGRATION ERROR:', err.message);
    await pool.query('ROLLBACK').catch(() => {});
  } finally {
    await pool.end();
  }
}

run();
