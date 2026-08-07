import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  console.log('Starting manual migration for online_quotes module...');
  try {
    const sql = `
      DO $$ BEGIN
          -- price_list_items extensions
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'image_url') THEN
              ALTER TABLE price_list_items ADD COLUMN image_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'category') THEN
              ALTER TABLE price_list_items ADD COLUMN category VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'subcategory') THEN
              ALTER TABLE price_list_items ADD COLUMN subcategory VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'brand') THEN
              ALTER TABLE price_list_items ADD COLUMN brand VARCHAR(255);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_list_items' AND column_name = 'unit') THEN
              ALTER TABLE price_list_items ADD COLUMN unit VARCHAR(20) DEFAULT 'un';
          END IF;

          -- online_quotes extensions
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quotes' AND column_name = 'include_images') THEN
              ALTER TABLE online_quotes ADD COLUMN include_images BOOLEAN DEFAULT true;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quotes' AND column_name = 'template_id') THEN
              ALTER TABLE online_quotes ADD COLUMN template_id UUID;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quotes' AND column_name = 'footer_config') THEN
              ALTER TABLE online_quotes ADD COLUMN footer_config JSONB;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quotes' AND column_name = 'payment_terms') THEN
              ALTER TABLE online_quotes ADD COLUMN payment_terms VARCHAR(100);
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quotes' AND column_name = 'payment_method') THEN
              ALTER TABLE online_quotes ADD COLUMN payment_method VARCHAR(100);
          END IF;

          -- online_quote_items extensions
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quote_items' AND column_name = 'image_url') THEN
              ALTER TABLE online_quote_items ADD COLUMN image_url TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quote_items' AND column_name = 'discount_type') THEN
              ALTER TABLE online_quote_items ADD COLUMN discount_type VARCHAR(20) DEFAULT 'fixed';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'online_quote_items' AND column_name = 'discount_value') THEN
              ALTER TABLE online_quote_items ADD COLUMN discount_value DECIMAL(15, 2) DEFAULT 0;
          END IF;

          -- price_lists extensions
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'is_master') THEN
              ALTER TABLE price_lists ADD COLUMN is_master BOOLEAN DEFAULT false;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'markup_percentage') THEN
              ALTER TABLE price_lists ADD COLUMN markup_percentage DECIMAL(10, 2) DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'price_lists' AND column_name = 'default_template_id') THEN
              ALTER TABLE price_lists ADD COLUMN default_template_id UUID;
          END IF;
      EXCEPTION WHEN others THEN 
          RAISE NOTICE 'Error during migration: %', SQLERRM;
      END $$;
    `;
    await pool.query(sql);
    console.log('Migration completed successfully.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
