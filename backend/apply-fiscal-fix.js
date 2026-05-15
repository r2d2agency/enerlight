import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

function parseConnectionString(url) {
  if (!url) return {};
  const regex = /^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/([^?]+)(?:\?(.*))?$/;
  const match = url.match(regex);
  if (match) {
    const config = {
      user: match[1],
      password: match[2],
      host: match[3],
      port: parseInt(match[4], 10),
      database: match[5],
      ssl: { rejectUnauthorized: false }
    };
    return config;
  }
  return { connectionString: url, ssl: { rejectUnauthorized: false } };
}

const dbConfig = parseConnectionString(process.env.DATABASE_URL);
const pool = new Pool(dbConfig);

async function applyFix() {
  try {
    console.log('Applying fiscal_info columns migration...');
    await pool.query(`
      ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
      ALTER TABLE online_quote_templates ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
    `);
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

applyFix();
