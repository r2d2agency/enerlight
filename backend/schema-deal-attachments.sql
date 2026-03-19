-- Deal Attachments - arquivos anexados a negociações específicas

CREATE TABLE IF NOT EXISTS crm_deal_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID REFERENCES crm_deals(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(500) NOT NULL,
    url TEXT NOT NULL,
    mimetype VARCHAR(200) DEFAULT 'application/octet-stream',
    size BIGINT DEFAULT 0,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_attachments_deal ON crm_deal_attachments(deal_id);
