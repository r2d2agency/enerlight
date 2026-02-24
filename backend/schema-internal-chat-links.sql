-- Schema para vínculos de tópicos do Chat Interno
-- Permite vincular tópicos a tarefas, reuniões, projetos e negociações

CREATE TABLE IF NOT EXISTS internal_topic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES internal_topics(id) ON DELETE CASCADE,
  link_type VARCHAR(50) NOT NULL, -- 'task', 'meeting', 'project', 'deal'
  link_id UUID NOT NULL,
  link_title VARCHAR(500),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_topic_links_topic ON internal_topic_links(topic_id);
CREATE INDEX IF NOT EXISTS idx_internal_topic_links_type ON internal_topic_links(link_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_topic_links_unique ON internal_topic_links(topic_id, link_type, link_id);
