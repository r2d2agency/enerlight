-- Add fiscal_info column to online_quote_templates
ALTER TABLE online_quote_templates ADD COLUMN IF NOT EXISTS fiscal_info TEXT;
