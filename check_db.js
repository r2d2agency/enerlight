import { query } from './backend/src/db.js';

async function check() {
  try {
    const cols = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'organization_members'");
    console.log('Columns:', JSON.stringify(cols.rows, null, 2));
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    process.exit();
  }
}
check();
