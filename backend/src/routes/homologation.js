import { Router } from 'express';
import { query } from '../db.js';
import { authenticate as requireAuth } from '../middleware/auth.js';

const router = Router();

// Helper: get user org
async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

// ===================== BOARDS =====================

// List boards
router.get('/boards', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT b.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM homologation_companies hc WHERE hc.board_id = b.id) as company_count
       FROM homologation_boards b
       LEFT JOIN users u ON u.id = b.created_by
       WHERE b.organization_id = $1
       ORDER BY b.created_at DESC`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('List homologation boards error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create board
router.post('/boards', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { name, description, stages } = req.body;
    
    const board = await query(
      `INSERT INTO homologation_boards (organization_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [org.organization_id, name, description || null, req.userId]
    );

    // Create default stages or custom ones
    const defaultStages = stages || [
      { name: 'Contato Inicial', color: '#6366f1' },
      { name: 'Análise', color: '#f59e0b' },
      { name: 'Documentação', color: '#3b82f6' },
      { name: 'Aprovação', color: '#8b5cf6' },
      { name: 'Homologado', color: '#22c55e', is_final: true },
    ];

    for (let i = 0; i < defaultStages.length; i++) {
      await query(
        `INSERT INTO homologation_stages (board_id, name, color, sort_order, is_final)
         VALUES ($1, $2, $3, $4, $5)`,
        [board.rows[0].id, defaultStages[i].name, defaultStages[i].color || '#6366f1', i, defaultStages[i].is_final || false]
      );
    }

    res.json(board.rows[0]);
  } catch (e) {
    console.error('Create homologation board error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update board
router.patch('/boards/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, is_active } = req.body;
    const result = await query(
      `UPDATE homologation_boards SET name = COALESCE($1, name), description = COALESCE($2, description), is_active = COALESCE($3, is_active), updated_at = NOW() WHERE id = $4 RETURNING *`,
      [name, description, is_active, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete board
router.delete('/boards/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_boards WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== STAGES =====================

// List stages for a board
router.get('/boards/:boardId/stages', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT s.*, (SELECT COUNT(*) FROM homologation_companies hc WHERE hc.stage_id = s.id) as company_count
       FROM homologation_stages s WHERE s.board_id = $1 ORDER BY s.sort_order`,
      [req.params.boardId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create stage
router.post('/boards/:boardId/stages', requireAuth, async (req, res) => {
  try {
    const { name, color, is_final } = req.body;
    const maxOrder = await query(`SELECT COALESCE(MAX(sort_order), -1) + 1 as next FROM homologation_stages WHERE board_id = $1`, [req.params.boardId]);
    const result = await query(
      `INSERT INTO homologation_stages (board_id, name, color, sort_order, is_final) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.boardId, name, color || '#6366f1', maxOrder.rows[0].next, is_final || false]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update stage
router.patch('/stages/:id', requireAuth, async (req, res) => {
  try {
    const { name, color, sort_order, is_final } = req.body;
    const result = await query(
      `UPDATE homologation_stages SET name = COALESCE($1, name), color = COALESCE($2, color), sort_order = COALESCE($3, sort_order), is_final = COALESCE($4, is_final) WHERE id = $5 RETURNING *`,
      [name, color, sort_order, is_final, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete stage
router.delete('/stages/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_stages WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reorder stages
router.post('/boards/:boardId/stages/reorder', requireAuth, async (req, res) => {
  try {
    const { stageIds } = req.body;
    for (let i = 0; i < stageIds.length; i++) {
      await query(`UPDATE homologation_stages SET sort_order = $1 WHERE id = $2`, [i, stageIds[i]]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== COMPANIES =====================

// List companies for a board
router.get('/boards/:boardId/companies', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT hc.*, u.name as assigned_to_name, cu.name as created_by_name,
        (SELECT COUNT(*) FROM homologation_tasks ht WHERE ht.company_id = hc.id) as task_count,
        (SELECT COUNT(*) FROM homologation_tasks ht WHERE ht.company_id = hc.id AND ht.status = 'completed') as completed_task_count,
        (SELECT COUNT(*) FROM homologation_meetings hm WHERE hm.company_id = hc.id) as meeting_count
       FROM homologation_companies hc
       LEFT JOIN users u ON u.id = hc.assigned_to
       LEFT JOIN users cu ON cu.id = hc.created_by
       WHERE hc.board_id = $1
       ORDER BY hc.sort_order, hc.created_at`,
      [req.params.boardId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create company
router.post('/boards/:boardId/companies', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const { name, cnpj, contact_name, contact_email, contact_phone, address, city, state, zip_code, notes, stage_id, assigned_to } = req.body;
    
    // If no stage_id, use the first stage
    let finalStageId = stage_id;
    if (!finalStageId) {
      const firstStage = await query(
        `SELECT id FROM homologation_stages WHERE board_id = $1 ORDER BY sort_order LIMIT 1`,
        [req.params.boardId]
      );
      finalStageId = firstStage.rows[0]?.id;
    }

    const result = await query(
      `INSERT INTO homologation_companies (board_id, organization_id, stage_id, name, cnpj, contact_name, contact_email, contact_phone, address, city, state, zip_code, notes, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
      [req.params.boardId, org.organization_id, finalStageId, name, cnpj || null, contact_name || null, contact_email || null, contact_phone || null, address || null, city || null, state || null, zip_code || null, notes || null, assigned_to || null, req.userId]
    );

    // Add history
    const userName = (await query(`SELECT name FROM users WHERE id = $1`, [req.userId])).rows[0]?.name;
    await query(
      `INSERT INTO homologation_history (company_id, user_id, user_name, action, details) VALUES ($1, $2, $3, 'created', $4)`,
      [result.rows[0].id, req.userId, userName, `Empresa "${name}" adicionada ao quadro`]
    );

    res.json(result.rows[0]);
  } catch (e) {
    console.error('Create homologation company error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update company
router.patch('/companies/:id', requireAuth, async (req, res) => {
  try {
    const { name, cnpj, contact_name, contact_email, contact_phone, address, city, state, zip_code, notes, stage_id, assigned_to, sort_order } = req.body;
    
    // Check if stage changed for history
    let oldStage = null;
    if (stage_id) {
      const old = await query(`SELECT stage_id FROM homologation_companies WHERE id = $1`, [req.params.id]);
      oldStage = old.rows[0]?.stage_id;
    }

    const result = await query(
      `UPDATE homologation_companies SET 
        name = COALESCE($1, name), cnpj = COALESCE($2, cnpj),
        contact_name = COALESCE($3, contact_name), contact_email = COALESCE($4, contact_email),
        contact_phone = COALESCE($5, contact_phone), notes = COALESCE($6, notes),
        stage_id = COALESCE($7, stage_id), assigned_to = COALESCE($8, assigned_to),
        sort_order = COALESCE($9, sort_order),
        address = COALESCE($10, address), city = COALESCE($11, city),
        state = COALESCE($12, state), zip_code = COALESCE($13, zip_code),
        updated_at = NOW()
       WHERE id = $14 RETURNING *`,
      [name, cnpj, contact_name, contact_email, contact_phone, notes, stage_id, assigned_to, sort_order, address, city, state, zip_code, req.params.id]
    );

    // History for stage change
    if (stage_id && oldStage && stage_id !== oldStage) {
      const userName = (await query(`SELECT name FROM users WHERE id = $1`, [req.userId])).rows[0]?.name;
      const newStageName = (await query(`SELECT name FROM homologation_stages WHERE id = $1`, [stage_id])).rows[0]?.name;
      await query(
        `INSERT INTO homologation_history (company_id, user_id, user_name, action, details) VALUES ($1, $2, $3, 'stage_changed', $4)`,
        [req.params.id, req.userId, userName, `Movido para "${newStageName}"`]
      );

      // Check if final stage
      const isFinal = (await query(`SELECT is_final FROM homologation_stages WHERE id = $1`, [stage_id])).rows[0]?.is_final;
      if (isFinal) {
        await query(`UPDATE homologation_companies SET completed_at = NOW() WHERE id = $1`, [req.params.id]);
      } else {
        await query(`UPDATE homologation_companies SET completed_at = NULL WHERE id = $1`, [req.params.id]);
      }
    }

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete company
router.delete('/companies/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_companies WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== TASKS =====================

// List tasks for a company
router.get('/companies/:companyId/tasks', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT t.*, u.name as assigned_to_name FROM homologation_tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE t.company_id = $1 ORDER BY t.created_at DESC`,
      [req.params.companyId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create task
router.post('/companies/:companyId/tasks', requireAuth, async (req, res) => {
  try {
    const { title, description, priority, due_date, assigned_to } = req.body;
    const result = await query(
      `INSERT INTO homologation_tasks (company_id, title, description, priority, due_date, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.companyId, title, description || null, priority || 'medium', due_date || null, assigned_to || null, req.userId]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update task
router.patch('/tasks/:id', requireAuth, async (req, res) => {
  try {
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
    const result = await query(
      `UPDATE homologation_tasks SET 
        title = COALESCE($1, title), description = COALESCE($2, description),
        status = COALESCE($3, status), priority = COALESCE($4, priority),
        due_date = COALESCE($5, due_date), assigned_to = COALESCE($6, assigned_to),
        completed_at = CASE WHEN $3 = 'completed' THEN NOW() WHEN $3 IS NOT NULL THEN NULL ELSE completed_at END,
        updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [title, description, status, priority, due_date, assigned_to, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete task
router.delete('/tasks/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_tasks WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== MEETINGS LINK =====================

// List meetings for a company
router.get('/companies/:companyId/meetings', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT m.*, hm.id as link_id FROM homologation_meetings hm
       JOIN meetings m ON m.id = hm.meeting_id
       WHERE hm.company_id = $1
       ORDER BY m.meeting_date DESC, m.start_time DESC`,
      [req.params.companyId]
    );
    res.json(result.rows);
  } catch (e) {
    console.error('List homologation meetings error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create meeting directly from homologation
router.post('/companies/:companyId/meetings/create', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { title, description, meeting_date, start_time, end_time, location } = req.body;
    
    // Create meeting in meetings table
    const meeting = await query(
      `INSERT INTO meetings (organization_id, title, description, meeting_date, start_time, end_time, location, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8) RETURNING *`,
      [org.organization_id, title, description || null, meeting_date, start_time, end_time || start_time, location || null, req.userId]
    );
    
    // Link to homologation company
    await query(
      `INSERT INTO homologation_meetings (company_id, meeting_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.companyId, meeting.rows[0].id]
    );

    // History
    const userName = (await query(`SELECT name FROM users WHERE id = $1`, [req.userId])).rows[0]?.name;
    await query(
      `INSERT INTO homologation_history (company_id, user_id, user_name, action, details) VALUES ($1, $2, $3, 'meeting_created', $4)`,
      [req.params.companyId, req.userId, userName, `Reunião "${title}" agendada`]
    );

    res.json(meeting.rows[0]);
  } catch (e) {
    console.error('Create homologation meeting error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Link existing meeting
router.post('/companies/:companyId/meetings', requireAuth, async (req, res) => {
  try {
    const { meeting_id } = req.body;
    const result = await query(
      `INSERT INTO homologation_meetings (company_id, meeting_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *`,
      [req.params.companyId, meeting_id]
    );
    res.json(result.rows[0] || { success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Unlink meeting
router.delete('/meetings-link/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_meetings WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== DOCUMENTS =====================

// List documents for a company
router.get('/companies/:companyId/documents', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT d.*, u.name as uploaded_by_name FROM homologation_documents d
       LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.company_id = $1 ORDER BY d.created_at DESC`,
      [req.params.companyId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add document
router.post('/companies/:companyId/documents', requireAuth, async (req, res) => {
  try {
    const { name, url, mimetype, size } = req.body;
    const result = await query(
      `INSERT INTO homologation_documents (company_id, name, url, mimetype, size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.companyId, name, url, mimetype || null, size || null, req.userId]
    );

    // History
    const userName = (await query(`SELECT name FROM users WHERE id = $1`, [req.userId])).rows[0]?.name;
    await query(
      `INSERT INTO homologation_history (company_id, user_id, user_name, action, details) VALUES ($1, $2, $3, 'document_added', $4)`,
      [req.params.companyId, req.userId, userName, `Documento "${name}" adicionado`]
    );

    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete document
router.delete('/documents/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_documents WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== NOTES =====================

// List notes for a company
router.get('/companies/:companyId/notes', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT n.*, u.name as user_name FROM homologation_notes n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.company_id = $1 ORDER BY n.created_at DESC`,
      [req.params.companyId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Add note
router.post('/companies/:companyId/notes', requireAuth, async (req, res) => {
  try {
    const { content } = req.body;
    const result = await query(
      `INSERT INTO homologation_notes (company_id, user_id, content)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.companyId, req.userId, content]
    );

    // History
    const userName = (await query(`SELECT name FROM users WHERE id = $1`, [req.userId])).rows[0]?.name;
    await query(
      `INSERT INTO homologation_history (company_id, user_id, user_name, action, details) VALUES ($1, $2, $3, 'note_added', $4)`,
      [req.params.companyId, req.userId, userName, `Nota adicionada`]
    );

    res.json({ ...result.rows[0], user_name: userName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Delete note
router.delete('/notes/:id', requireAuth, async (req, res) => {
  try {
    await query(`DELETE FROM homologation_notes WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== HISTORY =====================

router.get('/companies/:companyId/history', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM homologation_history WHERE company_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.companyId]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== ORG MEMBERS (for assignment) =====================

router.get('/org-members', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    // Check if is_active column exists to avoid errors
    const colCheck = await query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'organization_members' AND column_name = 'is_active' LIMIT 1`
    );
    const hasIsActive = colCheck.rows.length > 0;

    const sql = hasIsActive
      ? `SELECT u.id, u.name, u.email FROM users u
         JOIN organization_members om ON om.user_id = u.id
         WHERE om.organization_id = $1 AND COALESCE(om.is_active, true) = true ORDER BY u.name`
      : `SELECT u.id, u.name, u.email FROM users u
         JOIN organization_members om ON om.user_id = u.id
         WHERE om.organization_id = $1 ORDER BY u.name`;

    const result = await query(sql, [org.organization_id]);
    res.json(result.rows);
  } catch (e) {
    console.error('Homologation org-members error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
