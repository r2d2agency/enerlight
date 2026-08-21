import { query } from './db.js';

async function repair() {
  console.log('--- Database Repair Script ---');
  try {
    console.log('Checking permission_templates for organization_id...');
    await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'organization_id') THEN ALTER TABLE permission_templates ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;");

    console.log('Ensuring representative permissions...');
    const perms = ['can_manage_representative_config', 'can_view_representative_dashboard', 'can_view_all_representative_quotes'];
    for (const p of perms) {
      await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = '" + p + "') THEN ALTER TABLE user_permissions ADD COLUMN " + p + " BOOLEAN DEFAULT false; END IF; END $$;");
    }

    console.log('Ensuring price_lists tables...');
    await query(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        segment VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        is_master BOOLEAN DEFAULT false,
        markup_percentage NUMERIC(10,2) DEFAULT 0,
        allowed_templates UUID[] DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS price_list_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE,
        code VARCHAR(255) NOT NULL,
        description TEXT,
        cost_price NUMERIC(15,2) DEFAULT 0,
        sale_price NUMERIC(15,2) DEFAULT 0,
        category VARCHAR(255),
        subcategory VARCHAR(255),
        brand VARCHAR(255),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    
    console.log('Ensuring cart_items table...');
    await query(`
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

    console.log('Ensuring representative columns...');
    await query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL`);
    await query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL`);

    console.log('Ensuring columns in price_list_items...');
    await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'category') THEN ALTER TABLE price_list_items ADD COLUMN category VARCHAR(255); END IF; IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'subcategory') THEN ALTER TABLE price_list_items ADD COLUMN subcategory VARCHAR(255); END IF; END $$;");

    console.log('Repair completed successfully!');
  } catch (err) {
    console.error('Repair failed:', err);
    process.exit(1);
  }
}

repair();

