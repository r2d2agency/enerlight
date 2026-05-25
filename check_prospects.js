import { query } from './backend/src/db.js';

async function check() {
  try {
    const result = await query("SELECT * FROM information_schema.columns WHERE table_name = 'crm_prospects'");
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
check();
