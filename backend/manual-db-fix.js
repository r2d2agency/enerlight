import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@base:5432/postgres'
});

async function fix() {
  console.log('Starting manual database fix...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Ensuring permission_templates columns exist...');
    await client.query(`
      ALTER TABLE permission_templates ADD COLUMN IF NOT EXISTS organization_id UUID;
      ALTER TABLE permission_templates ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
      ALTER TABLE permission_templates ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
    `);

    console.log('Ensuring foreign keys exist...');
    try {
      await client.query(`
        ALTER TABLE permission_templates 
        ADD CONSTRAINT fk_permission_templates_org 
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
      `);
    } catch (e) {
      console.log('FK already exists or failed:', e.message);
    }

    console.log('Updating null statuses...');
    await client.query("UPDATE permission_templates SET status = 'active' WHERE status IS NULL");

    console.log('Ensuring RH tables exist...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS rh_authorized_locations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
          name VARCHAR(255) NOT NULL,
          latitude DECIMAL(10, 8) NOT NULL,
          longitude DECIMAL(11, 8) NOT NULL,
          radius_meters INTEGER DEFAULT 100,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS price_list_categories (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
          category VARCHAR(255) NOT NULL,
          subcategory VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(organization_id, category, subcategory)
      );
    `);

    await client.query('COMMIT');
    console.log('Database fix applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.log('Error applying fix:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

fix();
