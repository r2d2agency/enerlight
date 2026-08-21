import { pool } from './db.js';

async function repair() {
  console.log('--- Database Repair Script (Representantes Sprint 1) ---');
  try {
    console.log('Ensuring representative_id columns in deals and contacts...');
    // We skip user_permissions as the route handler will auto-add them via ALTER TABLE in ensurePermissionColumns()
    
    // crm_representatives table should already exist from init-db, but we ensure it anyway
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_representatives (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        cpf_cnpj VARCHAR(20),
        city VARCHAR(100),
        state VARCHAR(2),
        address TEXT,
        zip_code VARCHAR(10),
        commission_percent NUMERIC(5,2) DEFAULT 0,
        notes TEXT,
        is_active BOOLEAN DEFAULT true,
        linked_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL;`);
    await pool.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL;`);

    console.log('Ensuring cart_items table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        item_id UUID REFERENCES price_list_items(id) ON DELETE CASCADE,
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, item_id)
      )
    `);

    console.log('Repair completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Repair failed:', err);
    process.exit(1);
  }
}

repair();
