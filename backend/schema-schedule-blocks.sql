-- Schedule Blocks (Bloqueios de Agenda)
-- Férias, folgas, consultas médicas, almoço, eventos externos, etc.

CREATE TABLE IF NOT EXISTS schedule_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) NOT NULL,
    reason VARCHAR(50) DEFAULT 'other',  -- vacation, day_off, medical, lunch, external_event, personal, other
    block_date DATE NOT NULL,
    start_time TIME,        -- NULL = dia inteiro
    end_time TIME,          -- NULL = dia inteiro
    all_day BOOLEAN DEFAULT FALSE,
    recurrent BOOLEAN DEFAULT FALSE,
    recurrence_pattern VARCHAR(20),  -- daily, weekdays, weekly, monthly
    recurrence_days JSONB,           -- [0,1,2,3,4,5,6] for weekly pattern
    recurrence_end DATE,             -- NULL = indefinido
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_schedule_blocks_org ON schedule_blocks(organization_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_user ON schedule_blocks(user_id);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_date ON schedule_blocks(block_date);
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_recurrent ON schedule_blocks(recurrent);
