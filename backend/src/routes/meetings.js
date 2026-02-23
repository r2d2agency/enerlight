import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

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

// ============================================
// LIST MEETINGS (with filters)
// ============================================
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { search, participant, date_from, date_to, status } = req.query;
    let sql = `
      SELECT m.*,
        u.name as created_by_name,
        d.title as deal_title,
        p.title as project_title,
        (SELECT COUNT(*) FROM meeting_participants mp WHERE mp.meeting_id = m.id) as participant_count,
        (SELECT COUNT(*) FROM meeting_tasks mt WHERE mt.meeting_id = m.id) as total_tasks,
        (SELECT COUNT(*) FROM meeting_tasks mt WHERE mt.meeting_id = m.id AND mt.status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM meeting_attachments ma WHERE ma.meeting_id = m.id) as attachment_count
      FROM meetings m
      LEFT JOIN users u ON u.id = m.created_by
      LEFT JOIN crm_deals d ON d.id = m.deal_id
      LEFT JOIN projects p ON p.id = m.project_id
      WHERE m.organization_id = $1
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (search) {
      sql += ` AND (m.title ILIKE $${idx} OR m.description ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (status) {
      sql += ` AND m.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (date_from) {
      sql += ` AND m.meeting_date >= $${idx}`;
      params.push(date_from);
      idx++;
    }
    if (date_to) {
      sql += ` AND m.meeting_date <= $${idx}`;
      params.push(date_to);
      idx++;
    }
    if (participant) {
      sql += ` AND EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = $${idx})`;
      params.push(participant);
      idx++;
    }

    sql += ` ORDER BY m.meeting_date DESC, m.start_time DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing meetings:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET SINGLE MEETING
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT m.*,
        u.name as created_by_name,
        d.title as deal_title,
        p.title as project_title
      FROM meetings m
      LEFT JOIN users u ON u.id = m.created_by
      LEFT JOIN crm_deals d ON d.id = m.deal_id
      LEFT JOIN projects p ON p.id = m.project_id
      WHERE m.id = $1 AND m.organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Reunião não encontrada' });

    const meeting = result.rows[0];

    // Get participants
    const participants = await query(
      `SELECT mp.*, u.name, u.email FROM meeting_participants mp JOIN users u ON u.id = mp.user_id WHERE mp.meeting_id = $1 ORDER BY u.name`,
      [meeting.id]
    );
    meeting.participants = participants.rows;

    // Get attachments
    const attachments = await query(
      `SELECT ma.*, u.name as uploaded_by_name FROM meeting_attachments ma LEFT JOIN users u ON u.id = ma.uploaded_by WHERE ma.meeting_id = $1 ORDER BY ma.created_at DESC`,
      [meeting.id]
    );
    meeting.attachments = attachments.rows;

    // Get tasks
    const tasks = await query(
      `SELECT mt.*, u.name as assigned_to_name, u2.name as created_by_name
       FROM meeting_tasks mt
       LEFT JOIN users u ON u.id = mt.assigned_to
       LEFT JOIN users u2 ON u2.id = mt.created_by
       WHERE mt.meeting_id = $1 ORDER BY mt.created_at`,
      [meeting.id]
    );
    meeting.tasks = tasks.rows;

    res.json(meeting);
  } catch (error) {
    console.error('Error getting meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CREATE MEETING
// ============================================
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { title, description, meeting_date, start_time, end_time, location, deal_id, project_id, participant_ids } = req.body;

    if (!title || !meeting_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Título, data e horários são obrigatórios' });
    }

    // Check schedule conflicts for participants
    if (participant_ids?.length) {
      const conflicts = await query(
        `SELECT DISTINCT u.name, m.title, m.start_time, m.end_time
         FROM meeting_participants mp
         JOIN meetings m ON m.id = mp.meeting_id
         JOIN users u ON u.id = mp.user_id
         WHERE mp.user_id = ANY($1)
           AND m.meeting_date = $2
           AND m.status != 'cancelled'
           AND (
             ($3::time < m.end_time AND $4::time > m.start_time)
           )`,
        [participant_ids, meeting_date, start_time, end_time]
      );

      if (conflicts.rows.length > 0) {
        const conflictList = conflicts.rows.map(c => `${c.name} (${c.title} ${c.start_time}-${c.end_time})`).join('; ');
        return res.status(409).json({
          error: 'Conflito de agenda detectado',
          details: conflictList,
          conflicts: conflicts.rows
        });
      }
    }

    const result = await query(
      `INSERT INTO meetings (organization_id, title, description, meeting_date, start_time, end_time, location, deal_id, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [org.organization_id, title, description || null, meeting_date, start_time, end_time, location || null, deal_id || null, project_id || null, req.userId]
    );

    const meeting = result.rows[0];

    // Add creator as participant
    await query(
      `INSERT INTO meeting_participants (meeting_id, user_id, status) VALUES ($1, $2, 'confirmed') ON CONFLICT DO NOTHING`,
      [meeting.id, req.userId]
    );

    // Add other participants
    if (participant_ids?.length) {
      for (const uid of participant_ids) {
        await query(
          `INSERT INTO meeting_participants (meeting_id, user_id, status) VALUES ($1, $2, 'confirmed') ON CONFLICT DO NOTHING`,
          [meeting.id, uid]
        );
      }
    }

    res.status(201).json(meeting);
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// UPDATE MEETING
// ============================================
router.put('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { title, description, meeting_date, start_time, end_time, location, status, deal_id, project_id, minutes } = req.body;

    const result = await query(
      `UPDATE meetings SET
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        meeting_date = COALESCE($5, meeting_date),
        start_time = COALESCE($6, start_time),
        end_time = COALESCE($7, end_time),
        location = COALESCE($8, location),
        status = COALESCE($9, status),
        deal_id = $10,
        project_id = $11,
        minutes = COALESCE($12, minutes),
        updated_at = NOW()
      WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, org.organization_id, title, description, meeting_date, start_time, end_time, location, status, deal_id ?? null, project_id ?? null, minutes]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Reunião não encontrada' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DELETE MEETING
// ============================================
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    await query('DELETE FROM meetings WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting meeting:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PARTICIPANTS
// ============================================
router.post('/:id/participants', async (req, res) => {
  try {
    const { user_ids } = req.body;
    if (!user_ids?.length) return res.status(400).json({ error: 'user_ids obrigatório' });

    // Check conflicts
    const meeting = await query('SELECT * FROM meetings WHERE id = $1', [req.params.id]);
    if (!meeting.rows[0]) return res.status(404).json({ error: 'Reunião não encontrada' });
    const m = meeting.rows[0];

    const conflicts = await query(
      `SELECT DISTINCT u.name, mt.title, mt.start_time, mt.end_time
       FROM meeting_participants mp
       JOIN meetings mt ON mt.id = mp.meeting_id
       JOIN users u ON u.id = mp.user_id
       WHERE mp.user_id = ANY($1) AND mt.meeting_date = $2 AND mt.status != 'cancelled' AND mt.id != $3
         AND ($4::time < mt.end_time AND $5::time > mt.start_time)`,
      [user_ids, m.meeting_date, m.id, m.start_time, m.end_time]
    );

    if (conflicts.rows.length > 0) {
      return res.status(409).json({ error: 'Conflito de agenda', conflicts: conflicts.rows });
    }

    for (const uid of user_ids) {
      await query(
        'INSERT INTO meeting_participants (meeting_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [req.params.id, uid, 'confirmed']
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding participants:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/participants/:userId', async (req, res) => {
  try {
    await query('DELETE FROM meeting_participants WHERE meeting_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ATTACHMENTS
// ============================================
router.post('/:id/attachments', async (req, res) => {
  try {
    const { name, url, mimetype, size } = req.body;
    const result = await query(
      'INSERT INTO meeting_attachments (meeting_id, name, url, mimetype, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.id, name, url, mimetype || null, size || null, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/attachments/:attId', async (req, res) => {
  try {
    await query('DELETE FROM meeting_attachments WHERE id = $1', [req.params.attId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TASKS
// ============================================
router.post('/:id/tasks', async (req, res) => {
  try {
    const { title, description, assigned_to, due_date } = req.body;
    const result = await query(
      `INSERT INTO meeting_tasks (meeting_id, title, description, assigned_to, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, title, description || null, assigned_to || null, due_date || null, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { title, description, assigned_to, due_date, status } = req.body;
    const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
    const result = await query(
      `UPDATE meeting_tasks SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        assigned_to = COALESCE($4, assigned_to),
        due_date = COALESCE($5, due_date),
        status = COALESCE($6, status),
        completed_at = CASE WHEN $6 = 'completed' THEN NOW() ELSE CASE WHEN $6 IS NOT NULL AND $6 != 'completed' THEN NULL ELSE completed_at END END
      WHERE id = $1 RETURNING *`,
      [req.params.taskId, title, description, assigned_to, due_date, status]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/tasks/:taskId', async (req, res) => {
  try {
    await query('DELETE FROM meeting_tasks WHERE id = $1', [req.params.taskId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SCHEDULE CONFLICTS CHECK
// ============================================
router.post('/check-conflicts', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_ids, meeting_date, start_time, end_time, exclude_meeting_id } = req.body;

    let sql = `
      SELECT DISTINCT u.name, u.id as user_id, m.title, m.start_time::text, m.end_time::text
      FROM meeting_participants mp
      JOIN meetings m ON m.id = mp.meeting_id
      JOIN users u ON u.id = mp.user_id
      WHERE mp.user_id = ANY($1) AND m.meeting_date = $2 AND m.status != 'cancelled'
        AND ($3::time < m.end_time AND $4::time > m.start_time)
    `;
    const params = [user_ids, meeting_date, start_time, end_time];
    if (exclude_meeting_id) {
      sql += ` AND m.id != $5`;
      params.push(exclude_meeting_id);
    }

    const result = await query(sql, params);
    res.json({ conflicts: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
