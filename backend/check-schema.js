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

async function checkSchema() {
  try {
    const tables = ['online_quotes', 'online_quote_templates'];
    for (const table of tables) {
      console.log(`\n--- Schema for ${table} ---`);
      const res = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      console.table(res.rows);
    }
  } catch (err) {
    console.error('Error checking schema:', err);
  } finally {
    await pool.end();
  }
}

checkSchema();
