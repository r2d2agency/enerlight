-- Add fiscal_info column to online_quotes and online_quote_templates
ALTER TABLE online_quote_templates ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
ALTER TABLE online_quotes ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
