
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
async function run() {
  try {
    const res = await pool.query(`
      SELECT 
        table_schema, 
        table_name, 
        column_name, 
        data_type, 
        column_default, 
        is_nullable 
      FROM information_schema.columns 
      WHERE table_name = $1 
      ORDER BY table_schema, ordinal_position;
    `, ["permission_templates"]);
    process.stdout.write(JSON.stringify(res.rows, null, 2));
  } catch (e) {
    process.stderr.write(e.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
run();
