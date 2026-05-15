-- Final migration to ensure both tables have fiscal_info
ALTER TABLE online_quote_templates ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
