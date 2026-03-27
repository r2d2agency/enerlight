import { Router } from 'express';
import { query } from '../db.js';
import { authenticate as requireAuth } from '../middleware/auth.js';

const router = Router();

async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function addHistory(licitacaoId, userId, action, details) {
  const u = await query('SELECT name FROM users WHERE id = $1', [userId]);
  await query(
    `INSERT INTO licitacao_history (licitacao_id, user_id, user_name, action, details) VALUES ($1,$2,$3,$4,$5)`,
    [licitacaoId, userId, u.rows[0]?.name || 'Sistema', action, details]
  );
}

// ===================== BOARDS =====================

router.get('/boards', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT b.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM licitacoes l WHERE l.board_id = b.id) as item_count
       FROM licitacao_boards b
       LEFT JOIN users u ON u.id = b.created_by
       WHERE b.organization_id = $1
       ORDER BY b.created_at DESC`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('List licitacao boards error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/boards', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { name, description } = req.body;
    const board = await query(
      `INSERT INTO licitacao_boards (organization_id, name, description, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [org.organization_id, name, description || null, req.userId]
    );
    const boardId = board.rows[0].id;
    const defaultStages = [
      { name: 'Prospecção', color: '#6366f1', sort_order: 0 },
      { name: 'Edital Publicado', color: '#f59e0b', sort_order: 1 },
      { name: 'Em Análise', color: '#3b82f6', sort_order: 2 },
      { name: 'Proposta Enviada', color: '#8b5cf6', sort_order: 3 },
      { name: 'Aguardando Resultado', color: '#ec4899', sort_order: 4 },
      { name: 'Concluída', color: '#22c55e', sort_order: 5, is_final: true },
    ];
    for (const s of defaultStages) {
      await query(
        `INSERT INTO licitacao_stages (board_id, name, color, sort_order, is_final) VALUES ($1,$2,$3,$4,$5)`,
        [boardId, s.name, s.color, s.sort_order, s.is_final || false]
      );
    }
    res.json(board.rows[0]);
  } catch (e) {
    console.error('Create licitacao board error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/boards/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacao_boards WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== STAGES =====================

router.get('/boards/:boardId/stages', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, (SELECT COUNT(*) FROM licitacoes l WHERE l.stage_id = s.id) as item_count
       FROM licitacao_stages s WHERE s.board_id = $1 ORDER BY s.sort_order`,
      [req.params.boardId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/boards/:boardId/stages', requireAuth, async (req, res) => {
  try {
    const { name, color, is_final } = req.body;
    const maxOrder = await query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM licitacao_stages WHERE board_id=$1', [req.params.boardId]);
    const result = await query(
      `INSERT INTO licitacao_stages (board_id, name, color, sort_order, is_final) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.boardId, name, color || '#6366f1', maxOrder.rows[0].next, is_final || false]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/stages/:id', requireAuth, async (req, res) => {
  try {
    const { name, color, sort_order, is_final } = req.body;
    const sets = []; const vals = []; let i = 1;
    if (name !== undefined) { sets.push(`name=$${i++}`); vals.push(name); }
    if (color !== undefined) { sets.push(`color=$${i++}`); vals.push(color); }
    if (sort_order !== undefined) { sets.push(`sort_order=$${i++}`); vals.push(sort_order); }
    if (is_final !== undefined) { sets.push(`is_final=$${i++}`); vals.push(is_final); }
    vals.push(req.params.id);
    await query(`UPDATE licitacao_stages SET ${sets.join(',')} WHERE id=$${i}`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/stages/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacao_stages WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/boards/:boardId/stages/reorder', requireAuth, async (req, res) => {
  try {
    const { order } = req.body; // array of { id, sort_order }
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    for (const item of order) {
      await query('UPDATE licitacao_stages SET sort_order=$1 WHERE id=$2 AND board_id=$3', [item.sort_order, item.id, req.params.boardId]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== LICITAÇÕES =====================

router.get('/boards/:boardId/items', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT l.*, u.name as assigned_to_name, cu.name as created_by_name,
        (SELECT COUNT(*) FROM licitacao_tasks t WHERE t.licitacao_id = l.id) as task_count,
        (SELECT COUNT(*) FROM licitacao_tasks t WHERE t.licitacao_id = l.id AND t.status = 'completed') as completed_task_count,
        (SELECT COUNT(*) FROM licitacao_checklist c WHERE c.licitacao_id = l.id) as checklist_count,
        (SELECT COUNT(*) FROM licitacao_checklist c WHERE c.licitacao_id = l.id AND c.is_checked = true) as checked_count
       FROM licitacoes l
       LEFT JOIN users u ON u.id = l.assigned_to
       LEFT JOIN users cu ON cu.id = l.created_by
       WHERE l.board_id = $1
       ORDER BY l.sort_order, l.created_at`,
      [req.params.boardId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/boards/:boardId/items', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { title, description, edital_number, edital_url, modality, opening_date, deadline_date, result_date, estimated_value, entity_name, entity_cnpj, entity_contact, entity_phone, entity_email, assigned_to, stage_id, notes, contact_id, contact_name, contact_phone } = req.body;
    // If no stage_id, use first stage
    let stageId = stage_id;
    if (!stageId) {
      const first = await query('SELECT id FROM licitacao_stages WHERE board_id=$1 ORDER BY sort_order LIMIT 1', [req.params.boardId]);
      stageId = first.rows[0]?.id || null;
    }
    const result = await query(
      `INSERT INTO licitacoes (board_id, organization_id, stage_id, title, description, edital_number, edital_url, modality, opening_date, deadline_date, result_date, estimated_value, entity_name, entity_cnpj, entity_contact, entity_phone, entity_email, assigned_to, notes, contact_id, contact_name, contact_phone, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
      [req.params.boardId, org.organization_id, stageId, title, description||null, edital_number||null, edital_url||null, modality||null, opening_date||null, deadline_date||null, result_date||null, estimated_value||0, entity_name||null, entity_cnpj||null, entity_contact||null, entity_phone||null, entity_email||null, assigned_to||null, notes||null, contact_id||null, contact_name||null, contact_phone||null, req.userId]
    );
    await addHistory(result.rows[0].id, req.userId, 'created', `Licitação "${title}" criada`);
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Create licitacao error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/items/:id', requireAuth, async (req, res) => {
  try {
    const fields = ['title','description','edital_number','edital_url','modality','opening_date','deadline_date','result_date','estimated_value','entity_name','entity_cnpj','entity_contact','entity_phone','entity_email','assigned_to','stage_id','status','notes','sort_order','contact_id','contact_name','contact_phone'];
    const sets = []; const vals = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f}=$${i++}`); vals.push(req.body[f]); }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    await query(`UPDATE licitacoes SET ${sets.join(',')} WHERE id=$${i}`, vals);
    if (req.body.stage_id) await addHistory(req.params.id, req.userId, 'moved', 'Licitação movida de etapa');
    if (req.body.status) await addHistory(req.params.id, req.userId, 'status', `Status alterado para ${req.body.status}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/items/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacoes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== TASKS =====================

router.get('/items/:licitacaoId/tasks', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, u.name as assigned_to_name FROM licitacao_tasks t LEFT JOIN users u ON u.id = t.assigned_to WHERE t.licitacao_id = $1 ORDER BY t.created_at`,
      [req.params.licitacaoId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items/:licitacaoId/tasks', requireAuth, async (req, res) => {
  try {
    const { title, description, priority, due_date, assigned_to } = req.body;
    const result = await query(
      `INSERT INTO licitacao_tasks (licitacao_id, title, description, priority, due_date, assigned_to, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.licitacaoId, title, description||null, priority||'medium', due_date||null, assigned_to||null, req.userId]
    );
    await addHistory(req.params.licitacaoId, req.userId, 'task_created', `Tarefa "${title}" criada`);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    const sets = []; const vals = []; let i = 1;
    if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title); }
    if (description !== undefined) { sets.push(`description=$${i++}`); vals.push(description); }
    if (status !== undefined) {
      sets.push(`status=$${i++}`); vals.push(status);
      if (status === 'completed') { sets.push(`completed_at=NOW()`); } else { sets.push(`completed_at=NULL`); }
    }
    if (priority !== undefined) { sets.push(`priority=$${i++}`); vals.push(priority); }
    if (due_date !== undefined) { sets.push(`due_date=$${i++}`); vals.push(due_date); }
    if (assigned_to !== undefined) { sets.push(`assigned_to=$${i++}`); vals.push(assigned_to); }
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    await query(`UPDATE licitacao_tasks SET ${sets.join(',')} WHERE id=$${i}`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacao_tasks WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== CHECKLIST =====================

router.get('/items/:licitacaoId/checklist', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, u.name as checked_by_name FROM licitacao_checklist c LEFT JOIN users u ON u.id = c.checked_by WHERE c.licitacao_id = $1 ORDER BY c.sort_order, c.created_at`,
      [req.params.licitacaoId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items/:licitacaoId/checklist', requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    const maxOrder = await query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM licitacao_checklist WHERE licitacao_id=$1', [req.params.licitacaoId]);
    const result = await query(
      `INSERT INTO licitacao_checklist (licitacao_id, title, sort_order) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.licitacaoId, title, maxOrder.rows[0].next]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/checklist/:id', requireAuth, async (req, res) => {
  try {
    const { is_checked, title } = req.body;
    const sets = []; const vals = []; let i = 1;
    if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title); }
    if (is_checked !== undefined) {
      sets.push(`is_checked=$${i++}`); vals.push(is_checked);
      if (is_checked) { sets.push(`checked_by=$${i++}`); vals.push(req.userId); sets.push(`checked_at=NOW()`); }
      else { sets.push(`checked_by=NULL`); sets.push(`checked_at=NULL`); }
    }
    vals.push(req.params.id);
    await query(`UPDATE licitacao_checklist SET ${sets.join(',')} WHERE id=$${i}`, vals);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/checklist/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacao_checklist WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== DOCUMENTS =====================

router.get('/items/:licitacaoId/documents', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, u.name as uploaded_by_name FROM licitacao_documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.licitacao_id = $1 ORDER BY d.created_at DESC`,
      [req.params.licitacaoId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items/:licitacaoId/documents', requireAuth, async (req, res) => {
  try {
    const { name, url, mimetype, size } = req.body;
    const result = await query(
      `INSERT INTO licitacao_documents (licitacao_id, name, url, mimetype, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.licitacaoId, name, url, mimetype||null, size||null, req.userId]
    );
    await addHistory(req.params.licitacaoId, req.userId, 'document', `Documento "${name}" enviado`);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/documents/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacao_documents WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== NOTES =====================

router.get('/items/:licitacaoId/notes', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT n.*, u.name as user_name FROM licitacao_notes n LEFT JOIN users u ON u.id = n.user_id WHERE n.licitacao_id = $1 ORDER BY n.created_at DESC`,
      [req.params.licitacaoId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/items/:licitacaoId/notes', requireAuth, async (req, res) => {
  try {
    const { content, note_type } = req.body;
    const result = await query(
      `INSERT INTO licitacao_notes (licitacao_id, user_id, content, note_type) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.licitacaoId, req.userId, content, note_type || 'note']
    );
    await addHistory(req.params.licitacaoId, req.userId, 'note', 'Nota adicionada');
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/notes/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM licitacao_notes WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== HISTORY =====================

router.get('/items/:licitacaoId/history', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM licitacao_history WHERE licitacao_id = $1 ORDER BY created_at DESC`,
      [req.params.licitacaoId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== ORG MEMBERS =====================

router.get('/org-members', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const colCheck = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_name='organization_members' AND column_name='is_active' LIMIT 1`
    );
    const sql = colCheck.rows.length > 0
      ? `SELECT u.id, u.name, u.email FROM users u JOIN organization_members om ON om.user_id = u.id WHERE om.organization_id = $1 AND COALESCE(om.is_active, true) = true ORDER BY u.name`
      : `SELECT u.id, u.name, u.email FROM users u JOIN organization_members om ON om.user_id = u.id WHERE om.organization_id = $1 ORDER BY u.name`;
    const result = await query(sql, [org.organization_id]);
    res.json(result.rows);
  } catch (e) {
    console.error('Licitacao org-members error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Search contacts for linking
router.get('/search-contacts', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const q = req.query.q || '';
    const result = await query(
      `SELECT c.id, c.name, c.phone FROM contacts c
       JOIN contact_lists cl ON cl.id = c.list_id
       WHERE cl.organization_id = $1 AND (c.name ILIKE $2 OR c.phone ILIKE $2)
       ORDER BY c.name LIMIT 20`,
      [org.organization_id, `%${q}%`]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
