-- Extensão de Devoluções para RMA de Fornecedor + cross-link com RMA de Cliente
-- Idempotente: pode rodar múltiplas vezes.

ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS rma_type VARCHAR(15) DEFAULT 'cliente';
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS linked_devolucao_id UUID REFERENCES devolucoes(id) ON DELETE SET NULL;

-- Dados do fornecedor / fabricante
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_document VARCHAR(40);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_contact_name VARCHAR(255);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_whatsapp VARCHAR(50);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_email VARCHAR(255);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_address TEXT;
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_rma_number VARCHAR(80);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_expected_return_date DATE;
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS warranty_type VARCHAR(40);

-- Cobrança / crédito do fornecedor
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_charge_status VARCHAR(30);
ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_credit_value NUMERIC(14,2);

-- Torna customer_name opcional (RMA de fornecedor pode não ter cliente)
ALTER TABLE devolucoes ALTER COLUMN customer_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_devolucoes_rma_type ON devolucoes(rma_type);
CREATE INDEX IF NOT EXISTS idx_devolucoes_linked ON devolucoes(linked_devolucao_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_supplier ON devolucoes(supplier_name);
