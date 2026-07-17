import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

let schemaReady = null;
async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS erp_billing_records (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL,
      client_name varchar(500),
      order_number varchar(100),
      order_value numeric(15,2) DEFAULT 0,
      state varchar(20),
      seller_name varchar(255),
      billing_date date,
      channel varchar(255),
      user_id uuid REFERENCES users(id),
      linked_user_id uuid REFERENCES users(id),
      created_at timestamptz DEFAULT NOW()
    )`);
    await query(`ALTER TABLE erp_billing_records
      ADD COLUMN IF NOT EXISTS client_name varchar(500),
      ADD COLUMN IF NOT EXISTS order_number varchar(100),
      ADD COLUMN IF NOT EXISTS order_value numeric(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS state varchar(20),
      ADD COLUMN IF NOT EXISTS seller_name varchar(255),
      ADD COLUMN IF NOT EXISTS billing_date date,
      ADD COLUMN IF NOT EXISTS channel varchar(255),
      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS linked_user_id uuid REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS crm_goals_data_id uuid,
      ADD COLUMN IF NOT EXISTS validation_status varchar(20) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS validated_at timestamptz,
      ADD COLUMN IF NOT EXISTS validation_note text,
      ADD COLUMN IF NOT EXISTS adjusted_value numeric(15,2),
      ADD COLUMN IF NOT EXISTS is_refund boolean DEFAULT false`);
    await query(`CREATE INDEX IF NOT EXISTS idx_erp_billing_validation
      ON erp_billing_records(organization_id, validation_status, billing_date)`);
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_erp_billing_crm_goal
      ON erp_billing_records(organization_id, crm_goals_data_id)
      WHERE crm_goals_data_id IS NOT NULL`);
    await query(`CREATE TABLE IF NOT EXISTS crm_goals_data (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      data_type varchar(20) NOT NULL,
      number varchar(50),
      status varchar(100),
      client_name varchar(500),
      value numeric(15,2) DEFAULT 0,
      seller_name varchar(255),
      user_id uuid REFERENCES users(id),
      channel varchar(255),
      client_group varchar(255),
      state varchar(10),
      city varchar(255),
      emission_date date,
      delivery_date date,
      billing_date date,
      margin numeric(10,2),
      observation text,
      order_number varchar(100),
      batch_id uuid,
      created_at timestamptz DEFAULT NOW()
    )`);
    await query(`ALTER TABLE crm_goals_data
      ADD COLUMN IF NOT EXISTS validation_status varchar(20) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS validated_by uuid REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS validated_at timestamptz,
      ADD COLUMN IF NOT EXISTS validation_note text,
      ADD COLUMN IF NOT EXISTS adjusted_value numeric(15,2),
      ADD COLUMN IF NOT EXISTS is_refund boolean DEFAULT false`);
    await query(`CREATE INDEX IF NOT EXISTS idx_goals_data_commission
      ON crm_goals_data(organization_id, data_type, billing_date, user_id)`);
    await query(`CREATE TABLE IF NOT EXISTS crm_goals_seller_mapping (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      seller_name varchar(255) NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id),
      UNIQUE(organization_id, seller_name)
    )`);
    await query(`CREATE TABLE IF NOT EXISTS commission_rules (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      base_percent numeric(6,3) NOT NULL DEFAULT 0,
      tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz DEFAULT NOW(),
      updated_at timestamptz DEFAULT NOW(),
      UNIQUE(organization_id, user_id)
    )`);
    await query(`ALTER TABLE commission_rules
      ADD COLUMN IF NOT EXISTS redbar_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS redbar_base_percent numeric(6,3) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS redbar_tiers jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await query(`CREATE INDEX IF NOT EXISTS idx_commission_rules_org ON commission_rules(organization_id)`);
  })().catch((e) => { schemaReady = null; throw e; });
  return schemaReady;
}
router.use(async (req, res, next) => { try { await ensureSchema(); next(); } catch (e) { next(e); } });

function localDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultPeriod() {
  const now = new Date();
  return {
    start: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: localDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

const REDBAR_REGEX = `'red[[:space:]]*bar'`;
function commissionSourceSql() {
  return `(
    SELECT
      'erp' AS source,
      b.id,
      b.organization_id,
      b.client_name,
      b.order_number,
      b.order_value,
      b.adjusted_value,
      b.state,
      b.seller_name,
      b.billing_date,
      b.channel,
      NULL::varchar AS client_group,
      COALESCE(b.linked_user_id, b.user_id) AS linked_user_id,
      COALESCE(b.validation_status, 'pending') AS validation_status,
      b.validated_by,
      b.validated_at,
      b.validation_note,
      COALESCE(b.is_refund, false) AS is_refund,
      (
        COALESCE(b.channel,'') || ' ' || COALESCE(b.client_name,'') || ' ' || COALESCE(b.order_number,'')
      ) ~* ${REDBAR_REGEX} AS is_redbar,
      b.created_at
    FROM erp_billing_records b
    UNION ALL
    SELECT
      'crm_import' AS source,
      g.id,
      g.organization_id,
      g.client_name,
      COALESCE(NULLIF(g.order_number, ''), g.number) AS order_number,
      g.value AS order_value,
      g.adjusted_value,
      g.state,
      g.seller_name,
      COALESCE(g.billing_date, g.emission_date, g.delivery_date, g.created_at::date) AS billing_date,
      g.channel,
      g.client_group,
      g.user_id AS linked_user_id,
      COALESCE(g.validation_status, 'pending') AS validation_status,
      g.validated_by,
      g.validated_at,
      g.validation_note,
      COALESCE(g.is_refund, false) AS is_refund,
      (
        COALESCE(g.channel,'') || ' ' || COALESCE(g.client_name,'') || ' ' || COALESCE(g.client_group,'') || ' ' || COALESCE(g.order_number,'') || ' ' || COALESCE(g.number,'')
      ) ~* ${REDBAR_REGEX} AS is_redbar,
      g.created_at
    FROM crm_goals_data g
    WHERE g.data_type = 'faturamento'
      AND NOT EXISTS (
        SELECT 1
        FROM erp_billing_records eb
        WHERE eb.organization_id = g.organization_id
          AND (
            eb.crm_goals_data_id = g.id
            OR (
              COALESCE(NULLIF(eb.order_number, ''), '__erp__') = COALESCE(NULLIF(g.order_number, ''), g.number, '__crm__')
              AND COALESCE(eb.seller_name, '') = COALESCE(g.seller_name, '')
              AND COALESCE(eb.billing_date, DATE '1900-01-01') = COALESCE(g.billing_date, g.emission_date, g.delivery_date, g.created_at::date, DATE '1900-01-01')
            )
          )
      )
  )`;
}

async function getMember(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0];
}

async function canValidate(userId, orgId) {
  const m = await getMember(userId);
  if (!m || m.organization_id !== orgId) return false;
  if (['owner', 'admin'].includes(m.role)) return true;
  const p = await query(
    `SELECT can_validate_billing FROM user_permissions WHERE user_id = $1 AND organization_id = $2`,
    [userId, orgId]
  );
  return !!p.rows[0]?.can_validate_billing;
}

// --- Validation queue (supervisor) ---
router.get('/validation', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    if (!(await canValidate(req.userId, m.organization_id))) return res.status(403).json({ error: 'Sem permissão' });

    const { start_date, end_date, status, seller_name, user_id, redbar } = req.query;
    const params = [m.organization_id];
    let where = `b.organization_id = $1`;
    if (start_date) { params.push(start_date); where += ` AND b.billing_date >= $${params.length}::date`; }
    if (end_date) { params.push(end_date); where += ` AND b.billing_date <= $${params.length}::date`; }
    if (status && status !== 'all') { params.push(status); where += ` AND COALESCE(b.validation_status, 'pending') = $${params.length}`; }
    if (seller_name) { params.push(seller_name); where += ` AND b.seller_name = $${params.length}`; }
    if (redbar === 'only') where += ` AND b.is_redbar = true`;
    else if (redbar === 'exclude') where += ` AND b.is_redbar = false`;
    if (user_id) {
      params.push(user_id);
      where += ` AND (b.linked_user_id = $${params.length} OR (b.linked_user_id IS NULL AND EXISTS (
        SELECT 1 FROM crm_goals_seller_mapping sm
        WHERE sm.organization_id = $1
          AND sm.user_id = $${params.length}
          AND LOWER(TRIM(sm.seller_name)) = LOWER(TRIM(b.seller_name))
      )))`;
    }

    const rows = await query(
      `SELECT b.*, COALESCE(b.linked_user_id, sm.user_id) AS linked_user_id,
              u.name AS linked_user_name, v.name AS validated_by_name
       FROM ${commissionSourceSql()} b
       LEFT JOIN crm_goals_seller_mapping sm
         ON sm.organization_id = b.organization_id
        AND LOWER(TRIM(sm.seller_name)) = LOWER(TRIM(b.seller_name))
       LEFT JOIN users u ON u.id = COALESCE(b.linked_user_id, sm.user_id)
       LEFT JOIN users v ON v.id = b.validated_by
       WHERE ${where}
       ORDER BY b.billing_date DESC, b.created_at DESC
       LIMIT 2000`,
      params
    );

    const stats = await query(
      `SELECT COALESCE(validation_status, 'pending') AS status,
              COUNT(*) AS count,
              COALESCE(SUM(COALESCE(adjusted_value, order_value)), 0) AS total_value
       FROM ${commissionSourceSql()} b WHERE ${where}
       GROUP BY 1`,
      params
    );

    res.json({ records: rows.rows, stats: stats.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update a single record (status, note, adjusted value, linked user, channel, refund)
router.patch('/validation/:id', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    if (!(await canValidate(req.userId, m.organization_id))) return res.status(403).json({ error: 'Sem permissão' });

    const { status, validation_note, adjusted_value, linked_user_id, channel, is_refund } = req.body || {};
    const erpSets = [];
    const crmSets = [];
    const params = [];
    const push = (col, val, crmCol = col) => {
      params.push(val);
      erpSets.push(`${col} = $${params.length}`);
      crmSets.push(`${crmCol} = $${params.length}`);
    };

    if (status !== undefined) {
      if (!['pending', 'validated', 'rejected'].includes(status)) return res.status(400).json({ error: 'status inválido' });
      push('validation_status', status);
      if (status === 'pending') { push('validated_by', null); push('validated_at', null); }
      else { push('validated_by', req.userId); push('validated_at', new Date()); }
    }
    if (validation_note !== undefined) push('validation_note', validation_note || null);
    if (adjusted_value !== undefined) push('adjusted_value', adjusted_value === null || adjusted_value === '' ? null : Number(adjusted_value));
    if (linked_user_id !== undefined) push('linked_user_id', linked_user_id || null, 'user_id');
    if (channel !== undefined) push('channel', channel || null);
    if (is_refund !== undefined) push('is_refund', !!is_refund);

    if (!erpSets.length) return res.status(400).json({ error: 'Nada para atualizar' });

    params.push(req.params.id, m.organization_id);
    let r = await query(
      `UPDATE erp_billing_records SET ${erpSets.join(', ')}
       WHERE id = $${params.length - 1} AND organization_id = $${params.length}
       RETURNING *`,
      params
    );
    if (!r.rows[0]) {
      r = await query(
        `UPDATE crm_goals_data SET ${crmSets.join(', ')}
         WHERE id = $${params.length - 1} AND organization_id = $${params.length} AND data_type = 'faturamento'
         RETURNING *`,
        params
      );
    }
    if (!r.rows[0]) return res.status(404).json({ error: 'Registro não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Bulk validate
router.post('/validation/bulk', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    if (!(await canValidate(req.userId, m.organization_id))) return res.status(403).json({ error: 'Sem permissão' });
    const { ids, status } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Sem registros' });
    if (!['pending', 'validated', 'rejected'].includes(status)) return res.status(400).json({ error: 'status inválido' });
    const isPending = status === 'pending';
    const r = await query(
      `UPDATE erp_billing_records
       SET validation_status = $1,
           validated_by = ${isPending ? 'NULL' : '$4'},
           validated_at = ${isPending ? 'NULL' : 'NOW()'}
       WHERE organization_id = $2 AND id = ANY($3::uuid[])`,
      isPending ? [status, m.organization_id, ids] : [status, m.organization_id, ids, req.userId]
    );
    const crm = await query(
      `UPDATE crm_goals_data
       SET validation_status = $1,
           validated_by = ${isPending ? 'NULL' : '$4'},
           validated_at = ${isPending ? 'NULL' : 'NOW()'}
       WHERE organization_id = $2 AND data_type = 'faturamento' AND id = ANY($3::uuid[])`,
      isPending ? [status, m.organization_id, ids] : [status, m.organization_id, ids, req.userId]
    );
    res.json({ updated: r.rowCount + crm.rowCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Commission rules ---
router.get('/rules', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    const r = await query(
      `SELECT cr.*, u.name AS user_name, u.email AS user_email
       FROM commission_rules cr
       JOIN users u ON u.id = cr.user_id
       WHERE cr.organization_id = $1
       ORDER BY u.name`,
      [m.organization_id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/rules/:userId', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    if (!['owner', 'admin'].includes(m.role)) return res.status(403).json({ error: 'Somente admin' });
    const { base_percent, tiers, active, redbar_enabled, redbar_base_percent, redbar_tiers } = req.body || {};
    const cleanList = (arr) => Array.isArray(arr) ? arr.map(t => ({
      label: String(t.label || '').slice(0, 80),
      target: Number(t.target) || 0,
      extra_percent: Number(t.extra_percent) || 0,
      extra_fixed: Number(t.extra_fixed) || 0,
    })).filter(t => t.target > 0).sort((a, b) => a.target - b.target) : [];
    const cleanTiers = cleanList(tiers);
    const cleanRedbarTiers = cleanList(redbar_tiers);
    const r = await query(
      `INSERT INTO commission_rules (organization_id, user_id, base_percent, tiers, active, redbar_enabled, redbar_base_percent, redbar_tiers)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb)
       ON CONFLICT (organization_id, user_id) DO UPDATE
       SET base_percent = EXCLUDED.base_percent, tiers = EXCLUDED.tiers,
           active = EXCLUDED.active,
           redbar_enabled = EXCLUDED.redbar_enabled,
           redbar_base_percent = EXCLUDED.redbar_base_percent,
           redbar_tiers = EXCLUDED.redbar_tiers,
           updated_at = NOW()
       RETURNING *`,
      [
        m.organization_id, req.params.userId,
        Number(base_percent) || 0, JSON.stringify(cleanTiers), active !== false,
        !!redbar_enabled, Number(redbar_base_percent) || 0, JSON.stringify(cleanRedbarTiers),
      ]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/rules/:userId', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    if (!['owner', 'admin'].includes(m.role)) return res.status(403).json({ error: 'Somente admin' });
    await query(`DELETE FROM commission_rules WHERE organization_id = $1 AND user_id = $2`,
      [m.organization_id, req.params.userId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Helper: compute commission on a single bucket (regular or redbar)
function computePart(basePercent, tiers, total) {
  const base = total * (Number(basePercent || 0) / 100);
  const list = Array.isArray(tiers) ? tiers : [];
  let bonus = 0;
  const achieved = [];
  let nextTier = null;
  for (const t of list) {
    if (total >= t.target) {
      const b = (total * (Number(t.extra_percent) || 0) / 100) + (Number(t.extra_fixed) || 0);
      bonus += b;
      achieved.push({ ...t, bonus: b });
    } else if (!nextTier) {
      nextTier = t;
    }
  }
  return { base, bonus, total: base + bonus, achieved, nextTier };
}

// If redbar is enabled on the rule, uses its own base_percent/tiers; otherwise falls back to normal rule.
function computeCommission(rule, validatedTotal, redbarTotal = 0) {
  const redbarEnabled = !!rule?.redbar_enabled;
  const regularAmount = redbarEnabled ? Math.max(0, validatedTotal - redbarTotal) : validatedTotal;
  const regular = computePart(rule?.base_percent, rule?.tiers, regularAmount);
  const redbar = redbarEnabled
    ? computePart(rule?.redbar_base_percent, rule?.redbar_tiers, redbarTotal)
    : { base: 0, bonus: 0, total: 0, achieved: [], nextTier: null };
  return {
    base: regular.base + redbar.base,
    bonus: regular.bonus + redbar.bonus,
    total: regular.total + redbar.total,
    achieved: [...regular.achieved, ...redbar.achieved.map(a => ({ ...a, redbar: true }))],
    nextTier: regular.nextTier,
    regular,
    redbar,
    redbar_enabled: redbarEnabled,
  };
}

// GET /api/commission/summary — supervisor view: total per user in period
router.get('/summary', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    if (!(await canValidate(req.userId, m.organization_id))) return res.status(403).json({ error: 'Sem permissão' });

    const period = defaultPeriod();
    const sd = req.query.start_date || period.start;
    const ed = req.query.end_date || period.end;

    const rows = await query(
      `SELECT COALESCE(b.linked_user_id, sm.user_id) AS linked_user_id,
              u.name AS user_name,
              COUNT(*) FILTER (WHERE COALESCE(b.validation_status,'pending')='validated' AND NOT COALESCE(b.is_refund,false)) AS validated_count,
              COALESCE(SUM(CASE
                WHEN COALESCE(b.validation_status,'pending')='validated' AND NOT COALESCE(b.is_refund,false)
                  THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS validated_total,
              COALESCE(SUM(CASE
                WHEN COALESCE(b.validation_status,'pending')='validated' AND COALESCE(b.is_refund,false)
                  THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS refund_total,
              COUNT(*) FILTER (WHERE COALESCE(b.validation_status,'pending')='pending') AS pending_count
       FROM ${commissionSourceSql()} b
       LEFT JOIN crm_goals_seller_mapping sm
         ON sm.organization_id = b.organization_id
        AND LOWER(TRIM(sm.seller_name)) = LOWER(TRIM(b.seller_name))
       LEFT JOIN users u ON u.id = COALESCE(b.linked_user_id, sm.user_id)
       WHERE b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date
          AND COALESCE(b.linked_user_id, sm.user_id) IS NOT NULL
       GROUP BY COALESCE(b.linked_user_id, sm.user_id), u.name
       ORDER BY validated_total DESC`,
      [m.organization_id, sd, ed]
    );

    const rulesRes = await query(`SELECT * FROM commission_rules WHERE organization_id = $1`, [m.organization_id]);
    const rulesByUser = Object.fromEntries(rulesRes.rows.map(r => [r.user_id, r]));

    const users = rows.rows.map(r => {
      const validated = Number(r.validated_total) - Number(r.refund_total);
      const rule = rulesByUser[r.linked_user_id];
      const comm = computeCommission(rule, Math.max(0, validated));
      return {
        user_id: r.linked_user_id,
        user_name: r.user_name,
        validated_count: Number(r.validated_count),
        validated_total: Number(r.validated_total),
        refund_total: Number(r.refund_total),
        net_total: validated,
        pending_count: Number(r.pending_count),
        commission: comm,
        rule: rule || null,
      };
    });

    res.json({ start_date: sd, end_date: ed, users });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/commission/my — user's own commission
router.get('/my', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });

    const period = defaultPeriod();
    const sd = req.query.start_date || period.start;
    const ed = req.query.end_date || period.end;

    // Match records linked directly to the user OR linked via seller_name mapping (fallback when linked_user_id is null)
    const matchFilter = `(
      b.linked_user_id = $2
      OR (b.linked_user_id IS NULL AND EXISTS (
        SELECT 1 FROM crm_goals_seller_mapping sm
        WHERE sm.organization_id = $1
          AND sm.user_id = $2
          AND LOWER(TRIM(sm.seller_name)) = LOWER(TRIM(b.seller_name))
      ))
    )`;
    const baseParams = [m.organization_id, req.userId, sd, ed];
    const dateRange = `b.billing_date >= $3::date AND b.billing_date <= $4::date`;

    const agg = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN COALESCE(b.validation_status,'pending')='validated' AND NOT COALESCE(b.is_refund,false)
                           THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS validated_total,
         COALESCE(SUM(CASE WHEN COALESCE(b.validation_status,'pending')='validated' AND COALESCE(b.is_refund,false)
                           THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS refund_total,
         COALESCE(SUM(CASE WHEN COALESCE(b.validation_status,'pending')='pending' AND NOT COALESCE(b.is_refund,false)
                           THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS pending_total,
         COALESCE(SUM(CASE WHEN COALESCE(b.validation_status,'pending') <> 'rejected' AND NOT COALESCE(b.is_refund,false)
                           THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS gross_total,
         COUNT(*) FILTER (WHERE COALESCE(b.validation_status,'pending')='validated' AND NOT COALESCE(b.is_refund,false)) AS validated_count,
         COUNT(*) FILTER (WHERE COALESCE(b.validation_status,'pending')='pending') AS pending_count,
         COUNT(*) AS total_count
       FROM ${commissionSourceSql()} b
       WHERE b.organization_id = $1 AND ${matchFilter} AND ${dateRange}`,
      baseParams
    );

    const daily = await query(
      `SELECT b.billing_date::date AS day,
              COALESCE(SUM(CASE WHEN COALESCE(b.validation_status,'pending')='validated' AND NOT COALESCE(b.is_refund,false)
                                THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS validated_value,
              COALESCE(SUM(CASE WHEN COALESCE(b.validation_status,'pending')='pending' AND NOT COALESCE(b.is_refund,false)
                                THEN COALESCE(b.adjusted_value, b.order_value) ELSE 0 END), 0) AS pending_value,
              COUNT(*) FILTER (WHERE COALESCE(b.validation_status,'pending')='validated' AND NOT COALESCE(b.is_refund,false)) AS validated_count,
              COUNT(*) FILTER (WHERE COALESCE(b.validation_status,'pending')='pending') AS pending_count
       FROM ${commissionSourceSql()} b
       WHERE b.organization_id = $1 AND ${matchFilter} AND ${dateRange}
       GROUP BY 1 ORDER BY 1`,
      baseParams
    );

    const details = await query(
      `SELECT b.id, b.client_name, b.order_number, b.billing_date, b.channel, b.seller_name,
              b.order_value, b.adjusted_value, b.validation_status, b.is_refund, b.validation_note
        FROM ${commissionSourceSql()} b
       WHERE b.organization_id = $1 AND ${matchFilter} AND ${dateRange}
       ORDER BY b.billing_date DESC, b.created_at DESC
       LIMIT 500`,
      baseParams
    );

    const ruleRes = await query(
      `SELECT * FROM commission_rules WHERE organization_id = $1 AND user_id = $2`,
      [m.organization_id, req.userId]
    );
    const rule = ruleRes.rows[0] || null;
    const validated = Number(agg.rows[0].validated_total) - Number(agg.rows[0].refund_total);
    const gross = Number(agg.rows[0].gross_total) - Number(agg.rows[0].refund_total);
    const commission = computeCommission(rule, Math.max(0, validated));
    const projectedCommission = computeCommission(rule, Math.max(0, gross));

    res.json({
      start_date: sd, end_date: ed,
      validated_total: Number(agg.rows[0].validated_total),
      refund_total: Number(agg.rows[0].refund_total),
      pending_total: Number(agg.rows[0].pending_total),
      gross_total: Number(agg.rows[0].gross_total),
      net_total: validated,
      projected_net_total: gross,
      validated_count: Number(agg.rows[0].validated_count),
      pending_count: Number(agg.rows[0].pending_count),
      total_count: Number(agg.rows[0].total_count),
      commission,
      projected_commission: projectedCommission,
      rule,
      daily: daily.rows.map(d => ({
        day: d.day,
        value: Number(d.validated_value),
        pending_value: Number(d.pending_value),
        count: Number(d.validated_count),
        pending_count: Number(d.pending_count),
      })),
      details: details.rows,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List org users (for rules config + validation filter)
router.get('/org-users', async (req, res) => {
  try {
    const m = await getMember(req.userId);
    if (!m) return res.status(403).json({ error: 'No organization' });
    const r = await query(
      `SELECT u.id, u.name, u.email FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1
       ORDER BY u.name`,
      [m.organization_id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
