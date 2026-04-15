-- ============================================
-- SURVEYS MODULE
-- ============================================

CREATE TABLE IF NOT EXISTS surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  introduction TEXT,
  thumbnail_url TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  template_type VARCHAR(50), -- 'nps', 'satisfaction', 'post_purchase', 'custom'
  share_slug VARCHAR(100) UNIQUE,
  require_name BOOLEAN DEFAULT true,
  require_whatsapp BOOLEAN DEFAULT false,
  require_email BOOLEAN DEFAULT false,
  allow_anonymous BOOLEAN DEFAULT false,
  thank_you_message TEXT DEFAULT 'Obrigado por responder nossa pesquisa!',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS survey_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  field_type VARCHAR(30) NOT NULL CHECK (field_type IN ('nps', 'rating', 'text', 'textarea', 'select', 'multi_select', 'yes_no', 'scale')),
  label TEXT NOT NULL,
  description TEXT,
  required BOOLEAN DEFAULT false,
  options JSONB, -- for select/multi_select: ["Option 1","Option 2"]
  min_value INT, -- for scale
  max_value INT, -- for scale
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  respondent_name VARCHAR(255),
  respondent_whatsapp VARCHAR(30),
  respondent_email VARCHAR(255),
  answers JSONB NOT NULL DEFAULT '{}', -- { field_id: value }
  metadata JSONB DEFAULT '{}', -- ip, user agent, etc.
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_surveys_org ON surveys(organization_id);
CREATE INDEX IF NOT EXISTS idx_surveys_slug ON surveys(share_slug);
CREATE INDEX IF NOT EXISTS idx_survey_fields_survey ON survey_fields(survey_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id, submitted_at DESC);
