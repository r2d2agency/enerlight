-- Document Signatures Module - Assinaturas de Documentos com validade jurídica

CREATE TABLE IF NOT EXISTS doc_signature_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    original_url TEXT NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    original_mimetype VARCHAR(200) DEFAULT 'application/pdf',
    signed_pdf_url TEXT,
    status VARCHAR(50) DEFAULT 'draft', -- draft, pending, partially_signed, completed, cancelled
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS doc_signature_signers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES doc_signature_documents(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    cpf VARCHAR(14),
    phone VARCHAR(20),
    role VARCHAR(100), -- ex: Contratante, Contratado, Testemunha
    sign_order INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending', -- pending, signed, declined
    signed_at TIMESTAMP WITH TIME ZONE,
    signature_data TEXT, -- base64 da assinatura desenhada
    signature_ip VARCHAR(50),
    signature_user_agent TEXT,
    signature_geolocation TEXT,
    access_token UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doc_signature_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES doc_signature_documents(id) ON DELETE CASCADE NOT NULL,
    signer_id UUID REFERENCES doc_signature_signers(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, -- created, sent, viewed, signed, declined, completed, downloaded
    ip_address VARCHAR(50),
    user_agent TEXT,
    geolocation TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doc_signature_placements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES doc_signature_documents(id) ON DELETE CASCADE NOT NULL,
    signer_id UUID REFERENCES doc_signature_signers(id) ON DELETE CASCADE NOT NULL,
    page_number INTEGER NOT NULL DEFAULT 1,
    x_position DECIMAL(10, 2) NOT NULL,
    y_position DECIMAL(10, 2) NOT NULL,
    width DECIMAL(10, 2) DEFAULT 200,
    height DECIMAL(10, 2) DEFAULT 80,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_sig_docs_org ON doc_signature_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_signers_doc ON doc_signature_signers(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_signers_token ON doc_signature_signers(access_token);
CREATE INDEX IF NOT EXISTS idx_doc_sig_audit_doc ON doc_signature_audit_log(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_placements_doc ON doc_signature_placements(document_id);
