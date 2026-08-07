-- Add categories, subcategories and brands to price list items
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS subcategory TEXT;
ALTER TABLE price_list_items ADD COLUMN IF NOT EXISTS brand TEXT;

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_price_list_items_cat ON price_list_items(category);
CREATE INDEX IF NOT EXISTS idx_price_list_items_subcat ON price_list_items(subcategory);
CREATE INDEX IF NOT EXISTS idx_price_list_items_brand ON price_list_items(brand);
