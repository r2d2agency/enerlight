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

-- Minutas (envio de rascunho para leitura protegida por senha)
CREATE TABLE IF NOT EXISTS doc_signature_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES doc_signature_documents(id) ON DELETE CASCADE NOT NULL,
    recipient_name VARCHAR(255) NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    access_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    view_count INTEGER DEFAULT 0,
    last_viewed_at TIMESTAMP WITH TIME ZONE,
    revoked BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_sig_drafts_doc ON doc_signature_drafts(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_drafts_token ON doc_signature_drafts(access_token);

-- Resposta do destinatário à minuta
ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS response_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS response_reason TEXT;
ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS response_ip TEXT;

-- ============= BIOMETRIC + OTP + PUBLIC TRACKING (v2) =============
ALTER TABLE doc_signature_signers    ADD COLUMN IF NOT EXISTS selfie_url TEXT;
ALTER TABLE doc_signature_signers    ADD COLUMN IF NOT EXISTS document_front_url TEXT;
ALTER TABLE doc_signature_signers    ADD COLUMN IF NOT EXISTS document_back_url TEXT;
ALTER TABLE doc_signature_signers    ADD COLUMN IF NOT EXISTS face_match_score DECIMAL(6,4);
ALTER TABLE doc_signature_signers    ADD COLUMN IF NOT EXISTS face_validation_status VARCHAR(30) DEFAULT 'pending';
ALTER TABLE doc_signature_signers    ADD COLUMN IF NOT EXISTS face_validation_details JSONB;

ALTER TABLE doc_signature_documents  ADD COLUMN IF NOT EXISTS require_biometric BOOLEAN DEFAULT TRUE;
ALTER TABLE doc_signature_documents  ADD COLUMN IF NOT EXISTS document_hash VARCHAR(128);
ALTER TABLE doc_signature_documents  ADD COLUMN IF NOT EXISTS public_tracking_slug VARCHAR(20) UNIQUE;

CREATE TABLE IF NOT EXISTS doc_signature_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signer_id UUID REFERENCES doc_signature_signers(id) ON DELETE CASCADE NOT NULL,
    code_hash TEXT NOT NULL,
    code_salt TEXT NOT NULL,
    sent_to_email VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    attempts INTEGER DEFAULT 0,
    ip_address VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_sig_otps_signer ON doc_signature_otps(signer_id);
CREATE INDEX IF NOT EXISTS idx_doc_sig_otps_exp ON doc_signature_otps(expires_at);

