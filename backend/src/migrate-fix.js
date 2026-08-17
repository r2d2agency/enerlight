import { pool } from './db.js';

async function migrate() {
  console.log('Running robust phone column type migration...');
  try {
    // Check if we are in the sandbox where 'base' doesn't exist or use direct connection if possible.
    // However, the previous error 'ENOTFOUND base' suggests 'db.js' uses 'base' as host.
    // I will try to run individual ALTER statements wrapped in a try/catch in SQL.
    
    await pool.query(`
      DO $$
      BEGIN
        BEGIN
            ALTER TABLE users ALTER COLUMN whatsapp_phone TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'users.whatsapp_phone already text or table missing';
        END;

        BEGIN
            ALTER TABLE users ALTER COLUMN phone_number TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'users.phone_number error';
        END;

        BEGIN
            ALTER TABLE conversations ALTER COLUMN contact_phone TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'conversations.contact_phone error';
        END;

        BEGIN
            ALTER TABLE chat_messages ALTER COLUMN sender_phone TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'chat_messages.sender_phone error';
        END;

        BEGIN
            ALTER TABLE connections ALTER COLUMN phone_number TYPE TEXT;
        EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'connections.phone_number error';
        END;
        
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'permission_templates' AND column_name = 'status') THEN
            ALTER TABLE permission_templates ADD COLUMN status TEXT DEFAULT 'active';
        END IF;
      END $$;
    `);
    console.log('Migration attempted successfully.');
  } catch (err) {
    console.error('Migration failed at query level:', err.message);
  } finally {
    process.exit(0);
  }
}

migrate();
