import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

async function ensureExpensesSchema() {
  // Items table - independent, report_id is optional
  await query(`
    CREATE TABLE IF NOT EXISTS expense_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
      report_id UUID,
      category VARCHAR(50) NOT NULL,
      description VARCHAR(500),
      amount DECIMAL(12,2) NOT NULL,
      expense_date DATE NOT NULL,
      expense_time TIME,
      payment_type VARCHAR(50),
      location VARCHAR(255),
      establishment VARCHAR(255),
      cnpj VARCHAR(20),
      receipt_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);
  // Reports table
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
  // Add new columns if missing (migration for existing DBs)
  const cols = ['organization_id', 'user_id', 'group_id', 'expense_time', 'payment_type', 'location', 'establishment', 'cnpj'];
  for (const col of cols) {
    try {
      await query(`ALTER TABLE expense_items ADD COLUMN IF NOT EXISTS ${col} ${
        col === 'organization_id' ? 'UUID REFERENCES organizations(id) ON DELETE CASCADE' :
        col === 'user_id' ? 'UUID REFERENCES users(id) ON DELETE CASCADE' :
        col === 'group_id' ? 'UUID REFERENCES groups(id) ON DELETE SET NULL' :
        col === 'expense_time' ? 'TIME' :
        'VARCHAR(255)'
      }`);
    } catch (e) { /* column exists */ }
  }
  // Make report_id nullable if it was NOT NULL before
  try { await query(`ALTER TABLE expense_items ALTER COLUMN report_id DROP NOT NULL`); } catch (e) {}

  await query(`CREATE INDEX IF NOT EXISTS idx_expense_items_org ON expense_items(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_items_user ON expense_items(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_items_report ON expense_items(report_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_reports_org ON expense_reports(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_reports_user ON expense_reports(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_expense_reports_status ON expense_reports(status)`);
}

let schemaReady = false;
async function init() {
  if (!schemaReady) { await ensureExpensesSchema(); schemaReady = true; }
}

// ===================== ITEMS (standalone) =====================

// List standalone items (not in a report, or all)
router.get('/items', async (req, res) => {
  try {
    await init();
    const { organization_id } = req.user;
    const { ungrouped, user_id, category } = req.query;
    let sql = `
      SELECT ei.*, u.name as user_name, g.name as group_name
      FROM expense_items ei
      LEFT JOIN users u ON u.id = ei.user_id
      LEFT JOIN groups g ON g.id = ei.group_id
      WHERE ei.organization_id = $1
    `;
    const params = [organization_id];
    let idx = 2;
    if (ungrouped === 'true') { sql += ` AND ei.report_id IS NULL`; }
    if (user_id) { sql += ` AND ei.user_id = $${idx++}`; params.push(user_id); }
    if (category) { sql += ` AND ei.category = $${idx++}`; params.push(category); }
    sql += ' ORDER BY ei.expense_date DESC, ei.created_at DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing items:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create standalone item
router.post('/items', async (req, res) => {
  try {
    await init();
    const { organization_id, id: userId } = req.user;
    const { category, description, amount, expense_date, expense_time, payment_type, location, establishment, cnpj, receipt_url } = req.body;

    // Get user group
    let group_id = null;
    const ug = await query('SELECT group_id FROM user_groups WHERE user_id = $1 LIMIT 1', [userId]);
    group_id = ug.rows[0]?.group_id || null;

    const result = await query(
      `INSERT INTO expense_items (organization_id, user_id, group_id, category, description, amount, expense_date, expense_time, payment_type, location, establishment, cnpj, receipt_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [organization_id, userId, group_id, category, description, amount, expense_date, expense_time || null, payment_type || null, location || null, establishment || null, cnpj || null, receipt_url || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating item:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete standalone item (only if not in a submitted+ report)
router.delete('/items/:itemId', async (req, res) => {
  try {
    await init();
    const item = await query('SELECT report_id FROM expense_items WHERE id = $1', [req.params.itemId]);
    if (!item.rows[0]) return res.status(404).json({ error: 'Not found' });
    const reportId = item.rows[0].report_id;
    await query('DELETE FROM expense_items WHERE id = $1', [req.params.itemId]);
    if (reportId) {
      await query(
        `UPDATE expense_reports SET total_amount = (SELECT COALESCE(SUM(amount),0) FROM expense_items WHERE report_id = $1), updated_at = NOW() WHERE id = $1`,
        [reportId]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Group items into a new report
router.post('/items/group', async (req, res) => {
  try {
    await init();
    const { organization_id, id: userId } = req.user;
    const { title, description, item_ids } = req.body;
    if (!item_ids?.length) return res.status(400).json({ error: 'No items selected' });

    let group_id = null;
    const ug = await query('SELECT group_id FROM user_groups WHERE user_id = $1 LIMIT 1', [userId]);
    group_id = ug.rows[0]?.group_id || null;

    // Calculate total
    const totalResult = await query(
      `SELECT COALESCE(SUM(amount), 0) as total FROM expense_items WHERE id = ANY($1) AND organization_id = $2`,
      [item_ids, organization_id]
    );
    const total = totalResult.rows[0].total;

    const report = await query(
      `INSERT INTO expense_reports (organization_id, user_id, group_id, title, description, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [organization_id, userId, group_id, title, description || null, total]
    );

    // Link items to report
    await query(
      `UPDATE expense_items SET report_id = $1 WHERE id = ANY($2) AND organization_id = $3`,
      [report.rows[0].id, item_ids, organization_id]
    );

    res.json(report.rows[0]);
  } catch (err) {
    console.error('Error grouping items:', err);
    res.status(500).json({ error: err.message });
  }
});

// ===================== REPORTS =====================

// List reports
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
    if (status && status !== 'all') { sql += ` AND er.status = $${idx++}`; params.push(status); }
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

// Delete report (unlinks items back to ungrouped)
router.delete('/:id', async (req, res) => {
  try {
    await init();
    // Unlink items first
    await query('UPDATE expense_items SET report_id = NULL WHERE report_id = $1', [req.params.id]);
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
        COALESCE(SUM(ei.amount), 0) as total,
        COALESCE(SUM(CASE WHEN er.status = 'paid' THEN ei.amount ELSE 0 END), 0) as paid,
        COALESCE(SUM(CASE WHEN er.status = 'approved' THEN ei.amount ELSE 0 END), 0) as approved,
        COALESCE(SUM(CASE WHEN er.status = 'submitted' THEN ei.amount ELSE 0 END), 0) as pending,
        COUNT(DISTINCT ei.id) as item_count
      FROM groups g
      LEFT JOIN expense_items ei ON ei.group_id = g.id
      LEFT JOIN expense_reports er ON er.id = ei.report_id
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
