
import { query } from './db.js';

export async function manualMigration() {
  console.log('Running manual migration...');
  try {
    // 0. Ensure permission_templates table exists
    await query(`
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
      
      -- Ensure is_default exists for older instances
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'is_default') THEN
          ALTER TABLE permission_templates ADD COLUMN is_default BOOLEAN DEFAULT false;
        END IF;
      EXCEPTION WHEN others THEN NULL; END $$;
    `);

    // 1. Ensure allowed_templates and other columns exist on price_lists
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'allowed_templates') THEN
          ALTER TABLE price_lists ADD COLUMN allowed_templates JSONB DEFAULT '[]'::jsonb;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'discount_limit_percentage') THEN
          ALTER TABLE price_lists ADD COLUMN discount_limit_percentage DECIMAL(10, 2) DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'markup_percentage') THEN
          ALTER TABLE price_lists ADD COLUMN markup_percentage DECIMAL(10, 2) DEFAULT 0;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'is_master') THEN
          ALTER TABLE price_lists ADD COLUMN is_master BOOLEAN DEFAULT false;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'segment') THEN
          ALTER TABLE price_lists ADD COLUMN segment TEXT;
        END IF;
      EXCEPTION WHEN others THEN RAISE NOTICE 'Error updating price_lists table'; END $$;
    `);

    // 2. Ensure fiscal_info and footer_config exist on online_quote_templates
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quote_templates' AND column_name = 'fiscal_info') THEN
          ALTER TABLE online_quote_templates ADD COLUMN fiscal_info TEXT;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quote_templates' AND column_name = 'footer_config') THEN
          ALTER TABLE online_quote_templates ADD COLUMN footer_config JSONB;
        END IF;
      EXCEPTION WHEN others THEN RAISE NOTICE 'Error updating online_quote_templates table'; END $$;
    `);

    // 3. Ensure can_manage_representative_config permission column exists
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_permissions' AND column_name = 'can_manage_representative_config') THEN
          ALTER TABLE user_permissions ADD COLUMN can_manage_representative_config BOOLEAN DEFAULT false;
        END IF;
      EXCEPTION WHEN others THEN RAISE NOTICE 'Error updating user_permissions table'; END $$;
    `);

    // 5. Ensure representative tables and columns
    await query(`
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
      );

      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'crm_deals' AND column_name = 'representative_id') THEN
          ALTER TABLE crm_deals ADD COLUMN representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL;
        END IF;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'contacts' AND column_name = 'representative_id') THEN
          ALTER TABLE contacts ADD COLUMN representative_id UUID REFERENCES crm_representatives(id) ON DELETE SET NULL;
        END IF;
      EXCEPTION WHEN others THEN NULL; END $$;

      CREATE TABLE IF NOT EXISTS cart_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        item_id UUID REFERENCES price_list_items(id) ON DELETE CASCADE,
        quantity INTEGER DEFAULT 1,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(user_id, item_id)
      );
    `);


    // 4. Ensure foreign key for permission_templates if organizations table exists
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'permission_templates' 
            AND constraint_name = 'fk_permission_templates_org'
        ) AND EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'organizations') THEN
            ALTER TABLE permission_templates 
            ADD CONSTRAINT fk_permission_templates_org 
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
        END IF;
      EXCEPTION WHEN others THEN RAISE NOTICE 'Error adding fk to permission_templates'; END $$;
    `);

    console.log('Manual migration completed successfully!');
  } catch (err) {
    console.error('Manual migration failed:', err);
  }
}
