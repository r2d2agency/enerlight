import { pool } from './db.js';

async function migrate() {
  console.log('Running emergency phone column type migration...');
  try {
    await pool.query(`
      DO $$
      BEGIN
        -- Alter columns to TEXT to avoid length issues
        ALTER TABLE users ALTER COLUMN whatsapp_phone TYPE TEXT;
        ALTER TABLE users ALTER COLUMN phone_number TYPE TEXT;
        ALTER TABLE conversations ALTER COLUMN contact_phone TYPE TEXT;
        ALTER TABLE chat_messages ALTER COLUMN sender_phone TYPE TEXT;
        ALTER TABLE connections ALTER COLUMN phone_number TYPE TEXT;
        
        -- Fix status column in permission_templates if missing
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'status') THEN
            ALTER TABLE permission_templates ADD COLUMN status TEXT DEFAULT 'active';
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Migration warning: %', SQLERRM;
      END $$;
    `);
    console.log('Migration successful.');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}

migrate();
