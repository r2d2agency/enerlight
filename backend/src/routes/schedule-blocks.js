import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// LIST schedule blocks
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id, date_from, date_to } = req.query;
    let sql = `
      SELECT sb.*, u.name as user_name, u.email as user_email
      FROM schedule_blocks sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.organization_id = $1
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (user_id) {
      sql += ` AND sb.user_id = $${idx}`;
      params.push(user_id);
      idx++;
    }
    if (date_from) {
      sql += ` AND sb.block_date >= $${idx}`;
      params.push(date_from);
      idx++;
    }
    if (date_to) {
      sql += ` AND sb.block_date <= $${idx}`;
      params.push(date_to);
      idx++;
    }

    sql += ` ORDER BY sb.block_date DESC, sb.start_time ASC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error listing schedule blocks:', error);
    res.status(500).json({ error: error.message });
  }
});

// CREATE schedule block
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id, title, reason, block_date, start_time, end_time, all_day, notes } = req.body;
    const targetUserId = user_id || req.userId;

    if (!title || !block_date) {
      return res.status(400).json({ error: 'Título e data são obrigatórios' });
    }

    if (!all_day && (!start_time || !end_time)) {
      return res.status(400).json({ error: 'Horários são obrigatórios quando não é dia inteiro' });
    }

    const result = await query(
      `INSERT INTO schedule_blocks (organization_id, user_id, title, reason, block_date, start_time, end_time, all_day, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [org.organization_id, targetUserId, title, reason || 'other', block_date,
       all_day ? null : start_time, all_day ? null : end_time, all_day || false, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating schedule block:', error);
    res.status(500).json({ error: error.message });
  }
});

// UPDATE schedule block
router.put('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { title, reason, block_date, start_time, end_time, all_day, notes } = req.body;

    const result = await query(
      `UPDATE schedule_blocks SET
        title = COALESCE($3, title),
        reason = COALESCE($4, reason),
        block_date = COALESCE($5, block_date),
        start_time = $6,
        end_time = $7,
        all_day = COALESCE($8, all_day),
        notes = $9
      WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, org.organization_id, title, reason, block_date,
       all_day ? null : start_time, all_day ? null : end_time, all_day, notes ?? null]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Bloqueio não encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating schedule block:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE schedule block
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    await query('DELETE FROM schedule_blocks WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting schedule block:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
