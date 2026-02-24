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

// Helper: expand recurring blocks into individual date entries within a range
function expandRecurringBlocks(blocks, dateFrom, dateTo) {
  const expanded = [];
  const from = dateFrom ? new Date(dateFrom) : new Date();
  const to = dateTo ? new Date(dateTo) : new Date(from.getTime() + 90 * 86400000); // default 90 days

  for (const block of blocks) {
    if (!block.recurrent || !block.recurrence_pattern) {
      expanded.push(block);
      continue;
    }

    const blockStart = new Date(block.block_date);
    const recurrenceEnd = block.recurrence_end ? new Date(block.recurrence_end) : to;
    const effectiveEnd = recurrenceEnd < to ? recurrenceEnd : to;
    const pattern = block.recurrence_pattern;
    const weekDays = block.recurrence_days || [];

    let current = new Date(Math.max(from.getTime(), blockStart.getTime()));
    // Align to start of day
    current.setHours(0, 0, 0, 0);

    const maxIterations = 366; // safety limit
    let iterations = 0;

    while (current <= effectiveEnd && iterations < maxIterations) {
      iterations++;
      const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon...
      const dayOfMonth = current.getDate();
      let shouldInclude = false;

      if (pattern === 'daily') {
        shouldInclude = true;
      } else if (pattern === 'weekdays') {
        shouldInclude = dayOfWeek >= 1 && dayOfWeek <= 5;
      } else if (pattern === 'weekly') {
        shouldInclude = weekDays.includes(dayOfWeek);
      } else if (pattern === 'monthly') {
        const originalDay = blockStart.getDate();
        shouldInclude = dayOfMonth === originalDay;
      }

      if (shouldInclude && current >= from) {
        const dateStr = current.toISOString().split('T')[0];
        expanded.push({
          ...block,
          block_date: dateStr,
          _is_recurrence_instance: true,
        });
      }

      current.setDate(current.getDate() + 1);
    }
  }

  return expanded;
}

// LIST schedule blocks (with recurrence expansion)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { user_id, date_from, date_to } = req.query;

    // Fetch non-recurring blocks within range
    let sql = `
      SELECT sb.*, u.name as user_name, u.email as user_email
      FROM schedule_blocks sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.organization_id = $1 AND sb.recurrent = false
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
    const nonRecurring = await query(sql, params);

    // Fetch recurring blocks that overlap the range
    let recurSql = `
      SELECT sb.*, u.name as user_name, u.email as user_email
      FROM schedule_blocks sb
      JOIN users u ON u.id = sb.user_id
      WHERE sb.organization_id = $1 AND sb.recurrent = true
        AND sb.block_date <= $2
        AND (sb.recurrence_end IS NULL OR sb.recurrence_end >= $3)
    `;
    const recurParams = [org.organization_id, date_to || '2099-12-31', date_from || '2000-01-01'];
    let rIdx = 4;
    if (user_id) {
      recurSql += ` AND sb.user_id = $${rIdx}`;
      recurParams.push(user_id);
    }

    const recurring = await query(recurSql, recurParams);
    const expandedRecurring = expandRecurringBlocks(recurring.rows, date_from, date_to);

    const allBlocks = [...nonRecurring.rows, ...expandedRecurring];
    allBlocks.sort((a, b) => a.block_date > b.block_date ? -1 : 1);

    res.json(allBlocks);
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

    const { user_id, title, reason, block_date, start_time, end_time, all_day, notes,
            recurrent, recurrence_pattern, recurrence_days, recurrence_end } = req.body;
    const targetUserId = user_id || req.userId;

    if (!title || !block_date) {
      return res.status(400).json({ error: 'Título e data são obrigatórios' });
    }

    if (!all_day && (!start_time || !end_time)) {
      return res.status(400).json({ error: 'Horários são obrigatórios quando não é dia inteiro' });
    }

    const result = await query(
      `INSERT INTO schedule_blocks (organization_id, user_id, title, reason, block_date, start_time, end_time, all_day, notes,
        recurrent, recurrence_pattern, recurrence_days, recurrence_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [org.organization_id, targetUserId, title, reason || 'other', block_date,
       all_day ? null : start_time, all_day ? null : end_time, all_day || false, notes || null,
       recurrent || false, recurrence_pattern || null,
       recurrence_days ? JSON.stringify(recurrence_days) : null,
       recurrence_end || null]
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

    const { title, reason, block_date, start_time, end_time, all_day, notes,
            recurrent, recurrence_pattern, recurrence_days, recurrence_end } = req.body;

    const result = await query(
      `UPDATE schedule_blocks SET
        title = COALESCE($3, title),
        reason = COALESCE($4, reason),
        block_date = COALESCE($5, block_date),
        start_time = $6,
        end_time = $7,
        all_day = COALESCE($8, all_day),
        notes = $9,
        recurrent = COALESCE($10, recurrent),
        recurrence_pattern = $11,
        recurrence_days = $12,
        recurrence_end = $13
      WHERE id = $1 AND organization_id = $2 RETURNING *`,
      [req.params.id, org.organization_id, title, reason, block_date,
       all_day ? null : start_time, all_day ? null : end_time, all_day, notes ?? null,
       recurrent, recurrence_pattern || null,
       recurrence_days ? JSON.stringify(recurrence_days) : null,
       recurrence_end || null]
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
