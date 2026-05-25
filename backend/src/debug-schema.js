import { query } from './db.js';

async function checkSchema() {
  try {
    const res = await query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'crm_prospects'
    `);
    console.log('COLUMNS:', JSON.stringify(res.rows));
  } catch (err) {
    console.error('ERROR:', err.message);
  }
  process.exit(0);
}

checkSchema();