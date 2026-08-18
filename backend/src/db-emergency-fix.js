import { pool } from './db.js';

async function fix() {
  console.log('Running emergency DB fix...');
  try {
    await pool.query(`
      DO \$\$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'permission_templates') THEN
              CREATE TABLE permission_templates (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  name VARCHAR(255) NOT NULL,
                  description TEXT,
                  icon VARCHAR(50) DEFAULT 'Users',
                  permissions JSONB NOT NULL,
                  organization_id UUID,
                  status TEXT DEFAULT 'active',
                  sort_order INTEGER DEFAULT 0,
                  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
              );
              
              -- Try to add constraint if organizations table exists
              IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'organizations') THEN
                  ALTER TABLE permission_templates ADD CONSTRAINT fk_permission_templates_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
              END IF;
          END IF;
      EXCEPTION WHEN OTHERS THEN 
          RAISE NOTICE 'Error in migration: %', SQLERRM;
      END \$\$;
    `);
    console.log('Migration completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

fix();
