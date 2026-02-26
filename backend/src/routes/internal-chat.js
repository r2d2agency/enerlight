import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();
router.use(authenticate);

// Helper: get user's org
async function getUserOrg(userId) {
  const r = await pool.query(
    `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.organization_id;
}

// ========================
// CHANNELS
// ========================

// List channels (filtered by org, optionally by department)
router.get('/channels', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.json([]);

    const { department_id } = req.query;
    let query = `
      SELECT c.*, d.name as department_name, u.name as created_by_name,
        (SELECT COUNT(*) FROM internal_channel_members WHERE channel_id = c.id) as member_count,
        (SELECT COUNT(*) FROM internal_topics WHERE channel_id = c.id AND status != 'closed') as open_topics_count
      FROM internal_channels c
      LEFT JOIN departments d ON d.id = c.department_id
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.organization_id = $1 AND c.is_archived = false
    `;
    const params = [orgId];

    if (department_id) {
      params.push(department_id);
      query += ` AND c.department_id = $${params.length}`;
    }
    query += ` ORDER BY c.updated_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing channels:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create channel
router.post('/channels', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(400).json({ error: 'Sem organização' });

    const { name, description, department_id, member_ids } = req.body;
    const result = await pool.query(
      `INSERT INTO internal_channels (organization_id, department_id, name, description, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orgId, department_id || null, name, description || null, req.userId]
    );
    const channel = result.rows[0];

    // Add creator as member
    await pool.query(
      `INSERT INTO internal_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [channel.id, req.userId]
    );

    // Add additional members
    if (member_ids?.length) {
      for (const uid of member_ids) {
        await pool.query(
          `INSERT INTO internal_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [channel.id, uid]
        );
      }
    }

    res.json(channel);
  } catch (err) {
    console.error('Error creating channel:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update channel
router.patch('/channels/:id', async (req, res) => {
  try {
    const { name, description, is_archived } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
    if (is_archived !== undefined) { sets.push(`is_archived = $${idx++}`); params.push(is_archived); }

    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE internal_channels SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete channel
router.delete('/channels/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM internal_channels WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get channel members
router.get('/channels/:id/members', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.name as user_name, u.email as user_email
       FROM internal_channel_members m
       JOIN users u ON u.id = m.user_id
       WHERE m.channel_id = $1
       ORDER BY u.name`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add member to channel
router.post('/channels/:id/members', async (req, res) => {
  try {
    const { user_id } = req.body;
    await pool.query(
      `INSERT INTO internal_channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.id, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove member from channel
router.delete('/channels/:id/members/:userId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM internal_channel_members WHERE channel_id = $1 AND user_id = $2`,
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// TOPICS
// ========================

// List topics for a channel
router.get('/channels/:channelId/topics', async (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT t.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM internal_messages WHERE topic_id = t.id) as message_count,
        (SELECT MAX(created_at) FROM internal_messages WHERE topic_id = t.id) as last_message_at
      FROM internal_topics t
      LEFT JOIN users u ON u.id = t.created_by
      WHERE t.channel_id = $1
    `;
    const params = [req.params.channelId];

    if (status) {
      params.push(status);
      query += ` AND t.status = $${params.length}`;
    }
    query += ` ORDER BY t.updated_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create topic
router.post('/channels/:channelId/topics', async (req, res) => {
  try {
    const { title } = req.body;
    const result = await pool.query(
      `INSERT INTO internal_topics (channel_id, title, created_by) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.channelId, title, req.userId]
    );

    // Update channel's updated_at
    await pool.query(`UPDATE internal_channels SET updated_at = NOW() WHERE id = $1`, [req.params.channelId]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update topic (status, title, move to another channel)
router.patch('/topics/:id', async (req, res) => {
  try {
    const { status, title, channel_id } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;

    if (title !== undefined) { sets.push(`title = $${idx++}`); params.push(title); }
    if (channel_id !== undefined) { sets.push(`channel_id = $${idx++}`); params.push(channel_id); }
    if (status !== undefined) {
      sets.push(`status = $${idx++}`); params.push(status);
      if (status === 'closed') {
        sets.push(`closed_by = $${idx++}`); params.push(req.userId);
        sets.push(`closed_at = NOW()`);
      } else {
        sets.push(`closed_by = NULL`);
        sets.push(`closed_at = NULL`);
      }
    }

    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });

    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE internal_topics SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete topic
router.delete('/topics/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM internal_topics WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// TOPIC MEMBERS
// ========================

// List topic members
router.get('/topics/:topicId/members', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT tm.*, u.name as user_name, u.email as user_email
       FROM internal_topic_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.topic_id = $1
       ORDER BY u.name`,
      [req.params.topicId]
    );
    res.json(result.rows);
  } catch (err) {
    if (err.code === '42P01') return res.json([]); // table doesn't exist yet
    res.status(500).json({ error: err.message });
  }
});

// Add member to topic
router.post('/topics/:topicId/members', async (req, res) => {
  try {
    const { user_id } = req.body;
    await pool.query(
      `INSERT INTO internal_topic_members (topic_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.params.topicId, user_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove member from topic
router.delete('/topics/:topicId/members/:userId', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM internal_topic_members WHERE topic_id = $1 AND user_id = $2`,
      [req.params.topicId, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// TOPIC TASKS (create + list with status)
// ========================

// List tasks linked to topic
router.get('/topics/:topicId/tasks', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.json([]);

    const result = await pool.query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date, t.assigned_to,
              u.name as assigned_to_name
       FROM internal_topic_links tl
       JOIN crm_tasks t ON t.id = tl.link_id
       LEFT JOIN users u ON u.id = t.assigned_to
       WHERE tl.topic_id = $1 AND tl.link_type = 'task'
       ORDER BY t.created_at DESC`,
      [req.params.topicId]
    );
    res.json(result.rows);
  } catch (err) {
    if (err.code === '42P01') return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

// Create task from topic (creates CRM task + auto-links)
router.post('/topics/:topicId/tasks', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(400).json({ error: 'Sem organização' });

    const { title, description, assigned_to, priority, due_date } = req.body;

    // Create CRM task
    const taskResult = await pool.query(
      `INSERT INTO crm_tasks (organization_id, title, description, assigned_to, created_by, priority, due_date, type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'task', 'pending') RETURNING *`,
      [orgId, title, description || null, assigned_to || req.userId, req.userId, priority || 'medium', due_date || null]
    );
    const task = taskResult.rows[0];

    // Auto-link to topic
    await pool.query(
      `INSERT INTO internal_topic_links (topic_id, link_type, link_id, link_title, created_by)
       VALUES ($1, 'task', $2, $3, $4) ON CONFLICT DO NOTHING`,
      [req.params.topicId, task.id, title, req.userId]
    );

    res.json(task);
  } catch (err) {
    console.error('Error creating task from topic:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// MESSAGES
// ========================

// List messages for a topic
router.get('/topics/:topicId/messages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, u.name as sender_name, u.email as sender_email,
        COALESCE(
          (SELECT json_agg(json_build_object('id', a.id, 'file_url', a.file_url, 'file_name', a.file_name, 'file_size', a.file_size, 'file_type', a.file_type))
           FROM internal_message_attachments a WHERE a.message_id = m.id), '[]'
        ) as attachments
       FROM internal_messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.topic_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.topicId]
    );

    // Mark mentions as read for current user
    await pool.query(
      `DELETE FROM internal_mentions_unread WHERE user_id = $1 AND topic_id = $2`,
      [req.userId, req.params.topicId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send message
router.post('/topics/:topicId/messages', async (req, res) => {
  try {
    const { content, mentions, attachments } = req.body;

    const result = await pool.query(
      `INSERT INTO internal_messages (topic_id, sender_id, content, mentions)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.topicId, req.userId, content, mentions || []]
    );
    const message = result.rows[0];

    // Save attachments
    if (attachments?.length) {
      for (const att of attachments) {
        await pool.query(
          `INSERT INTO internal_message_attachments (message_id, file_url, file_name, file_size, file_type)
           VALUES ($1, $2, $3, $4, $5)`,
          [message.id, att.file_url, att.file_name, att.file_size || null, att.file_type || null]
        );
      }
    }

    // Create unread mention entries
    if (mentions?.length) {
      // Get channel_id from topic
      const topicRes = await pool.query(`SELECT channel_id FROM internal_topics WHERE id = $1`, [req.params.topicId]);
      const channelId = topicRes.rows[0]?.channel_id;

      for (const userId of mentions) {
        if (userId !== req.userId) {
          await pool.query(
            `INSERT INTO internal_mentions_unread (user_id, message_id, topic_id, channel_id)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [userId, message.id, req.params.topicId, channelId]
          );
        }
      }
    }

    // Update topic updated_at
    await pool.query(`UPDATE internal_topics SET updated_at = NOW() WHERE id = $1`, [req.params.topicId]);

    // Fetch full message with sender info
    const full = await pool.query(
      `SELECT m.*, u.name as sender_name, u.email as sender_email, '[]'::json as attachments
       FROM internal_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = $1`,
      [message.id]
    );

    res.json(full.rows[0]);
  } catch (err) {
    console.error('Error sending internal message:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========================
// MENTIONS / NOTIFICATIONS
// ========================

// Get unread mention count for current user
router.get('/mentions/unread-count', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM internal_mentions_unread WHERE user_id = $1`,
      [req.userId]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get unread mentions list
router.get('/mentions/unread', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT mu.*, m.content, u.name as sender_name, t.title as topic_title, c.name as channel_name
       FROM internal_mentions_unread mu
       JOIN internal_messages m ON m.id = mu.message_id
       JOIN users u ON u.id = m.sender_id
       JOIN internal_topics t ON t.id = mu.topic_id
       JOIN internal_channels c ON c.id = mu.channel_id
       WHERE mu.user_id = $1
       ORDER BY mu.created_at DESC
       LIMIT 50`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark a mention as read (dismiss)
router.post('/mentions/:mentionId/read', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM internal_mentions_unread WHERE id = $1 AND user_id = $2',
      [req.params.mentionId, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// ORG MEMBERS (for adding to channels)
// ========================
router.get('/org-members', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.json([]);
    const result = await pool.query(
      `SELECT u.id, u.name, u.email FROM organization_members om JOIN users u ON u.id = om.user_id WHERE om.organization_id = $1 ORDER BY u.name`,
      [orgId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// SEARCH
// ========================

router.get('/search', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.json([]);

    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const result = await pool.query(
      `SELECT m.id, m.content, m.created_at, u.name as sender_name, t.title as topic_title, c.name as channel_name, t.id as topic_id, c.id as channel_id
       FROM internal_messages m
       JOIN internal_topics t ON t.id = m.topic_id
       JOIN internal_channels c ON c.id = t.channel_id
       JOIN users u ON u.id = m.sender_id
       WHERE c.organization_id = $1 AND m.content ILIKE $2
       ORDER BY m.created_at DESC
       LIMIT 30`,
      [orgId, `%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// TOPIC LINKS (vincular tarefas, reuniões, projetos, negociações)
// ========================

// List links for a topic
router.get('/topics/:topicId/links', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM internal_topic_links WHERE topic_id = $1 ORDER BY created_at DESC`,
      [req.params.topicId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a link
router.post('/topics/:topicId/links', async (req, res) => {
  try {
    const { link_type, link_id, link_title } = req.body;
    const result = await pool.query(
      `INSERT INTO internal_topic_links (topic_id, link_type, link_id, link_title, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.topicId, link_type, link_id, link_title, req.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Vínculo já existe' });
    res.status(500).json({ error: err.message });
  }
});

// Delete a link
router.delete('/topics/links/:linkId', async (req, res) => {
  try {
    await pool.query('DELETE FROM internal_topic_links WHERE id = $1', [req.params.linkId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search linkable items (tasks, meetings, projects, deals)
router.get('/search-linkable', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.json([]);

    const { type, q = '' } = req.query;
    let query, params;

    switch (type) {
      case 'task':
        query = `SELECT t.id, t.title FROM crm_tasks t WHERE t.organization_id = $1 AND t.title ILIKE $2 ORDER BY t.created_at DESC LIMIT 20`;
        params = [orgId, `%${q}%`];
        break;
      case 'meeting':
        query = `SELECT id, title FROM meetings WHERE organization_id = $1 AND title ILIKE $2 ORDER BY meeting_date DESC LIMIT 20`;
        params = [orgId, `%${q}%`];
        break;
      case 'project':
        query = `SELECT id, title FROM projects WHERE organization_id = $1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT 20`;
        params = [orgId, `%${q}%`];
        break;
      case 'deal':
        query = `SELECT id, title FROM deals WHERE organization_id = $1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT 20`;
        params = [orgId, `%${q}%`];
        break;
      default:
        return res.json([]);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
