import express from 'express';
import { query, pool } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';
import * as whatsappProvider from '../lib/whatsapp-provider.js';

const router = express.Router();
router.use(authenticate);

// Helper: Get user's organization
async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// Helper: Get org sellers for round-robin distribution
async function getOrgSellers(orgId) {
  const result = await query(
    `SELECT u.id, u.name, u.whatsapp_phone FROM users u
     JOIN organization_members om ON om.user_id = u.id
     WHERE om.organization_id = $1 AND om.role IN ('agent', 'user', 'manager', 'supervisor')
     ORDER BY u.name`,
    [orgId]
  );
  return result.rows;
}

// Helper: Round-robin assignment
async function getNextSeller(orgId) {
  const sellers = await getOrgSellers(orgId);
  if (sellers.length === 0) return null;

  // Count current assignments to find the seller with fewest
  const counts = await query(
    `SELECT assigned_to, COUNT(*) as cnt FROM field_captures
     WHERE organization_id = $1 AND assigned_to IS NOT NULL
     GROUP BY assigned_to`,
    [orgId]
  );
  const countMap = {};
  counts.rows.forEach(r => { countMap[r.assigned_to] = parseInt(r.cnt); });

  // Find seller with fewest assignments
  let minCount = Infinity;
  let chosen = sellers[0];
  for (const s of sellers) {
    const c = countMap[s.id] || 0;
    if (c < minCount) { minCount = c; chosen = s; }
  }
  return chosen;
}

// Helper: Send WhatsApp notification
async function notifyViaWhatsApp(orgId, userId, message) {
  try {
    const user = await query('SELECT whatsapp_phone FROM users WHERE id = $1', [userId]);
    const phone = user.rows[0]?.whatsapp_phone;
    if (!phone) return;

    // Find an active connection
    const conn = await query(
      `SELECT * FROM connections WHERE organization_id = $1 AND status = 'connected' LIMIT 1`,
      [orgId]
    );
    if (conn.rows.length === 0) return;

    await whatsappProvider.sendMessage(conn.rows[0], phone, message, 'text');
    logInfo('captador.whatsapp_notification_sent', { userId, phone });
  } catch (err) {
    logError('captador.whatsapp_notification_failed', err);
  }
}

// Helper: Auto-create task card
async function createTaskCard(orgId, userId, capture) {
  try {
    // Find a global board or the first board
    let board = await query(
      `SELECT tb.id FROM task_boards tb WHERE tb.organization_id = $1 AND tb.is_global = true LIMIT 1`,
      [orgId]
    );
    if (board.rows.length === 0) {
      board = await query(
        `SELECT tb.id FROM task_boards tb WHERE tb.organization_id = $1 LIMIT 1`,
        [orgId]
      );
    }
    if (board.rows.length === 0) return null;

    const boardId = board.rows[0].id;

    // Find first column
    const col = await query(
      `SELECT id FROM task_board_columns WHERE board_id = $1 ORDER BY position LIMIT 1`,
      [boardId]
    );
    if (col.rows.length === 0) return null;

    const maxPos = await query(
      `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM task_cards WHERE column_id = $1`,
      [col.rows[0].id]
    );

    const title = `📍 Captação: ${capture.company_name || capture.address || 'Nova obra'}`;
    const desc = [
      capture.address ? `Endereço: ${capture.address}` : '',
      capture.construction_stage ? `Etapa: ${capture.construction_stage}` : '',
      capture.contact_name ? `Contato: ${capture.contact_name}` : '',
      capture.contact_phone ? `Tel: ${capture.contact_phone}` : '',
      capture.notes || '',
    ].filter(Boolean).join('\n');

    const result = await pool.query(
      `INSERT INTO task_cards (organization_id, board_id, column_id, position, title, description, assigned_to, created_by, priority, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'medium', 'task') RETURNING *`,
      [orgId, boardId, col.rows[0].id, maxPos.rows[0].next_pos, title, desc, userId, userId]
    );

    logInfo('captador.task_created', { captureId: capture.id, taskId: result.rows[0].id });
    return result.rows[0];
  } catch (err) {
    logError('captador.task_create_failed', err);
    return null;
  }
}

// GET /api/captador - List all captures
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { status, user_id, assigned_to, unassigned, start_date, end_date, segment } = req.query;
    let sql = `
      SELECT fc.*, u.name as created_by_name,
        au.name as assigned_to_name,
        (SELECT COUNT(*) FROM field_capture_visits fcv WHERE fcv.capture_id = fc.id) as visit_count,
        (SELECT json_agg(json_build_object('id', fca.id, 'file_url', fca.file_url, 'file_name', fca.file_name, 'file_type', fca.file_type))
         FROM field_capture_attachments fca WHERE fca.capture_id = fc.id) as attachments
      FROM field_captures fc
      JOIN users u ON u.id = fc.created_by
      LEFT JOIN users au ON au.id = fc.assigned_to
      WHERE fc.organization_id = $1
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (status) { sql += ` AND fc.status = $${idx++}`; params.push(status); }
    if (user_id) { sql += ` AND fc.created_by = $${idx++}`; params.push(user_id); }
    if (assigned_to) { sql += ` AND fc.assigned_to = $${idx++}`; params.push(assigned_to); }
    if (unassigned === 'true') { sql += ` AND fc.assigned_to IS NULL`; }
    if (start_date) { sql += ` AND fc.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { sql += ` AND fc.created_at <= $${idx++}::date + interval '1 day'`; params.push(end_date); }
    if (segment) { sql += ` AND fc.segment = $${idx++}`; params.push(segment); }

    sql += ` ORDER BY fc.created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('captador.list', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/sellers - Get org sellers for assignment
router.get('/sellers', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const sellers = await getOrgSellers(org.organization_id);
    res.json(sellers);
  } catch (error) {
    logError('captador.sellers', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/settings - Get distribution settings
router.get('/settings', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT * FROM captador_settings WHERE organization_id = $1`,
      [org.organization_id]
    );
    res.json(result.rows[0] || { auto_distribute: false, auto_create_task: true, notify_whatsapp: true });
  } catch (error) {
    // Table may not exist yet
    res.json({ auto_distribute: false, auto_create_task: true, notify_whatsapp: true });
  }
});

// PUT /api/captador/settings - Update distribution settings
router.put('/settings', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { auto_distribute, auto_create_task, notify_whatsapp } = req.body;
    const result = await query(
      `INSERT INTO captador_settings (organization_id, auto_distribute, auto_create_task, notify_whatsapp)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id) DO UPDATE SET
         auto_distribute = EXCLUDED.auto_distribute,
         auto_create_task = EXCLUDED.auto_create_task,
         notify_whatsapp = EXCLUDED.notify_whatsapp
       RETURNING *`,
      [org.organization_id, auto_distribute ?? false, auto_create_task ?? true, notify_whatsapp ?? true]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logError('captador.settings', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/map/points - MUST be before /:id
router.get('/map/points', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id, start_date, end_date, segment } = req.query;
    let sql = `
      SELECT fc.id, fc.latitude, fc.longitude, fc.address, fc.company_name, fc.contact_name,
        fc.construction_stage, fc.status, fc.segment, fc.created_at, u.name as created_by_name,
        au.name as assigned_to_name,
        (SELECT COUNT(*) FROM field_capture_visits fcv WHERE fcv.capture_id = fc.id) as visit_count,
        (SELECT fca.file_url FROM field_capture_attachments fca WHERE fca.capture_id = fc.id AND fca.file_type = 'photo' LIMIT 1) as thumbnail
      FROM field_captures fc
      JOIN users u ON u.id = fc.created_by
      LEFT JOIN users au ON au.id = fc.assigned_to
      WHERE fc.organization_id = $1 AND fc.latitude IS NOT NULL
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (user_id) { sql += ` AND (fc.created_by = $${idx} OR fc.assigned_to = $${idx})`; params.push(user_id); idx++; }
    if (start_date) { sql += ` AND fc.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { sql += ` AND fc.created_at <= $${idx++}::date + interval '1 day'`; params.push(end_date); }
    if (segment) { sql += ` AND fc.segment = $${idx++}`; params.push(segment); }

    sql += ` ORDER BY fc.created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('captador.map_points', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/returns/today - Get today's scheduled returns
router.get('/returns/today', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT fc.*, u.name as created_by_name, au.name as assigned_to_name,
        (SELECT COUNT(*) FROM field_capture_visits fcv WHERE fcv.capture_id = fc.id) as visit_count,
        (SELECT json_agg(json_build_object('id', fca.id, 'file_url', fca.file_url, 'file_name', fca.file_name, 'file_type', fca.file_type))
         FROM field_capture_attachments fca WHERE fca.capture_id = fc.id) as attachments
       FROM field_captures fc
       JOIN users u ON u.id = fc.created_by
       LEFT JOIN users au ON au.id = fc.assigned_to
       WHERE fc.organization_id = $1
         AND fc.return_date = CURRENT_DATE
         AND fc.status != 'archived'
       ORDER BY fc.return_date, fc.company_name`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (error) {
    logError('captador.returns_today', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/stats/summary - MUST be before /:id
router.get('/stats/summary', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id } = req.query;
    let userFilter = '';
    const params = [org.organization_id];
    if (user_id) { userFilter = ' AND fc.created_by = $2'; params.push(user_id); }

    const stats = await query(
      `SELECT
        COUNT(*) as total_captures,
        COUNT(CASE WHEN fc.status = 'new' THEN 1 END) as new_count,
        COUNT(CASE WHEN fc.status = 'in_progress' THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN fc.status = 'converted' THEN 1 END) as converted_count,
        COUNT(CASE WHEN fc.assigned_to IS NULL THEN 1 END) as unassigned_count,
        COUNT(DISTINCT fc.created_by) as total_scouts,
        COUNT(CASE WHEN fc.return_date = CURRENT_DATE THEN 1 END) as returns_today,
        (SELECT COUNT(*) FROM field_capture_visits fcv JOIN field_captures fc2 ON fc2.id = fcv.capture_id WHERE fc2.organization_id = $1${user_id ? ' AND fcv.visited_by = $2' : ''}) as total_visits
       FROM field_captures fc
       WHERE fc.organization_id = $1${userFilter}`,
      params
    );

    res.json(stats.rows[0]);
  } catch (error) {
    logError('captador.stats', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/:id - Get single capture with visits
router.get('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const capture = await query(
      `SELECT fc.*, u.name as created_by_name, au.name as assigned_to_name
       FROM field_captures fc
       JOIN users u ON u.id = fc.created_by
       LEFT JOIN users au ON au.id = fc.assigned_to
       WHERE fc.id = $1 AND fc.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (capture.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });

    const attachments = await query(
      `SELECT * FROM field_capture_attachments WHERE capture_id = $1 ORDER BY created_at`,
      [req.params.id]
    );

    const visits = await query(
      `SELECT fcv.*, u.name as visited_by_name,
        (SELECT json_agg(json_build_object('id', fva.id, 'file_url', fva.file_url, 'file_name', fva.file_name, 'file_type', fva.file_type))
         FROM field_capture_visit_attachments fva WHERE fva.visit_id = fcv.id) as attachments
       FROM field_capture_visits fcv
       JOIN users u ON u.id = fcv.visited_by
       WHERE fcv.capture_id = $1
       ORDER BY fcv.created_at DESC`,
      [req.params.id]
    );

    res.json({
      ...capture.rows[0],
      attachments: attachments.rows,
      visits: visits.rows,
    });
  } catch (error) {
    logError('captador.get', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/captador - Create capture
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const {
      latitude, longitude, address,
      construction_stage, stage_notes,
      contact_name, contact_phone, contact_email, contact_role,
      company_name, company_cnpj,
      notes, attachments,
    } = req.body;

    // Check settings for auto-distribution
    let assignedTo = null;
    let settings = { auto_distribute: false, auto_create_task: true, notify_whatsapp: true };
    try {
      const settingsRes = await query(
        `SELECT * FROM captador_settings WHERE organization_id = $1`,
        [org.organization_id]
      );
      if (settingsRes.rows.length > 0) settings = settingsRes.rows[0];
    } catch { /* table may not exist */ }

    if (settings.auto_distribute) {
      const seller = await getNextSeller(org.organization_id);
      if (seller) assignedTo = seller.id;
    }

    const result = await query(
      `INSERT INTO field_captures (organization_id, created_by, latitude, longitude, address,
        construction_stage, stage_notes, contact_name, contact_phone, contact_email, contact_role,
        company_name, company_cnpj, notes, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [org.organization_id, req.userId, latitude, longitude, address,
       construction_stage, stage_notes, contact_name, contact_phone, contact_email, contact_role,
       company_name, company_cnpj, notes, assignedTo]
    );

    const capture = result.rows[0];

    // Save attachments
    if (attachments?.length) {
      for (const att of attachments) {
        await query(
          `INSERT INTO field_capture_attachments (capture_id, file_url, file_name, file_type, mime_type, file_size)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [capture.id, att.file_url, att.file_name, att.file_type, att.mime_type, att.file_size]
        );
      }
    }

    // Auto-create task
    if (settings.auto_create_task) {
      await createTaskCard(org.organization_id, assignedTo || req.userId, capture);
    }

    // WhatsApp notification
    if (settings.notify_whatsapp && assignedTo) {
      const msg = `📍 *Nova Ficha de Campo*\n\n${company_name ? `🏢 ${company_name}\n` : ''}${address ? `📍 ${address}\n` : ''}${construction_stage ? `🔧 Etapa: ${construction_stage}\n` : ''}${contact_name ? `👤 ${contact_name}\n` : ''}${contact_phone ? `📞 ${contact_phone}\n` : ''}\nFicha atribuída para você. Acesse o sistema para mais detalhes.`;
      await notifyViaWhatsApp(org.organization_id, assignedTo, msg);
    }

    logInfo('captador.created', { id: capture.id, assigned_to: assignedTo });
    res.json(capture);
  } catch (error) {
    logError('captador.create', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/captador/:id - Update capture
router.put('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const {
      construction_stage, stage_notes,
      contact_name, contact_phone, contact_email, contact_role,
      company_name, company_cnpj,
      notes, status, deal_id, address, assigned_to,
    } = req.body;

    // Check if assignment changed to send notification
    let oldCapture = null;
    if (assigned_to !== undefined) {
      const old = await query(`SELECT assigned_to FROM field_captures WHERE id = $1`, [req.params.id]);
      oldCapture = old.rows[0];
    }

    const result = await query(
      `UPDATE field_captures SET
        construction_stage = COALESCE($3, construction_stage),
        stage_notes = COALESCE($4, stage_notes),
        contact_name = COALESCE($5, contact_name),
        contact_phone = COALESCE($6, contact_phone),
        contact_email = COALESCE($7, contact_email),
        contact_role = COALESCE($8, contact_role),
        company_name = COALESCE($9, company_name),
        company_cnpj = COALESCE($10, company_cnpj),
        notes = COALESCE($11, notes),
        status = COALESCE($12, status),
        deal_id = COALESCE($13, deal_id),
        address = COALESCE($14, address),
        assigned_to = $15
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, org.organization_id, construction_stage, stage_notes,
       contact_name, contact_phone, contact_email, contact_role,
       company_name, company_cnpj, notes, status, deal_id, address,
       assigned_to !== undefined ? assigned_to : null]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });

    // Notify new assignee via WhatsApp
    if (assigned_to && oldCapture && oldCapture.assigned_to !== assigned_to) {
      const capture = result.rows[0];
      const msg = `📍 *Ficha de Campo Atribuída*\n\n${capture.company_name ? `🏢 ${capture.company_name}\n` : ''}${capture.address ? `📍 ${capture.address}\n` : ''}${capture.construction_stage ? `🔧 Etapa: ${capture.construction_stage}\n` : ''}\nUma ficha foi atribuída para você.`;
      await notifyViaWhatsApp(org.organization_id, assigned_to, msg);
    }

    res.json(result.rows[0]);
  } catch (error) {
    logError('captador.update', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/captador/:id/attachments - Add attachment
router.post('/:id/attachments', async (req, res) => {
  try {
    const { file_url, file_name, file_type, mime_type, file_size } = req.body;
    const result = await query(
      `INSERT INTO field_capture_attachments (capture_id, file_url, file_name, file_type, mime_type, file_size)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, file_url, file_name, file_type, mime_type, file_size]
    );
    res.json(result.rows[0]);
  } catch (error) {
    logError('captador.attachment', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/captador/attachments/:attachmentId
router.delete('/attachments/:attachmentId', async (req, res) => {
  try {
    await query('DELETE FROM field_capture_attachments WHERE id = $1', [req.params.attachmentId]);
    res.json({ success: true });
  } catch (error) {
    logError('captador.delete_attachment', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/captador/:id/visits - Add a revisit
router.post('/:id/visits', async (req, res) => {
  try {
    const { construction_stage, notes, latitude, longitude, attachments } = req.body;

    const result = await query(
      `INSERT INTO field_capture_visits (capture_id, visited_by, construction_stage, notes, latitude, longitude)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, req.userId, construction_stage, notes, latitude, longitude]
    );

    const visit = result.rows[0];

    await query(
      `UPDATE field_captures SET construction_stage = $2 WHERE id = $1`,
      [req.params.id, construction_stage]
    );

    if (attachments?.length) {
      for (const att of attachments) {
        await query(
          `INSERT INTO field_capture_visit_attachments (visit_id, file_url, file_name, file_type, mime_type, file_size)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [visit.id, att.file_url, att.file_name, att.file_type, att.mime_type, att.file_size]
        );
      }
    }

    // Notify assigned seller via WhatsApp
    try {
      const capture = await query(
        `SELECT fc.*, u.name as captador_name, au.whatsapp_phone as seller_phone, au.name as seller_name
         FROM field_captures fc
         JOIN users u ON u.id = fc.created_by
         LEFT JOIN users au ON au.id = fc.assigned_to
         WHERE fc.id = $1`,
        [req.params.id]
      );
      const cap = capture.rows[0];
      if (cap?.seller_phone && cap.assigned_to) {
        const org = await getUserOrg(req.userId);
        if (org) {
          const visitor = await query('SELECT name FROM users WHERE id = $1', [req.userId]);
          const visitorName = visitor.rows[0]?.name || 'Captador';
          const message = `📍 *Check-in de Retorno*\n\n` +
            `O captador *${visitorName}* esteve no local:\n` +
            `📌 ${cap.address || 'Sem endereço'}\n` +
            `🏗️ Etapa: ${construction_stage || '—'}\n` +
            `📝 ${notes || 'Sem observações'}\n` +
            (attachments?.length ? `📸 ${attachments.length} foto(s) anexada(s)\n` : '') +
            `\nFicha: ${cap.company_name || cap.address || 'Obra'}`;

          const phone = cap.seller_phone.replace(/\D/g, '');
          const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;

          await whatsappProvider.sendText(org.organization_id, jid, message);
          logInfo('captador.visit_notification_sent', { capture_id: req.params.id, seller: cap.seller_name });
        }
      }
    } catch (notifyErr) {
      logError('captador.visit_notification_failed', notifyErr);
      // Don't fail the visit registration if notification fails
    }

    logInfo('captador.visit_added', { capture_id: req.params.id, visit_id: visit.id });
    res.json(visit);
  } catch (error) {
    logError('captador.add_visit', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/captador/:id/schedule-return - Schedule a return visit
router.post('/:id/schedule-return', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { return_date, return_notes } = req.body;
    const result = await query(
      `UPDATE field_captures SET return_date = $3, return_notes = $4 WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, org.organization_id, return_date, return_notes || null]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    logError('captador.schedule_return', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/captador/:id
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await query('DELETE FROM field_captures WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    res.json({ success: true });
  } catch (error) {
    logError('captador.delete', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
