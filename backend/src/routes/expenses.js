import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

async function ensureExpensesSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS expense_reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      submitted_at TIMESTAMP WITH TIME ZONE,
      approved_at TIMESTAMP WITH TIME ZONE,
      approved_by UUID REFERENCES users(id),
      rejected_at TIMESTAMP WITH TIME ZONE,
      rejected_by UUID REFERENCES users(id),
      rejection_reason TEXT,
      paid_at TIMESTAMP WITH TIME ZONE,
      paid_by UUID REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS expense_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
      category VARCHAR(50) NOT NULL,
      description VARCHAR(500),
      amount DECIMAL(12,2) NOT NULL,
      expense_date DATE NOT NULL,
      receipt_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_reports_org ON expense_reports(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_reports_user ON expense_reports(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_items_report ON expense_items(report_id)`);
}

let schemaReady = false;
async function init() {
  if (!schemaReady) { await ensureExpensesSchema(); schemaReady = true; }
}

// List expense reports for org (with filters)
router.get('/', async (req, res) => {
  try {
    await init();
    const { organization_id } = req.user;
    const { status, user_id, group_id } = req.query;
    let sql = `
      SELECT er.*, u.name as user_name, g.name as group_name,
        (SELECT COUNT(*) FROM expense_items WHERE report_id = er.id) as item_count
      FROM expense_reports er
      LEFT JOIN users u ON u.id = er.user_id
      LEFT JOIN groups g ON g.id = er.group_id
      WHERE er.organization_id = $1
    `;
    const params = [organization_id];
    let idx = 2;
    if (status) { sql += ` AND er.status = $${idx++}`; params.push(status); }
    if (user_id) { sql += ` AND er.user_id = $${idx++}`; params.push(user_id); }
    if (group_id) { sql += ` AND er.group_id = $${idx++}`; params.push(group_id); }
    sql += ' ORDER BY er.created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing expenses:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single report with items
router.get('/:id', async (req, res) => {
  try {
    await init();
    const { organization_id } = req.user;
    const report = await query(
      `SELECT er.*, u.name as user_name, g.name as group_name
       FROM expense_reports er
       LEFT JOIN users u ON u.id = er.user_id
       LEFT JOIN groups g ON g.id = er.group_id
       WHERE er.id = $1 AND er.organization_id = $2`,
      [req.params.id, organization_id]
    );
    if (!report.rows[0]) return res.status(404).json({ error: 'Not found' });
    const items = await query('SELECT * FROM expense_items WHERE report_id = $1 ORDER BY expense_date', [req.params.id]);
    res.json({ ...report.rows[0], items: items.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create report
router.post('/', async (req, res) => {
  try {
    await init();
    const { organization_id, id: userId } = req.user;
    const { title, description, group_id, items } = req.body;

    // Get user group if not provided
    let gid = group_id;
    if (!gid) {
      const ug = await query('SELECT group_id FROM user_groups WHERE user_id = $1 LIMIT 1', [userId]);
      gid = ug.rows[0]?.group_id || null;
    }

    const result = await query(
      `INSERT INTO expense_reports (organization_id, user_id, group_id, title, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [organization_id, userId, gid, title, description]
    );
    const report = result.rows[0];

    let total = 0;
    if (items?.length) {
      for (const item of items) {
        await query(
          `INSERT INTO expense_items (report_id, category, description, amount, expense_date, receipt_url)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [report.id, item.category, item.description, item.amount, item.expense_date, item.receipt_url]
        );
        total += Number(item.amount);
      }
      await query('UPDATE expense_reports SET total_amount = $1 WHERE id = $2', [total, report.id]);
    }

    res.json({ ...report, total_amount: total });
  } catch (err) {
    console.error('Error creating expense report:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add item to report
router.post('/:id/items', async (req, res) => {
  try {
    await init();
    const { category, description, amount, expense_date, receipt_url } = req.body;
    const result = await query(
      `INSERT INTO expense_items (report_id, category, description, amount, expense_date, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.params.id, category, description, amount, expense_date, receipt_url]
    );
    // Recalculate total
    await query(
      `UPDATE expense_reports SET total_amount = (SELECT COALESCE(SUM(amount),0) FROM expense_items WHERE report_id = $1), updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete item
router.delete('/items/:itemId', async (req, res) => {
  try {
    await init();
    const item = await query('SELECT report_id FROM expense_items WHERE id = $1', [req.params.itemId]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Not found' });
    const reportId = item.rows[0].report_id;
    await query('DELETE FROM expense_items WHERE id = $1', [req.params.itemId]);
    await query(
      `UPDATE expense_reports SET total_amount = (SELECT COALESCE(SUM(amount),0) FROM expense_items WHERE report_id = $1), updated_at = NOW() WHERE id = $1`,
      [reportId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit for approval
router.patch('/:id/submit', async (req, res) => {
  try {
    await init();
    const result = await query(
      `UPDATE expense_reports SET status = 'submitted', submitted_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'draft' RETURNING *`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Cannot submit' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Approve
router.patch('/:id/approve', async (req, res) => {
  try {
    await init();
    const result = await query(
      `UPDATE expense_reports SET status = 'approved', approved_at = NOW(), approved_by = $2, updated_at = NOW() WHERE id = $1 AND status = 'submitted' RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Cannot approve' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reject
router.patch('/:id/reject', async (req, res) => {
  try {
    await init();
    const { reason } = req.body;
    const result = await query(
      `UPDATE expense_reports SET status = 'rejected', rejected_at = NOW(), rejected_by = $2, rejection_reason = $3, updated_at = NOW() WHERE id = $1 AND status = 'submitted' RETURNING *`,
      [req.params.id, req.user.id, reason]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Cannot reject' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark as paid
router.patch('/:id/pay', async (req, res) => {
  try {
    await init();
    const result = await query(
      `UPDATE expense_reports SET status = 'paid', paid_at = NOW(), paid_by = $2, updated_at = NOW() WHERE id = $1 AND status = 'approved' RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) return res.status(400).json({ error: 'Cannot mark as paid' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete report
router.delete('/:id', async (req, res) => {
  try {
    await init();
    await query('DELETE FROM expense_reports WHERE id = $1 AND status = $2', [req.params.id, 'draft']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary by group
router.get('/summary/by-group', async (req, res) => {
  try {
    await init();
    const { organization_id } = req.user;
    const result = await query(`
      SELECT g.id, g.name as group_name,
        COALESCE(SUM(CASE WHEN er.status != 'rejected' THEN er.total_amount ELSE 0 END), 0) as total,
        COALESCE(SUM(CASE WHEN er.status = 'paid' THEN er.total_amount ELSE 0 END), 0) as paid,
        COALESCE(SUM(CASE WHEN er.status = 'approved' THEN er.total_amount ELSE 0 END), 0) as approved,
        COALESCE(SUM(CASE WHEN er.status = 'submitted' THEN er.total_amount ELSE 0 END), 0) as pending,
        COUNT(er.id) as report_count
      FROM groups g
      LEFT JOIN expense_reports er ON er.group_id = g.id
      WHERE g.organization_id = $1
      GROUP BY g.id, g.name
      ORDER BY total DESC
    `, [organization_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
