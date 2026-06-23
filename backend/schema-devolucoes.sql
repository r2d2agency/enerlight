-- Devoluções (RMA) Module
-- Controla todo o ciclo: solicitação -> recebimento -> análise -> troca/conserto -> envio

CREATE TABLE IF NOT EXISTS devolucoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero SERIAL,

  -- Vínculos
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_document VARCHAR(40),
  customer_whatsapp VARCHAR(50),
  customer_email VARCHAR(255),
  customer_address TEXT,

  -- Quem abriu
  opened_channel VARCHAR(20) DEFAULT 'sac', -- sac | vendedor | site | outro
  seller_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Classificação
  status VARCHAR(40) DEFAULT 'solicitado',
  -- solicitado, aguardando_nf_produto, recebido, em_analise, cliente_notificado,
  -- aguardando_nf_retorno, troca_conserto, enviado, concluido, recusado, cancelado
  priority VARCHAR(10) DEFAULT 'normal', -- low | normal | high | urgent
  reason VARCHAR(40) DEFAULT 'defeito',
  -- defeito, arrependimento, erro_envio, garantia, avaria_transporte, outro
  description TEXT,

  -- Pedido original
  original_order_number VARCHAR(80),
  original_invoice_number VARCHAR(80),
  original_invoice_date DATE,

  -- NF de devolução (entrada — cliente -> Enerlight)
  inbound_invoice_number VARCHAR(80),
  inbound_invoice_key VARCHAR(80),
  inbound_invoice_date DATE,
  inbound_invoice_value NUMERIC(14,2),

  -- Recebimento físico
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Análise técnica
  analysis_status VARCHAR(40), -- com_defeito | sem_defeito | fora_garantia | constatado_uso_indevido
  analysis_decision VARCHAR(40), -- troca | conserto | reembolso | descarte | devolver_cliente
  analysis_report TEXT,
  analyzed_at TIMESTAMPTZ,
  analyzed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Notificação ao cliente
  customer_notified_at TIMESTAMPTZ,
  customer_notification_channel VARCHAR(20),
  customer_notification_notes TEXT,

  -- NF de saída (Enerlight -> cliente)
  outbound_invoice_number VARCHAR(80),
  outbound_invoice_date DATE,
  outbound_invoice_value NUMERIC(14,2),
  outbound_tracking_code VARCHAR(80),
  outbound_carrier VARCHAR(120),
  outbound_sent_at TIMESTAMPTZ,

  -- Fretes (custos)
  inbound_carrier VARCHAR(120),
  inbound_tracking_code VARCHAR(80),
  inbound_freight_cost NUMERIC(12,2) DEFAULT 0,
  inbound_freight_status VARCHAR(40),  -- aguardando_coleta | em_transito | recebido
  outbound_freight_cost NUMERIC(12,2) DEFAULT 0,
  outbound_freight_status VARCHAR(40),

  -- Finalização
  resolution_summary TEXT,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devolucoes_org ON devolucoes(organization_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_status ON devolucoes(status);
CREATE INDEX IF NOT EXISTS idx_devolucoes_seller ON devolucoes(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_contact ON devolucoes(contact_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_created_at ON devolucoes(created_at);

CREATE TABLE IF NOT EXISTS devolucao_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucao_id UUID NOT NULL REFERENCES devolucoes(id) ON DELETE CASCADE,
  sku VARCHAR(80),
  product_name VARCHAR(255) NOT NULL,
  quantity NUMERIC(12,2) DEFAULT 1,
  serial_number VARCHAR(120),
  unit_value NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devolucao_itens_dev ON devolucao_itens(devolucao_id);

CREATE TABLE IF NOT EXISTS devolucao_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucao_id UUID NOT NULL REFERENCES devolucoes(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL, -- status_change | note | notification | attachment | invoice | freight
  from_status VARCHAR(40),
  to_status VARCHAR(40),
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devolucao_eventos_dev ON devolucao_eventos(devolucao_id);
CREATE INDEX IF NOT EXISTS idx_devolucao_eventos_created ON devolucao_eventos(created_at);

CREATE TABLE IF NOT EXISTS devolucao_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucao_id UUID NOT NULL REFERENCES devolucoes(id) ON DELETE CASCADE,
  category VARCHAR(40) DEFAULT 'foto', -- foto | nf_entrada | nf_saida | laudo | outro
  name VARCHAR(255),
  url TEXT NOT NULL,
  mimetype VARCHAR(100),
  size INTEGER,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devolucao_anexos_dev ON devolucao_anexos(devolucao_id);
