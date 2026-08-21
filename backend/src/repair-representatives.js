import { pool } from './db.js';

async function repair() {
  console.log('--- Database Repair Script (Representantes Sprint 1) ---');
  try {
    console.log('Ensuring representative permissions in user_permissions...');
    const perms = [
      'can_manage_representative_config', 
      'can_view_representative_dashboard', 
      'can_view_all_representative_quotes',
      'is_representative'
    ];
    for (const p of perms) {
      await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = '${p}') THEN ALTER TABLE user_permissions ADD COLUMN ${p} BOOLEAN DEFAULT false; END IF; END $$;`);
    }

    console.log('Ensuring representative_id columns in deals and contacts...');
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
