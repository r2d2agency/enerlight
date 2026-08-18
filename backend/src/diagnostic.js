import { query } from './db.js';

async function run() {
  console.log('--- DIAGNOSTIC START ---');
  try {
    const tableRes = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'permission_templates'
      )
    `);
    console.log('Table permission_templates exists:', tableRes.rows[0].exists);

    if (tableRes.rows[0].exists) {
      const colsRes = await query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'permission_templates'
        ORDER BY ordinal_position
      `);
      console.log('Columns:', JSON.stringify(colsRes.rows, null, 2));

      const countRes = await query('SELECT count(*) FROM permission_templates');
      console.log('Count:', countRes.rows[0].count);

      const sampleRes = await query('SELECT * FROM permission_templates LIMIT 5');
      console.log('Samples:', JSON.stringify(sampleRes.rows, null, 2));
    }
    
    // Check organization_members status column (used in templates route)
    const omCols = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'organization_members' AND column_name = 'status'
    `);
    console.log('organization_members has status column:', omCols.rows.length > 0);

  } catch (err) {
    console.error('DIAGNOSTIC FAILED:', err);
  }
  console.log('--- DIAGNOSTIC END ---');
  process.exit(0);
}

run();
