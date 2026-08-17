import { query } from './db.js';

async function fix() {
  console.log('Starting permission_templates fix...');
  try {
    // Add organization_id column if it doesn't exist
    await query(`
      ALTER TABLE permission_templates 
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    `);
    console.log('organization_id column checked/added.');

    // Grant all privileges to the user running the process if needed (already handled by db.js pool)
    
    // Check if there are any templates without organization_id and if we can assign them a default one
    // or just leave them as NULL (global). The current route logic handles NULL as global.
    
    console.log('Permission templates schema fix completed successfully.');
  } catch (err) {
    console.error('Error fixing permission_templates schema:', err);
    process.exit(1);
  }
}

fix();
