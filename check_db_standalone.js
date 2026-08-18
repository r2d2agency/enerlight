
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkPermissionTemplates() {
  console.log('--- Database Check: permission_templates ---');
  try {
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'permission_templates'
      )
    `);
    console.log('Table permission_templates exists:', tableExists.rows[0].exists);

    if (tableExists.rows[0].exists) {
      const columns = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'permission_templates' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      console.log('Columns:');
      columns.rows.forEach(c => {
        console.log(` - ${c.column_name} (${c.data_type}, nullable: ${c.is_nullable})`);
      });

      const count = await pool.query('SELECT count(*) FROM permission_templates');
      console.log('Total rows:', count.rows[0].count);

      const sample = await pool.query('SELECT * FROM permission_templates LIMIT 1');
      if (sample.rows.length > 0) {
        console.log('Sample row values:');
        for (const [key, value] of Object.entries(sample.rows[0])) {
          console.log(` - ${key}: ${typeof value} (${value})`);
        }
      }
    }
    
    // Check organization_members table
    const omExists = await pool.query(`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'organization_members')`);
    console.log('\nTable organization_members exists:', omExists.rows[0].exists);
    if (omExists.rows[0].exists) {
        const omCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'organization_members'`);
        console.log('organization_members columns:', omCols.rows.map(c => c.column_name).join(', '));
    }

  } catch (error) {
    console.error('Error during check:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkPermissionTemplates();
