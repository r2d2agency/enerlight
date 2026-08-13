import { query } from './db.js';

async function repair() {
  console.log('--- Database Repair Script ---');
  try {
    console.log('Checking permission_templates for organization_id...');
    await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'organization_id') THEN ALTER TABLE permission_templates ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE; END IF; END $$;");

    console.log('Ensuring online quotes permissions in user_permissions...');
    const perms = ['can_view_online_quotes', 'can_manage_online_quotes', 'can_edit_price_lists'];
    for (const p of perms) {
      await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = '" + p + "') THEN ALTER TABLE user_permissions ADD COLUMN " + p + " BOOLEAN DEFAULT false; END IF; END $$;");
    }

    console.log('Ensuring columns in price_list_items...');
    await query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'category') THEN ALTER TABLE price_list_items ADD COLUMN category VARCHAR(255); END IF; IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'subcategory') THEN ALTER TABLE price_list_items ADD COLUMN subcategory VARCHAR(255); END IF; END $$;");

    console.log('Repair completed successfully!');
  } catch (err) {
    console.error('Repair failed:', err);
    process.exit(1);
  }
}

repair();
