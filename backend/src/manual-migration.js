
import { query } from './db.js';

export async function manualMigration() {
  console.log('Running manual migration for price_lists and online_quote_templates...');
  try {
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

    console.log('Manual migration completed successfully!');
  } catch (err) {
    console.error('Manual migration failed:', err);
  }
}
