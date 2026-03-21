import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logError } from '../logger.js';

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

// GET /api/captador - List all captures
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { status, user_id, start_date, end_date } = req.query;
    let sql = `
      SELECT fc.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM field_capture_visits fcv WHERE fcv.capture_id = fc.id) as visit_count,
        (SELECT json_agg(json_build_object('id', fca.id, 'file_url', fca.file_url, 'file_name', fca.file_name, 'file_type', fca.file_type))
         FROM field_capture_attachments fca WHERE fca.capture_id = fc.id) as attachments
      FROM field_captures fc
      JOIN users u ON u.id = fc.created_by
      WHERE fc.organization_id = $1
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (status) { sql += ` AND fc.status = $${idx++}`; params.push(status); }
    if (user_id) { sql += ` AND fc.created_by = $${idx++}`; params.push(user_id); }
    if (start_date) { sql += ` AND fc.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { sql += ` AND fc.created_at <= $${idx++}::date + interval '1 day'`; params.push(end_date); }

    sql += ` ORDER BY fc.created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('captador.list', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/map/points - MUST be before /:id
router.get('/map/points', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id, start_date, end_date } = req.query;
    let sql = `
      SELECT fc.id, fc.latitude, fc.longitude, fc.address, fc.company_name, fc.contact_name,
        fc.construction_stage, fc.status, fc.created_at, u.name as created_by_name,
        (SELECT COUNT(*) FROM field_capture_visits fcv WHERE fcv.capture_id = fc.id) as visit_count,
        (SELECT fca.file_url FROM field_capture_attachments fca WHERE fca.capture_id = fc.id AND fca.file_type = 'photo' LIMIT 1) as thumbnail
      FROM field_captures fc
      JOIN users u ON u.id = fc.created_by
      WHERE fc.organization_id = $1 AND fc.latitude IS NOT NULL
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (user_id) { sql += ` AND fc.created_by = $${idx++}`; params.push(user_id); }
    if (start_date) { sql += ` AND fc.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { sql += ` AND fc.created_at <= $${idx++}::date + interval '1 day'`; params.push(end_date); }

    sql += ` ORDER BY fc.created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('captador.map_points', error);
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
        COUNT(DISTINCT fc.created_by) as total_scouts,
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
      `SELECT fc.*, u.name as created_by_name
       FROM field_captures fc
       JOIN users u ON u.id = fc.created_by
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

    const result = await query(
      `INSERT INTO field_captures (organization_id, created_by, latitude, longitude, address,
        construction_stage, stage_notes, contact_name, contact_phone, contact_email, contact_role,
        company_name, company_cnpj, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [org.organization_id, req.userId, latitude, longitude, address,
       construction_stage, stage_notes, contact_name, contact_phone, contact_email, contact_role,
       company_name, company_cnpj, notes]
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

    logInfo('captador.created', { id: capture.id });
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
      notes, status, deal_id, address,
    } = req.body;

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
        address = COALESCE($14, address)
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [req.params.id, org.organization_id, construction_stage, stage_notes,
       contact_name, contact_phone, contact_email, contact_role,
       company_name, company_cnpj, notes, status, deal_id, address]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Não encontrado' });
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

    // Update main capture stage
    await query(
      `UPDATE field_captures SET construction_stage = $2 WHERE id = $1`,
      [req.params.id, construction_stage]
    );

    // Save visit attachments
    if (attachments?.length) {
      for (const att of attachments) {
        await query(
          `INSERT INTO field_capture_visit_attachments (visit_id, file_url, file_name, file_type, mime_type, file_size)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [visit.id, att.file_url, att.file_name, att.file_type, att.mime_type, att.file_size]
        );
      }
    }

    logInfo('captador.visit_added', { capture_id: req.params.id, visit_id: visit.id });
    res.json(visit);
  } catch (error) {
    logError('captador.add_visit', error);
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

// GET /api/captador/map/points - Get all captures for map view
router.get('/map/points', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id, start_date, end_date } = req.query;
    let sql = `
      SELECT fc.id, fc.latitude, fc.longitude, fc.address, fc.company_name, fc.contact_name,
        fc.construction_stage, fc.status, fc.created_at, u.name as created_by_name,
        (SELECT COUNT(*) FROM field_capture_visits fcv WHERE fcv.capture_id = fc.id) as visit_count,
        (SELECT fca.file_url FROM field_capture_attachments fca WHERE fca.capture_id = fc.id AND fca.file_type = 'photo' LIMIT 1) as thumbnail
      FROM field_captures fc
      JOIN users u ON u.id = fc.created_by
      WHERE fc.organization_id = $1 AND fc.latitude IS NOT NULL
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (user_id) { sql += ` AND fc.created_by = $${idx++}`; params.push(user_id); }
    if (start_date) { sql += ` AND fc.created_at >= $${idx++}`; params.push(start_date); }
    if (end_date) { sql += ` AND fc.created_at <= $${idx++}::date + interval '1 day'`; params.push(end_date); }

    sql += ` ORDER BY fc.created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    logError('captador.map_points', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/captador/stats/summary
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
        COUNT(DISTINCT fc.created_by) as total_scouts,
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

export default router;
