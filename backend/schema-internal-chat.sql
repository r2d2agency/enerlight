-- Schema para Comunicação Interna (Internal Chat)
-- Canais por departamento, mensagens com menções, anexos e status

-- Canais de comunicação interna
CREATE TABLE IF NOT EXISTS internal_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_channels_org ON internal_channels(organization_id);
CREATE INDEX IF NOT EXISTS idx_internal_channels_dept ON internal_channels(department_id);

-- Membros de cada canal
CREATE TABLE IF NOT EXISTS internal_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES internal_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_channel_members_channel ON internal_channel_members(channel_id);
CREATE INDEX IF NOT EXISTS idx_internal_channel_members_user ON internal_channel_members(user_id);

-- Tópicos (threads) dentro de um canal
CREATE TYPE internal_topic_status AS ENUM ('open', 'in_progress', 'closed');

CREATE TABLE IF NOT EXISTS internal_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES internal_channels(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  status internal_topic_status DEFAULT 'open',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_topics_channel ON internal_topics(channel_id);
CREATE INDEX IF NOT EXISTS idx_internal_topics_status ON internal_topics(status);

-- Mensagens nos tópicos
CREATE TABLE IF NOT EXISTS internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES internal_topics(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  -- JSON array of user IDs mentioned in the message
  mentions UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_messages_topic ON internal_messages(topic_id);
CREATE INDEX IF NOT EXISTS idx_internal_messages_sender ON internal_messages(sender_id);

-- Anexos das mensagens
CREATE TABLE IF NOT EXISTS internal_message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name VARCHAR(500) NOT NULL,
  file_size INTEGER,
  file_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_attachments_message ON internal_message_attachments(message_id);

-- Menções não lidas (para badge de notificação)
CREATE TABLE IF NOT EXISTS internal_mentions_unread (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES internal_messages(id) ON DELETE CASCADE,
  topic_id UUID NOT NULL REFERENCES internal_topics(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES internal_channels(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_mentions_user ON internal_mentions_unread(user_id);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION update_internal_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_internal_channels_updated_at ON internal_channels;
CREATE TRIGGER trigger_internal_channels_updated_at
  BEFORE UPDATE ON internal_channels FOR EACH ROW
  EXECUTE FUNCTION update_internal_channels_updated_at();

CREATE OR REPLACE FUNCTION update_internal_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_internal_topics_updated_at ON internal_topics;
CREATE TRIGGER trigger_internal_topics_updated_at
  BEFORE UPDATE ON internal_topics FOR EACH ROW
  EXECUTE FUNCTION update_internal_topics_updated_at();
