import { query } from './backend/src/db.js';

async function test() {
  try {
    console.log('Testing DB connection...');
    const tables = await query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables found:', tables.rows.map(r => r.table_name).join(', '));
    
    const superadmin = await query(
      `SELECT u.id, om.organization_id 
       FROM users u 
       JOIN organization_members om ON om.user_id = u.id 
       WHERE u.is_superadmin = true 
       LIMIT 1`
    );
    console.log('Superadmin found:', superadmin.rows.length > 0);
    if (superadmin.rows.length > 0) {
      console.log('Superadmin Org ID:', superadmin.rows[0].organization_id);
    }
    
    const prospectCols = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'crm_prospects'"
    );
    console.log('crm_prospects columns:', prospectCols.rows.map(r => r.column_name).join(', '));
    
  } catch (err) {
    console.error('DB Test Error:', err);
  } finally {
    process.exit(0);
  }
}

test();
