import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

let schemaReady = null;
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS payroll_config (
      organization_id uuid PRIMARY KEY,
      manager_user_id uuid REFERENCES users(id),
      ceo_user_id uuid REFERENCES users(id),
      finance_user_id uuid REFERENCES users(id),
      updated_at timestamptz DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS payroll_employees (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      base_salary numeric(15,2) DEFAULT 0,
      updated_at timestamptz DEFAULT NOW(),
      UNIQUE(organization_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS payroll_periods (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL,
      reference_month date NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'draft',
      notes text,
      created_by uuid REFERENCES users(id),
      paid_at timestamptz,
      paid_by uuid REFERENCES users(id),
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW(),
      UNIQUE(organization_id, reference_month)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS payroll_items (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id),
      user_name varchar(255),
      base_salary numeric(15,2) DEFAULT 0,
      commission_value numeric(15,2) DEFAULT 0,
      bonus_value numeric(15,2) DEFAULT 0,
      deductions_total numeric(15,2) DEFAULT 0,
      total numeric(15,2) DEFAULT 0,
      notes text,
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW(),
      UNIQUE(period_id, user_id)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS payroll_deductions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      item_id uuid NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
      description varchar(255) NOT NULL,
      value numeric(15,2) NOT NULL DEFAULT 0,
      created_at timestamptz DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS payroll_approvals (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL,
      user_id uuid REFERENCES users(id),
      status varchar(20) NOT NULL,
      note text,
      created_at timestamptz DEFAULT NOW()
    )`);
    await query(`CREATE INDEX IF NOT EXISTS idx_payroll_periods_org ON payroll_periods(organization_id, reference_month DESC)`);
  })();
  return schemaReady;
}
router.use(async (_req, _res, next) => { try { await ensureSchema(); next(); } catch (e) { next(e); } });

async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0];
}

async function getConfig(orgId) {
  const r = await query(`SELECT * FROM payroll_config WHERE organization_id = $1`, [orgId]);
  return r.rows[0] || null;
}

function whichRole(config, userId) {
  if (!config) return null;
  if (config.manager_user_id === userId) return 'manager';
  if (config.ceo_user_id === userId) return 'ceo';
  if (config.finance_user_id === userId) return 'finance';
  return null;
}

const NEXT_STATUS_ON_APPROVE = {
  draft: 'manager_review',
  manager_review: 'ceo_review',
  ceo_review: 'finance_review',
  finance_review: 'approved',
};
const ROLE_FOR_STATUS = {
  manager_review: 'manager',
  ceo_review: 'ceo',
  finance_review: 'finance',
};

// ------ Config ------
router.get('/config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const config = await getConfig(org.organization_id);
    const usersR = await query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1 ORDER BY u.name`,
      [org.organization_id]
    );
    res.json({ config, users: usersR.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const { manager_user_id, ceo_user_id, finance_user_id } = req.body;
    await query(
      `INSERT INTO payroll_config (organization_id, manager_user_id, ceo_user_id, finance_user_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (organization_id) DO UPDATE
       SET manager_user_id = $2, ceo_user_id = $3, finance_user_id = $4, updated_at = NOW()`,
      [org.organization_id, manager_user_id || null, ceo_user_id || null, finance_user_id || null]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Employee base salary ------
router.get('/employees', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const r = await query(
      `SELECT u.id as user_id, u.name, u.email,
              COALESCE(pe.base_salary, 0) as base_salary
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       LEFT JOIN payroll_employees pe ON pe.user_id = u.id AND pe.organization_id = $1
       WHERE om.organization_id = $1
       ORDER BY u.name`,
      [org.organization_id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/employees/:userId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const { base_salary } = req.body;
    await query(
      `INSERT INTO payroll_employees (organization_id, user_id, base_salary, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (organization_id, user_id) DO UPDATE
       SET base_salary = $3, updated_at = NOW()`,
      [org.organization_id, req.params.userId, Number(base_salary) || 0]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Periods list ------
router.get('/periods', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const r = await query(
      `SELECT p.*,
              (SELECT COALESCE(SUM(total),0) FROM payroll_items WHERE period_id = p.id) as total_value,
              (SELECT COUNT(*) FROM payroll_items WHERE period_id = p.id) as items_count
       FROM payroll_periods p
       WHERE p.organization_id = $1
       ORDER BY p.reference_month DESC`,
      [org.organization_id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Create period (auto-populate from base salary + commission of the month) ------
router.post('/periods', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const { reference_month } = req.body; // YYYY-MM-DD (day=01)
    if (!reference_month) return res.status(400).json({ error: 'reference_month required' });

    const monthStart = String(reference_month).substring(0, 7) + '-01';

    // Create or fetch
    const existing = await query(
      `SELECT id FROM payroll_periods WHERE organization_id = $1 AND reference_month = $2::date`,
      [org.organization_id, monthStart]
    );
    let periodId;
    if (existing.rows[0]) {
      periodId = existing.rows[0].id;
    } else {
      const ins = await query(
        `INSERT INTO payroll_periods (organization_id, reference_month, status, created_by)
         VALUES ($1, $2::date, 'draft', $3) RETURNING id`,
        [org.organization_id, monthStart, req.userId]
      );
      periodId = ins.rows[0].id;
    }

    // Load org users + base salary
    const users = await query(
      `SELECT u.id, u.name, COALESCE(pe.base_salary, 0) as base_salary
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       LEFT JOIN payroll_employees pe ON pe.user_id = u.id AND pe.organization_id = $1
       WHERE om.organization_id = $1`,
      [org.organization_id]
    );

    // Load commissions for the month from erp_billing_records (validated)
    const commR = await query(
      `SELECT b.linked_user_id as user_id, COALESCE(SUM(b.order_value), 0) as total_value
       FROM erp_billing_records b
       WHERE b.organization_id = $1
         AND b.billing_date >= $2::date
         AND b.billing_date < ($2::date + INTERVAL '1 month')
         AND b.linked_user_id IS NOT NULL
         AND (b.validation_status IS NULL OR b.validation_status IN ('pending','approved'))
       GROUP BY b.linked_user_id`,
      [org.organization_id, monthStart]
    );
    const billingByUser = new Map(commR.rows.map(r => [r.user_id, Number(r.total_value)]));

    // Load commission rules
    let commissionRules = [];
    try {
      const cr = await query(
        `SELECT * FROM commission_rules WHERE organization_id = $1 AND is_active = true`,
        [org.organization_id]
      );
      commissionRules = cr.rows;
    } catch { /* table may not exist yet */ }

    function calcCommission(userId, billing) {
      const rule = commissionRules.find(r => r.user_id === userId) || commissionRules.find(r => !r.user_id);
      if (!rule) return 0;
      const pct = Number(rule.percentage || rule.rate || 0);
      return (billing * pct) / 100;
    }

    for (const u of users.rows) {
      // Skip if item exists (preserve any manual edits)
      const has = await query(
        `SELECT id FROM payroll_items WHERE period_id = $1 AND user_id = $2`,
        [periodId, u.id]
      );
      if (has.rows[0]) continue;

      const billing = billingByUser.get(u.id) || 0;
      const commission = calcCommission(u.id, billing);
      const base = Number(u.base_salary) || 0;
      const total = base + commission;

      await query(
        `INSERT INTO payroll_items (period_id, user_id, user_name, base_salary, commission_value, bonus_value, deductions_total, total)
         VALUES ($1, $2, $3, $4, $5, 0, 0, $6)`,
        [periodId, u.id, u.name, base, commission, total]
      );
    }

    res.json({ success: true, id: periodId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Get period detail ------
router.get('/periods/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const pR = await query(
      `SELECT p.* FROM payroll_periods p WHERE p.id = $1 AND p.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!pR.rows[0]) return res.status(404).json({ error: 'Not found' });
    const period = pR.rows[0];

    const itemsR = await query(
      `SELECT i.*, u.name as user_name_current
       FROM payroll_items i
       LEFT JOIN users u ON u.id = i.user_id
       WHERE i.period_id = $1
       ORDER BY COALESCE(u.name, i.user_name)`,
      [period.id]
    );

    const dR = await query(
      `SELECT d.* FROM payroll_deductions d
       JOIN payroll_items i ON i.id = d.item_id
       WHERE i.period_id = $1
       ORDER BY d.created_at`,
      [period.id]
    );

    const aR = await query(
      `SELECT a.*, u.name as user_name FROM payroll_approvals a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.period_id = $1
       ORDER BY a.created_at DESC`,
      [period.id]
    );

    const config = await getConfig(org.organization_id);
    const myRole = whichRole(config, req.userId);

    res.json({
      period,
      items: itemsR.rows,
      deductions: dR.rows,
      approvals: aR.rows,
      config,
      myRole,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Update item (edit bonus, deductions, notes) ------
async function recalcItem(itemId) {
  const it = await query(`SELECT * FROM payroll_items WHERE id = $1`, [itemId]);
  if (!it.rows[0]) return;
  const dR = await query(`SELECT COALESCE(SUM(value),0) as s FROM payroll_deductions WHERE item_id = $1`, [itemId]);
  const dedTotal = Number(dR.rows[0].s || 0);
  const item = it.rows[0];
  const total = Number(item.base_salary) + Number(item.commission_value) + Number(item.bonus_value) - dedTotal;
  await query(
    `UPDATE payroll_items SET deductions_total = $2, total = $3, updated_at = NOW() WHERE id = $1`,
    [itemId, dedTotal, total]
  );
}

router.put('/items/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const { base_salary, commission_value, bonus_value, notes } = req.body;

    // Ensure item belongs to org & period not paid
    const check = await query(
      `SELECT i.id, p.status FROM payroll_items i
       JOIN payroll_periods p ON p.id = i.period_id
       WHERE i.id = $1 AND p.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (['paid', 'approved'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: 'Folha já fechada, não é possível editar' });
    }

    await query(
      `UPDATE payroll_items
       SET base_salary = COALESCE($2, base_salary),
           commission_value = COALESCE($3, commission_value),
           bonus_value = COALESCE($4, bonus_value),
           notes = COALESCE($5, notes),
           updated_at = NOW()
       WHERE id = $1`,
      [req.params.id, base_salary, commission_value, bonus_value, notes]
    );
    await recalcItem(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Deductions ------
router.post('/items/:id/deductions', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const { description, value } = req.body;
    const check = await query(
      `SELECT i.id, p.status FROM payroll_items i
       JOIN payroll_periods p ON p.id = i.period_id
       WHERE i.id = $1 AND p.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (['paid', 'approved'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: 'Folha fechada' });
    }
    await query(
      `INSERT INTO payroll_deductions (item_id, description, value) VALUES ($1, $2, $3)`,
      [req.params.id, description, Number(value) || 0]
    );
    await recalcItem(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/deductions/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const check = await query(
      `SELECT d.item_id, p.status FROM payroll_deductions d
       JOIN payroll_items i ON i.id = d.item_id
       JOIN payroll_periods p ON p.id = i.period_id
       WHERE d.id = $1 AND p.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Not found' });
    if (['paid', 'approved'].includes(check.rows[0].status)) {
      return res.status(400).json({ error: 'Folha fechada' });
    }
    await query(`DELETE FROM payroll_deductions WHERE id = $1`, [req.params.id]);
    await recalcItem(check.rows[0].item_id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Submit for approval ------
router.post('/periods/:id/submit', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const r = await query(
      `UPDATE payroll_periods SET status = 'manager_review', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND status IN ('draft','rejected')
       RETURNING id`,
      [req.params.id, org.organization_id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Não pode ser enviada' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Approve / Reject ------
router.post('/periods/:id/approve', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const pR = await query(
      `SELECT * FROM payroll_periods WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!pR.rows[0]) return res.status(404).json({ error: 'Not found' });
    const period = pR.rows[0];

    const config = await getConfig(org.organization_id);
    const myRole = whichRole(config, req.userId);
    const expectedRole = ROLE_FOR_STATUS[period.status];
    if (!expectedRole) return res.status(400).json({ error: 'Folha não está em revisão' });
    if (myRole !== expectedRole) {
      return res.status(403).json({ error: `Apenas o ${expectedRole} pode aprovar nesta etapa` });
    }

    const next = NEXT_STATUS_ON_APPROVE[period.status];
    await query(
      `INSERT INTO payroll_approvals (period_id, role, user_id, status, note)
       VALUES ($1, $2, $3, 'approved', $4)`,
      [period.id, myRole, req.userId, req.body?.note || null]
    );
    await query(
      `UPDATE payroll_periods SET status = $2, updated_at = NOW() WHERE id = $1`,
      [period.id, next]
    );
    res.json({ success: true, status: next });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/periods/:id/reject', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const pR = await query(
      `SELECT * FROM payroll_periods WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!pR.rows[0]) return res.status(404).json({ error: 'Not found' });
    const period = pR.rows[0];

    const config = await getConfig(org.organization_id);
    const myRole = whichRole(config, req.userId);
    const expectedRole = ROLE_FOR_STATUS[period.status];
    if (myRole !== expectedRole) {
      return res.status(403).json({ error: 'Sem permissão nesta etapa' });
    }

    await query(
      `INSERT INTO payroll_approvals (period_id, role, user_id, status, note)
       VALUES ($1, $2, $3, 'rejected', $4)`,
      [period.id, myRole, req.userId, req.body?.note || null]
    );
    await query(
      `UPDATE payroll_periods SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
      [period.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Mark as paid ------
router.post('/periods/:id/pay', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const pR = await query(
      `SELECT * FROM payroll_periods WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!pR.rows[0]) return res.status(404).json({ error: 'Not found' });
    const period = pR.rows[0];

    const config = await getConfig(org.organization_id);
    const myRole = whichRole(config, req.userId);
    if (myRole !== 'finance') return res.status(403).json({ error: 'Apenas o Financeiro pode marcar como pago' });
    if (period.status !== 'approved') return res.status(400).json({ error: 'Folha precisa estar aprovada pelos 3' });

    await query(
      `UPDATE payroll_periods SET status = 'paid', paid_at = NOW(), paid_by = $2, updated_at = NOW() WHERE id = $1`,
      [period.id, req.userId]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ------ Delete draft ------
router.delete('/periods/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });
    const r = await query(
      `DELETE FROM payroll_periods WHERE id = $1 AND organization_id = $2 AND status IN ('draft','rejected') RETURNING id`,
      [req.params.id, org.organization_id]
    );
    if (!r.rows[0]) return res.status(400).json({ error: 'Só é possível excluir folhas em rascunho' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
