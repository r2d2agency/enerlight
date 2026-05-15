import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';

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

async function runMigration() {
  const sql = fs.readFileSync('backend/migrate-online-quote-templates-fiscal.sql', 'utf8');
  console.log('Running migration...');
  try {
    await pool.query(sql);
    console.log('Migration successful');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
