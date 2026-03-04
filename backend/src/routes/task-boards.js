import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ============================================
// STATIC ROUTES FIRST (before /:boardId dynamic routes)
// ============================================

// ============================================
// ORG MEMBERS (for assignment dropdown)
// ============================================
router.get('/members', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1
       ORDER BY u.name`,
      [req.user.organization_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CHECKLIST TEMPLATES
// ============================================

// GET /templates/list
router.get('/templates/list', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, 
        (SELECT COUNT(*) FROM task_checklist_template_items WHERE template_id = t.id) as item_count
       FROM task_checklist_templates t
       WHERE t.organization_id = $1
       ORDER BY t.name`,
      [req.user.organization_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /templates/:id
router.get('/templates/:id', async (req, res) => {
  try {
    const template = await pool.query(
      `SELECT * FROM task_checklist_templates WHERE id = $1`, [req.params.id]
    );
    const items = await pool.query(
      `SELECT * FROM task_checklist_template_items WHERE template_id = $1 ORDER BY position`, [req.params.id]
    );
    res.json({ ...template.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /templates
router.post('/templates', async (req, res) => {
  try {
    const { name, description, items } = req.body;
    const result = await pool.query(
      `INSERT INTO task_checklist_templates (organization_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.organization_id, name, description, req.user.id]
    );
    const template = result.rows[0];
    if (items?.length) {
      for (let i = 0; i < items.length; i++) {
        await pool.query(
          `INSERT INTO task_checklist_template_items (template_id, text, position) VALUES ($1, $2, $3)`,
          [template.id, items[i].text || items[i], i]
        );
      }
    }
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /templates/:id
router.put('/templates/:id', async (req, res) => {
  try {
    const { name, description, items } = req.body;
    await pool.query(
      `UPDATE task_checklist_templates SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW()
       WHERE id = $3`,
      [name, description, req.params.id]
    );
    if (items) {
      await pool.query(`DELETE FROM task_checklist_template_items WHERE template_id = $1`, [req.params.id]);
      for (let i = 0; i < items.length; i++) {
        await pool.query(
          `INSERT INTO task_checklist_template_items (template_id, text, position) VALUES ($1, $2, $3)`,
          [req.params.id, items[i].text || items[i], i]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /templates/:id
router.delete('/templates/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM task_checklist_templates WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CARD-LEVEL STATIC ROUTES (cards/*, checklists/*, checklist-items/*)
// ============================================

// PUT /cards/:id
router.put('/cards/:id', async (req, res) => {
  try {
    const { title, description, assigned_to, priority, due_date, tags, color, cover_image, is_archived } = req.body;
    const result = await pool.query(
      `UPDATE task_cards SET 
        title = COALESCE($1, title), description = COALESCE($2, description), 
        assigned_to = COALESCE($3, assigned_to), priority = COALESCE($4, priority),
        due_date = $5, tags = COALESCE($6, tags), color = COALESCE($7, color),
        cover_image = COALESCE($8, cover_image), is_archived = COALESCE($9, is_archived),
        completed_at = CASE WHEN $9 = true THEN NOW() ELSE completed_at END,
        updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [title, description, assigned_to, priority, due_date, tags, color, cover_image, is_archived, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /cards/:id/move
router.put('/cards/:id/move', async (req, res) => {
  try {
    const { column_id, position, board_id } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (board_id) { updates.push(`board_id = $${idx++}`); values.push(board_id); }
    if (column_id) { updates.push(`column_id = $${idx++}`); values.push(column_id); }
    if (position !== undefined) { updates.push(`position = $${idx++}`); values.push(position); }
    updates.push(`updated_at = NOW()`);
    values.push(req.params.id);

    const result = await pool.query(
      `UPDATE task_cards SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /cards/:id
router.delete('/cards/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM task_cards WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cards/:cardId/checklists
router.get('/cards/:cardId/checklists', async (req, res) => {
  try {
    const checklists = await pool.query(
      `SELECT * FROM task_card_checklists WHERE card_id = $1 ORDER BY position`,
      [req.params.cardId]
    );
    for (const cl of checklists.rows) {
      const items = await pool.query(
        `SELECT ci.*, u.name as assigned_name FROM task_card_checklist_items ci
         LEFT JOIN users u ON u.id = ci.assigned_to
         WHERE ci.checklist_id = $1 ORDER BY ci.position`,
        [cl.id]
      );
      cl.items = items.rows;
    }
    res.json(checklists.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cards/:cardId/checklists
router.post('/cards/:cardId/checklists', async (req, res) => {
  try {
    const { title, template_id } = req.body;
    const maxPos = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_card_checklists WHERE card_id = $1`,
      [req.params.cardId]
    );
    const result = await pool.query(
      `INSERT INTO task_card_checklists (card_id, title, position) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.cardId, title || 'Checklist', maxPos.rows[0].next_pos]
    );
    const checklist = result.rows[0];

    if (template_id) {
      const templateItems = await pool.query(
        `SELECT * FROM task_checklist_template_items WHERE template_id = $1 ORDER BY position`,
        [template_id]
      );
      for (const item of templateItems.rows) {
        await pool.query(
          `INSERT INTO task_card_checklist_items (checklist_id, text, position) VALUES ($1, $2, $3)`,
          [checklist.id, item.text, item.position]
        );
      }
    }

    res.json(checklist);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cards/:cardId/comments
router.get('/cards/:cardId/comments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, u.name as user_name FROM task_card_comments c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.card_id = $1 ORDER BY c.created_at DESC`,
      [req.params.cardId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cards/:cardId/comments
router.post('/cards/:cardId/comments', async (req, res) => {
  try {
    const { content } = req.body;
    const result = await pool.query(
      `INSERT INTO task_card_comments (card_id, user_id, user_name, content)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.cardId, req.user.id, req.user.name, content]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /cards/:cardId/attachments
router.get('/cards/:cardId/attachments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.name as uploaded_by_name FROM task_card_attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.card_id = $1 ORDER BY a.created_at DESC`,
      [req.params.cardId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /cards/:cardId/attachments
router.post('/cards/:cardId/attachments', async (req, res) => {
  try {
    const { file_name, file_url, file_type, file_size } = req.body;
    const result = await pool.query(
      `INSERT INTO task_card_attachments (card_id, file_name, file_url, file_type, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.cardId, file_name, file_url, file_type, file_size, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /checklists/:checklistId/items
router.post('/checklists/:checklistId/items', async (req, res) => {
  try {
    const { text } = req.body;
    const maxPos = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_card_checklist_items WHERE checklist_id = $1`,
      [req.params.checklistId]
    );
    const result = await pool.query(
      `INSERT INTO task_card_checklist_items (checklist_id, text, position) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.checklistId, text, maxPos.rows[0].next_pos]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /checklist-items/:id
router.put('/checklist-items/:id', async (req, res) => {
  try {
    const { text, is_checked, assigned_to, due_date } = req.body;
    const result = await pool.query(
      `UPDATE task_card_checklist_items SET 
        text = COALESCE($1, text), is_checked = COALESCE($2, is_checked),
        assigned_to = $3, due_date = $4
       WHERE id = $5 RETURNING *`,
      [text, is_checked, assigned_to, due_date, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /checklist-items/:id
router.delete('/checklist-items/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM task_card_checklist_items WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /checklists/:id
router.delete('/checklists/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM task_card_checklists WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /columns/:id
router.delete('/columns/:id', async (req, res) => {
  try {
    const col = await pool.query(`SELECT is_default FROM task_board_columns WHERE id = $1`, [req.params.id]);
    if (col.rows[0]?.is_default) {
      return res.status(400).json({ error: 'Não é possível remover colunas padrão' });
    }
    await pool.query(`DELETE FROM task_board_columns WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /columns/:id
router.put('/columns/:id', async (req, res) => {
  try {
    const { name, color, position } = req.body;
    const result = await pool.query(
      `UPDATE task_board_columns SET name = COALESCE($1, name), color = COALESCE($2, color), position = COALESCE($3, position), updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name, color, position, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /attachments/:id
router.delete('/attachments/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM task_card_attachments WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// DYNAMIC ROUTES (with :boardId parameter) — MUST come after static routes
// ============================================

// ============================================
// BOARDS
// ============================================

// GET / - List boards (global + user's personal)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tb.*, u.name as owner_name,
        (SELECT COUNT(*) FROM task_cards tc WHERE tc.board_id = tb.id AND NOT tc.is_archived) as card_count
       FROM task_boards tb
       LEFT JOIN users u ON u.id = tb.owner_id
       WHERE tb.organization_id = $1
         AND (tb.is_global = true OR tb.owner_id = $2)
       ORDER BY tb.is_global DESC, tb.name`,
      [req.user.organization_id, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing boards:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST / - Create board
router.post('/', async (req, res) => {
  try {
    const { name, description, color, is_global } = req.body;
    const boardResult = await pool.query(
      `INSERT INTO task_boards (organization_id, name, description, color, is_global, created_by, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.organization_id, name, description, color || '#6366f1', is_global || false, req.user.id, is_global ? null : req.user.id]
    );
    const board = boardResult.rows[0];

    // Create default columns
    const defaultColumns = [
      { name: 'A Fazer', color: '#6366f1', position: 0 },
      { name: 'Em Andamento', color: '#f59e0b', position: 1 },
      { name: 'Em Revisão', color: '#3b82f6', position: 2 },
      { name: 'Concluído', color: '#22c55e', position: 3 },
    ];
    for (const col of defaultColumns) {
      await pool.query(
        `INSERT INTO task_board_columns (board_id, name, color, position, is_default) VALUES ($1, $2, $3, $4, true)`,
        [board.id, col.name, col.color, col.position]
      );
    }

    res.json(board);
  } catch (err) {
    console.error('Error creating board:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /:id
router.put('/:id', async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const result = await pool.query(
      `UPDATE task_boards SET name = COALESCE($1, name), description = COALESCE($2, description), color = COALESCE($3, color), updated_at = NOW()
       WHERE id = $4 AND organization_id = $5 RETURNING *`,
      [name, description, color, req.params.id, req.user.organization_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM task_boards WHERE id = $1 AND organization_id = $2 AND is_global = false`,
      [req.params.id, req.user.organization_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// COLUMNS (nested under board)
// ============================================

// GET /:boardId/columns
router.get('/:boardId/columns', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM task_board_columns WHERE board_id = $1 ORDER BY position`,
      [req.params.boardId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:boardId/columns
router.post('/:boardId/columns', async (req, res) => {
  try {
    const { name, color } = req.body;
    const maxPos = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_board_columns WHERE board_id = $1`,
      [req.params.boardId]
    );
    const result = await pool.query(
      `INSERT INTO task_board_columns (board_id, name, color, position) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.boardId, name, color || '#6366f1', maxPos.rows[0].next_pos]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /:boardId/columns/reorder
router.put('/:boardId/columns/reorder', async (req, res) => {
  try {
    const { column_ids } = req.body;
    for (let i = 0; i < column_ids.length; i++) {
      await pool.query(`UPDATE task_board_columns SET position = $1 WHERE id = $2`, [i, column_ids[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// CARDS (nested under board)
// ============================================

// GET /:boardId/cards
router.get('/:boardId/cards', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tc.*, u.name as assigned_name, cu.name as creator_name,
        (SELECT COUNT(*) FROM task_card_checklists cl 
         JOIN task_card_checklist_items ci ON ci.checklist_id = cl.id 
         WHERE cl.card_id = tc.id) as total_checklist_items,
        (SELECT COUNT(*) FROM task_card_checklists cl 
         JOIN task_card_checklist_items ci ON ci.checklist_id = cl.id 
         WHERE cl.card_id = tc.id AND ci.is_checked = true) as completed_checklist_items,
        (SELECT COUNT(*) FROM task_card_attachments WHERE card_id = tc.id) as attachment_count,
        (SELECT COUNT(*) FROM task_card_comments WHERE card_id = tc.id) as comment_count
       FROM task_cards tc
       LEFT JOIN users u ON u.id = tc.assigned_to
       LEFT JOIN users cu ON cu.id = tc.created_by
       WHERE tc.board_id = $1 AND NOT tc.is_archived
       ORDER BY tc.position`,
      [req.params.boardId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:boardId/cards
router.post('/:boardId/cards', async (req, res) => {
  try {
    const { column_id, title, description, assigned_to, priority, due_date, tags, color, deal_id, company_id, contact_id } = req.body;
    
    const board = await pool.query(`SELECT is_global FROM task_boards WHERE id = $1`, [req.params.boardId]);
    const effectiveAssigned = board.rows[0]?.is_global ? (assigned_to || req.user.id) : req.user.id;

    const maxPos = await pool.query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_cards WHERE column_id = $1`,
      [column_id]
    );

    const result = await pool.query(
      `INSERT INTO task_cards (organization_id, board_id, column_id, position, title, description, assigned_to, created_by, priority, due_date, tags, color, deal_id, company_id, contact_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [req.user.organization_id, req.params.boardId, column_id, maxPos.rows[0].next_pos, title, description, effectiveAssigned, req.user.id, priority || 'medium', due_date, tags || [], color, deal_id, company_id, contact_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating card:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
