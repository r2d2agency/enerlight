const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'permission_templates'");
    console.log("Columns:", res.rows.map(r => r.column_name));
    
    const tableExists = await pool.query("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'permission_templates')");
    console.log("Table exists:", tableExists.rows[0].exists);
  } catch (err) {
    console.error("Error:", err.message);
  } finally {
    await pool.end();
  }
}

check();
