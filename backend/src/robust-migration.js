
import { pool } from './db.js';

async function migrate() {
  console.log('Running robust permission_templates migration...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create table if not exists with correct schema
    await client.query(`
      CREATE TABLE IF NOT EXISTS permission_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          icon VARCHAR(50) DEFAULT 'Users',
          permissions JSONB NOT NULL DEFAULT '{}',
          organization_id UUID,
          status TEXT DEFAULT 'active',
          is_default BOOLEAN DEFAULT false,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 2. Ensure all columns exist (in case table existed but was incomplete)
    const columns = [
      { name: 'organization_id', type: 'UUID' },
      { name: 'status', type: 'TEXT', default: "'active'" },
      { name: 'is_default', type: 'BOOLEAN', default: 'false' },
      { name: 'sort_order', type: 'INTEGER', default: '0' },
      { name: 'icon', type: 'VARCHAR(50)', default: "'Users'" },
      { name: 'permissions', type: 'JSONB', default: "'{}'" }
    ];

    for (const col of columns) {
      await client.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'permission_templates' AND column_name = '${col.name}'
          ) THEN 
            ALTER TABLE permission_templates ADD COLUMN ${col.name} ${col.type} ${col.default ? 'DEFAULT ' + col.default : ''}; 
          END IF; 
        END $$;
      `);
    }

    // 3. Ensure organization_id has a foreign key if organizations table exists
    await client.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations') THEN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'fk_permission_templates_org'
          ) THEN
            ALTER TABLE permission_templates 
            ADD CONSTRAINT fk_permission_templates_org 
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
          END IF;
        END IF;
      END $$;
    `);

    // 4. Ensure no NULLs in permissions
    await client.query(`UPDATE permission_templates SET permissions = '{}' WHERE permissions IS NULL;`);
    await client.query(`ALTER TABLE permission_templates ALTER COLUMN permissions SET NOT NULL;`);

    await client.query('COMMIT');
    console.log('Migration completed successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

migrate();
