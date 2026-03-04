-- Rename the file - this is actually the backend route, the SQL schema goes below
-- Task Boards Schema

-- ============================================
-- BOARDS
-- ============================================

CREATE TABLE IF NOT EXISTS task_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#6366f1',
    is_global BOOLEAN DEFAULT false,
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- COLUMNS
-- ============================================

CREATE TABLE IF NOT EXISTS task_board_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID REFERENCES task_boards(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    position INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CARDS (tasks)
-- ============================================

CREATE TABLE IF NOT EXISTS task_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    board_id UUID REFERENCES task_boards(id) ON DELETE CASCADE NOT NULL,
    column_id UUID REFERENCES task_board_columns(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    due_date TIMESTAMP WITH TIME ZONE,
    tags TEXT[] DEFAULT '{}',
    color VARCHAR(20),
    cover_image TEXT,
    deal_id UUID,
    company_id UUID,
    contact_id UUID,
    is_archived BOOLEAN DEFAULT false,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CHECKLISTS
-- ============================================

CREATE TABLE IF NOT EXISTS task_card_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES task_cards(id) ON DELETE CASCADE NOT NULL,
    title VARCHAR(255) DEFAULT 'Checklist',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_card_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID REFERENCES task_card_checklists(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    is_checked BOOLEAN DEFAULT false,
    position INTEGER NOT NULL DEFAULT 0,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CHECKLIST TEMPLATES
-- ============================================

CREATE TABLE IF NOT EXISTS task_checklist_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_checklist_template_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID REFERENCES task_checklist_templates(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- COMMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS task_card_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES task_cards(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ATTACHMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS task_card_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID REFERENCES task_cards(id) ON DELETE CASCADE NOT NULL,
    file_name VARCHAR(500) NOT NULL,
    file_url TEXT NOT NULL,
    file_type VARCHAR(100),
    file_size BIGINT,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_task_boards_org ON task_boards(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_boards_owner ON task_boards(owner_id);
CREATE INDEX IF NOT EXISTS idx_task_board_columns_board ON task_board_columns(board_id);
CREATE INDEX IF NOT EXISTS idx_task_cards_board ON task_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_task_cards_column ON task_cards(column_id);
CREATE INDEX IF NOT EXISTS idx_task_cards_assigned ON task_cards(assigned_to);
CREATE INDEX IF NOT EXISTS idx_task_cards_org ON task_cards(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_card_checklists_card ON task_card_checklists(card_id);
CREATE INDEX IF NOT EXISTS idx_task_card_checklist_items_cl ON task_card_checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_task_card_comments_card ON task_card_comments(card_id);
CREATE INDEX IF NOT EXISTS idx_task_card_attachments_card ON task_card_attachments(card_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_templates_org ON task_checklist_templates(organization_id);
