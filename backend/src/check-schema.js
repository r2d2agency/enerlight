
import { query } from './db.js';

async function run() {
  try {
    console.log('--- TABLE: price_list_items ---');
    const items = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'price_list_items'");
    console.log(JSON.stringify(items.rows, null, 2));

    console.log('--- TABLE: price_lists ---');
    const lists = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'price_lists'");
    console.log(JSON.stringify(lists.rows, null, 2));

    console.log('--- TABLE: online_quotes ---');
    const quotes = await query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'online_quotes'");
    console.log(JSON.stringify(quotes.rows, null, 2));
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
