import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// ============================================ BOOTSTRAP: colunas fornecedor / cross-link
let supplierColumnsReady = null;
async function ensureSupplierColumns() {
  if (supplierColumnsReady) return supplierColumnsReady;
  supplierColumnsReady = (async () => {
    const stmts = [
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS rma_type VARCHAR(15) DEFAULT 'cliente'`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS linked_devolucao_id UUID REFERENCES devolucoes(id) ON DELETE SET NULL`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_document VARCHAR(40)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_contact_name VARCHAR(255)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_whatsapp VARCHAR(50)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_email VARCHAR(255)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_address TEXT`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_rma_number VARCHAR(80)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_expected_return_date DATE`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS warranty_type VARCHAR(40)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_charge_status VARCHAR(30)`,
      `ALTER TABLE devolucoes ADD COLUMN IF NOT EXISTS supplier_credit_value NUMERIC(14,2)`,
      `ALTER TABLE devolucoes ALTER COLUMN customer_name DROP NOT NULL`,
      `CREATE INDEX IF NOT EXISTS idx_devolucoes_rma_type ON devolucoes(rma_type)`,
      `CREATE INDEX IF NOT EXISTS idx_devolucoes_linked ON devolucoes(linked_devolucao_id)`,
      `CREATE INDEX IF NOT EXISTS idx_devolucoes_supplier ON devolucoes(supplier_name)`,
    ];
    for (const s of stmts) {
      try { await query(s); } catch (e) { console.error('ensureSupplierColumns', s, e.message); }
    }
  })();
  return supplierColumnsReady;
}
ensureSupplierColumns().catch(() => {});

async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0];
}

const ALLOWED_STATUS = [
  'solicitado', 'aguardando_nf_produto', 'recebido', 'em_analise', 'cliente_notificado',
  'aguardando_nf_retorno', 'troca_conserto', 'enviado', 'concluido', 'recusado', 'cancelado'
];

const DEFAULT_SLA_HOURS = {
  solicitado: 24,
  aguardando_nf_produto: 72,
  recebido: 24,
  em_analise: 72,
  cliente_notificado: 48,
  aguardando_nf_retorno: 120,
  troca_conserto: 96,
  enviado: 72,
};

async function logEvent(devolucao_id, user_id, event_type, payload = {}) {
  try {
    await query(
      `INSERT INTO devolucao_eventos (devolucao_id, user_id, event_type, from_status, to_status, message, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [devolucao_id, user_id || null, event_type, payload.from_status || null, payload.to_status || null, payload.message || null, payload.metadata || {}]
    );
  } catch (e) { console.error('logEvent error', e); }
}

// ============================================ LIST
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });


    const { search, status, seller, reason, date_from, date_to, only_mine, rma_type, supplier } = req.query;
    let sql = `
      SELECT d.*,
        u.name as seller_name,
        c.name as created_by_name,
        ct.name as contact_name,
        ld.numero as linked_numero,
        ld.rma_type as linked_rma_type,
        ld.customer_name as linked_customer_name,
        ld.supplier_name as linked_supplier_name,
        (SELECT COUNT(*)::int FROM devolucao_itens i WHERE i.devolucao_id = d.id) as item_count,
        (SELECT COUNT(*)::int FROM devolucao_anexos a WHERE a.devolucao_id = d.id) as attachment_count,
        (COALESCE(d.inbound_freight_cost,0) + COALESCE(d.outbound_freight_cost,0)) as total_freight_cost
      FROM devolucoes d
      LEFT JOIN users u ON u.id = d.seller_user_id
      LEFT JOIN users c ON c.id = d.created_by
      LEFT JOIN contacts ct ON ct.id = d.contact_id
      LEFT JOIN devolucoes ld ON ld.id = d.linked_devolucao_id
      WHERE d.organization_id = $1
    `;
    const params = [org.organization_id];
    let i = 2;

    const elevated = ['owner', 'admin', 'superadmin', 'manager'].includes(org.role);
    if (only_mine === '1' || (!elevated && !seller)) {
      sql += ` AND (d.seller_user_id = $${i} OR d.created_by = $${i})`;
      params.push(req.userId); i++;
    }
    if (search) { sql += ` AND (COALESCE(d.customer_name,'') ILIKE $${i} OR COALESCE(d.supplier_name,'') ILIKE $${i} OR d.description ILIKE $${i} OR CAST(d.numero AS TEXT) ILIKE $${i})`; params.push(`%${search}%`); i++; }
    if (status) { sql += ` AND d.status = $${i}`; params.push(status); i++; }
    if (seller) { sql += ` AND d.seller_user_id = $${i}`; params.push(seller); i++; }
    if (reason) { sql += ` AND d.reason = $${i}`; params.push(reason); i++; }
    if (rma_type && rma_type !== 'all') { sql += ` AND COALESCE(d.rma_type,'cliente') = $${i}`; params.push(rma_type); i++; }
    if (supplier) { sql += ` AND d.supplier_name ILIKE $${i}`; params.push(`%${supplier}%`); i++; }
    if (date_from) { sql += ` AND d.created_at >= $${i}`; params.push(date_from); i++; }
    if (date_to) { sql += ` AND d.created_at <= ($${i}::date + INTERVAL '1 day')`; params.push(date_to); i++; }

    sql += ` ORDER BY d.created_at DESC`;
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (e) { console.error('list devolucoes', e); res.status(500).json({ error: e.message }); }
});

// ============================================ STATS
router.get('/stats', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { rma_type } = req.query;
    const params = [org.organization_id];
    let where = 'organization_id = $1';
    if (rma_type && rma_type !== 'all') { where += ` AND COALESCE(rma_type,'cliente') = $2`; params.push(rma_type); }
    const r = await query(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status NOT IN ('concluido','recusado','cancelado'))::int as open_count,
        COUNT(*) FILTER (WHERE status = 'em_analise')::int as in_analysis,
        COUNT(*) FILTER (WHERE status = 'aguardando_nf_produto')::int as waiting_nf,
        COUNT(*) FILTER (WHERE status = 'concluido' AND closed_at >= date_trunc('month', NOW()))::int as closed_this_month,
        COALESCE(SUM(inbound_freight_cost + outbound_freight_cost) FILTER (WHERE status = 'concluido' AND closed_at >= date_trunc('month', NOW())),0) as freight_cost_month,
        COALESCE(SUM(inbound_freight_cost + outbound_freight_cost),0) as freight_cost_total,
        COUNT(*) FILTER (WHERE COALESCE(rma_type,'cliente') = 'cliente')::int as total_cliente,
        COUNT(*) FILTER (WHERE COALESCE(rma_type,'cliente') = 'fornecedor')::int as total_fornecedor,
        COUNT(*) FILTER (WHERE COALESCE(rma_type,'cliente') = 'fornecedor' AND status NOT IN ('concluido','recusado','cancelado'))::int as open_fornecedor,
        COALESCE(SUM(supplier_credit_value) FILTER (WHERE COALESCE(rma_type,'cliente') = 'fornecedor' AND COALESCE(supplier_charge_status,'pendente') NOT IN ('recebido_credito','recebido_produto','perdido')),0) as supplier_credit_pending
      FROM devolucoes WHERE ${where}
    `, params);
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================ SUPPLIERS (cadastro reutilizável)
let suppliersReady = null;
async function ensureSuppliersTable() {
  if (suppliersReady) return suppliersReady;
  suppliersReady = (async () => {
    await query(`
      CREATE TABLE IF NOT EXISTS devolucao_suppliers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL,
        name VARCHAR(255) NOT NULL,
        document VARCHAR(40),
        contact_name VARCHAR(255),
        whatsapp VARCHAR(50),
        email VARCHAR(255),
        address TEXT,
        notes TEXT,
        created_by UUID,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_dev_suppliers_org ON devolucao_suppliers(organization_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_dev_suppliers_name ON devolucao_suppliers(organization_id, name)`);
  })();
  return suppliersReady;
}
ensureSuppliersTable().catch(() => {});

router.get('/suppliers', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await ensureSuppliersTable();
    const { search } = req.query;
    const params = [org.organization_id];
    let sql = `SELECT * FROM devolucao_suppliers WHERE organization_id = $1`;
    if (search) { sql += ` AND (name ILIKE $2 OR COALESCE(document,'') ILIKE $2)`; params.push(`%${search}%`); }
    sql += ` ORDER BY name ASC LIMIT 50`;
    const r = await query(sql, params);
    res.json(r.rows);
  } catch (e) { console.error('list suppliers', e); res.status(500).json({ error: e.message }); }
});

router.post('/suppliers', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await ensureSuppliersTable();
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const r = await query(
      `INSERT INTO devolucao_suppliers (organization_id, name, document, contact_name, whatsapp, email, address, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [org.organization_id, String(b.name).trim(), b.document || null, b.contact_name || null,
       b.whatsapp || null, b.email || null, b.address || null, b.notes || null, req.userId]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error('create supplier', e); res.status(500).json({ error: e.message }); }
});

router.put('/suppliers/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await ensureSuppliersTable();
    const b = req.body || {};
    const r = await query(
      `UPDATE devolucao_suppliers SET
        name = COALESCE($1, name),
        document = $2, contact_name = $3, whatsapp = $4,
        email = $5, address = $6, notes = $7, updated_at = NOW()
       WHERE id = $8 AND organization_id = $9 RETURNING *`,
      [b.name || null, b.document || null, b.contact_name || null, b.whatsapp || null,
       b.email || null, b.address || null, b.notes || null, req.params.id, org.organization_id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error('update supplier', e); res.status(500).json({ error: e.message }); }
});

router.delete('/suppliers/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    await ensureSuppliersTable();
    await query(`DELETE FROM devolucao_suppliers WHERE id = $1 AND organization_id = $2`, [req.params.id, org.organization_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


async function ensureSlaTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS devolucao_sla_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      status TEXT NOT NULL,
      hours INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organization_id, status)
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_devolucao_sla_configs_org ON devolucao_sla_configs(organization_id)`);
}

router.get('/sla-config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    try {
      const r = await query('SELECT status, hours FROM devolucao_sla_configs WHERE organization_id = $1', [org.organization_id]);
      const saved = {};
      for (const row of r.rows) saved[row.status] = row.hours;
      return res.json({ ...DEFAULT_SLA_HOURS, ...saved });
    } catch (innerErr) {
      if (innerErr && (innerErr.code === '42P01' || /does not exist/i.test(innerErr.message || ''))) {
        await ensureSlaTable();
        return res.json({ ...DEFAULT_SLA_HOURS });
      }
      throw innerErr;
    }
  } catch (e) {
    console.error('get sla config', e);
    res.json({ ...DEFAULT_SLA_HOURS });
  }
});

router.put('/sla-config', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner','admin','superadmin'].includes(org.role)) {
      return res.status(403).json({ error: 'Apenas administradores podem configurar o SLA' });
    }
    await ensureSlaTable();
    const b = req.body || {};
    for (const [status, rawHours] of Object.entries(b)) {
      if (!(status in DEFAULT_SLA_HOURS)) continue;
      const hours = parseInt(String(rawHours), 10);
      if (Number.isNaN(hours) || hours < 1) continue;
      await query(
        `INSERT INTO devolucao_sla_configs (organization_id, status, hours)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, status)
         DO UPDATE SET hours = EXCLUDED.hours, updated_at = NOW()`,
        [org.organization_id, status, hours]
      );
    }
    const r = await query('SELECT status, hours FROM devolucao_sla_configs WHERE organization_id = $1', [org.organization_id]);
    const saved = {};
    for (const row of r.rows) saved[row.status] = row.hours;
    res.json({ ...DEFAULT_SLA_HOURS, ...saved });
  } catch (e) { console.error('put sla config', e); res.status(500).json({ error: e.message }); }
});


// ============================================ GET
router.get('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const r = await query(`
      SELECT d.*, u.name as seller_name, c.name as created_by_name, ct.name as contact_name,
        rb.name as received_by_name, ab.name as analyzed_by_name, cb.name as closed_by_name,
        ld.numero as linked_numero, ld.rma_type as linked_rma_type,
        ld.customer_name as linked_customer_name, ld.supplier_name as linked_supplier_name,
        ld.status as linked_status
      FROM devolucoes d
      LEFT JOIN users u ON u.id = d.seller_user_id
      LEFT JOIN users c ON c.id = d.created_by
      LEFT JOIN users rb ON rb.id = d.received_by
      LEFT JOIN users ab ON ab.id = d.analyzed_by
      LEFT JOIN users cb ON cb.id = d.closed_by
      LEFT JOIN contacts ct ON ct.id = d.contact_id
      LEFT JOIN devolucoes ld ON ld.id = d.linked_devolucao_id
      WHERE d.id = $1 AND d.organization_id = $2
    `, [req.params.id, org.organization_id]);

    if (!r.rows[0]) return res.status(404).json({ error: 'Devolução não encontrada' });
    const dev = r.rows[0];

    dev.itens = (await query('SELECT * FROM devolucao_itens WHERE devolucao_id = $1 ORDER BY created_at', [dev.id])).rows;
    dev.anexos = (await query(`SELECT a.*, u.name as uploaded_by_name FROM devolucao_anexos a LEFT JOIN users u ON u.id = a.uploaded_by WHERE a.devolucao_id = $1 ORDER BY a.created_at DESC`, [dev.id])).rows;
    dev.eventos = (await query(`SELECT e.*, u.name as user_name FROM devolucao_eventos e LEFT JOIN users u ON u.id = e.user_id WHERE e.devolucao_id = $1 ORDER BY e.created_at DESC`, [dev.id])).rows;

    res.json(dev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================ CREATE
router.post('/', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const b = req.body || {};
    const rmaType = b.rma_type === 'fornecedor' ? 'fornecedor' : 'cliente';
    if (rmaType === 'cliente' && !b.customer_name) {
      return res.status(400).json({ error: 'Nome do cliente é obrigatório' });
    }
    if (rmaType === 'fornecedor' && !b.supplier_name) {
      return res.status(400).json({ error: 'Nome do fornecedor é obrigatório' });
    }

    const r = await query(`
      INSERT INTO devolucoes (
        organization_id, contact_id, deal_id, customer_name, customer_document, customer_whatsapp,
        customer_email, customer_address, opened_channel, seller_user_id, created_by, priority,
        reason, description, original_order_number, original_invoice_number, original_invoice_date,
        rma_type, linked_devolucao_id,
        supplier_name, supplier_document, supplier_contact_name, supplier_whatsapp, supplier_email,
        supplier_address, supplier_rma_number, supplier_expected_return_date, warranty_type,
        supplier_charge_status, supplier_credit_value
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      RETURNING *
    `, [
      org.organization_id, b.contact_id || null, b.deal_id || null, b.customer_name || null,
      b.customer_document || null, b.customer_whatsapp || null, b.customer_email || null,
      b.customer_address || null, b.opened_channel || 'sac', b.seller_user_id || req.userId,
      req.userId, b.priority || 'normal', b.reason || 'defeito', b.description || null,
      b.original_order_number || null, b.original_invoice_number || null, b.original_invoice_date || null,
      rmaType, b.linked_devolucao_id || null,
      b.supplier_name || null, b.supplier_document || null, b.supplier_contact_name || null,
      b.supplier_whatsapp || null, b.supplier_email || null, b.supplier_address || null,
      b.supplier_rma_number || null, b.supplier_expected_return_date || null, b.warranty_type || null,
      b.supplier_charge_status || null, b.supplier_credit_value ?? null,
    ]);
    const dev = r.rows[0];

    if (Array.isArray(b.itens)) {
      for (const it of b.itens) {
        if (!it.product_name) continue;
        await query(
          `INSERT INTO devolucao_itens (devolucao_id, sku, product_name, quantity, serial_number, unit_value, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [dev.id, it.sku || null, it.product_name, it.quantity || 1, it.serial_number || null, it.unit_value || null, it.notes || null]
        );
      }
    }

    await logEvent(dev.id, req.userId, 'status_change', { to_status: dev.status, message: rmaType === 'fornecedor' ? 'RMA de fornecedor aberto' : 'Devolução aberta' });
    if (b.linked_devolucao_id) {
      await logEvent(b.linked_devolucao_id, req.userId, 'note', { message: `RMA de fornecedor #${dev.numero} vinculado a esta devolução` });
    }
    res.status(201).json(dev);
  } catch (e) { console.error('create devolucao', e); res.status(500).json({ error: e.message }); }
});

// ============================================ UPDATE
router.put('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const current = await query('SELECT * FROM devolucoes WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Devolução não encontrada' });
    const prev = current.rows[0];

    const b = req.body || {};
    const fields = [
      'contact_id','deal_id','customer_name','customer_document','customer_whatsapp','customer_email','customer_address',
      'opened_channel','seller_user_id','priority','reason','description',
      'original_order_number','original_invoice_number','original_invoice_date',
      'inbound_invoice_number','inbound_invoice_key','inbound_invoice_date','inbound_invoice_value',
      'inbound_carrier','inbound_tracking_code','inbound_freight_cost','inbound_freight_status',
      'received_at','received_by',
      'analysis_status','analysis_decision','analysis_report','analyzed_at','analyzed_by',
      'customer_notified_at','customer_notification_channel','customer_notification_notes',
      'outbound_invoice_number','outbound_invoice_date','outbound_invoice_value',
      'outbound_tracking_code','outbound_carrier','outbound_sent_at',
      'outbound_freight_cost','outbound_freight_status',
      'resolution_summary','status',
      // Fornecedor / cross-link
      'rma_type','linked_devolucao_id',
      'supplier_name','supplier_document','supplier_contact_name','supplier_whatsapp',
      'supplier_email','supplier_address','supplier_rma_number','supplier_expected_return_date',
      'warranty_type','supplier_charge_status','supplier_credit_value'
    ];
    const sets = []; const params = []; let i = 1;
    for (const f of fields) {
      if (Object.prototype.hasOwnProperty.call(b, f)) {
        sets.push(`${f} = $${i}`); params.push(b[f]); i++;
      }
    }

    if (b.status && !ALLOWED_STATUS.includes(b.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    if (b.status === 'concluido' && prev.status !== 'concluido') {
      sets.push(`closed_at = NOW()`); sets.push(`closed_by = $${i}`); params.push(req.userId); i++;
    }
    if (!sets.length) return res.json(prev);

    sets.push(`updated_at = NOW()`);
    params.push(req.params.id, org.organization_id);
    const sql = `UPDATE devolucoes SET ${sets.join(', ')} WHERE id = $${i} AND organization_id = $${i+1} RETURNING *`;
    const r = await query(sql, params);
    const dev = r.rows[0];

    if (b.status && b.status !== prev.status) {
      await logEvent(dev.id, req.userId, 'status_change', { from_status: prev.status, to_status: dev.status });
      if (prev.linked_devolucao_id) {
        const kind = (prev.rma_type === 'fornecedor') ? 'fornecedor' : 'cliente';
        await logEvent(prev.linked_devolucao_id, req.userId, 'note', { message: `RMA ${kind} vinculado mudou de ${prev.status} → ${dev.status}` });
      }
    }
    if (b.inbound_invoice_number && b.inbound_invoice_number !== prev.inbound_invoice_number) {
      await logEvent(dev.id, req.userId, 'invoice', { message: `NF de entrada registrada: ${b.inbound_invoice_number}` });
    }
    if (b.outbound_invoice_number && b.outbound_invoice_number !== prev.outbound_invoice_number) {
      await logEvent(dev.id, req.userId, 'invoice', { message: `NF de saída registrada: ${b.outbound_invoice_number}` });
    }
    res.json(dev);
  } catch (e) { console.error('update devolucao', e); res.status(500).json({ error: e.message }); }
});

// ============================================ STATUS QUICK CHANGE
router.patch('/:id/status', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { status, note } = req.body || {};
    if (!ALLOWED_STATUS.includes(status)) return res.status(400).json({ error: 'Status inválido' });

    const cur = await query('SELECT * FROM devolucoes WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'Devolução não encontrada' });
    const prev = cur.rows[0];

    const closedSql = status === 'concluido' && prev.status !== 'concluido' ? `, closed_at = NOW(), closed_by = $3` : '';
    const args = status === 'concluido' && prev.status !== 'concluido'
      ? [status, req.params.id, req.userId, org.organization_id]
      : [status, req.params.id, org.organization_id];
    const orgIdx = args.length;
    const sql = `UPDATE devolucoes SET status = $1, updated_at = NOW() ${closedSql} WHERE id = $2 AND organization_id = $${orgIdx} RETURNING *`;
    const r = await query(sql, args);
    await logEvent(req.params.id, req.userId, 'status_change', { from_status: prev.status, to_status: status, message: note || null });
    if (prev.linked_devolucao_id) {
      const kind = (prev.rma_type === 'fornecedor') ? 'fornecedor' : 'cliente';
      await logEvent(prev.linked_devolucao_id, req.userId, 'note', { message: `RMA ${kind} vinculado mudou de ${prev.status} → ${status}` });
    }
    res.json(r.rows[0]);
  } catch (e) { console.error('status change', e); res.status(500).json({ error: e.message }); }
});

// ============================================ LINK SUPPLIER (cross-link cliente → fornecedor)
router.post('/:id/link-supplier', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const src = await query('SELECT * FROM devolucoes WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (!src.rows[0]) return res.status(404).json({ error: 'Devolução não encontrada' });
    const s = src.rows[0];

    const b = req.body || {};
    if (!b.supplier_name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório' });

    const r = await query(`
      INSERT INTO devolucoes (
        organization_id, created_by, seller_user_id, priority, reason, description,
        rma_type, linked_devolucao_id, opened_channel,
        supplier_name, supplier_document, supplier_contact_name, supplier_whatsapp,
        supplier_email, supplier_address, supplier_rma_number, supplier_expected_return_date,
        warranty_type, supplier_charge_status
      ) VALUES ($1,$2,$3,$4,$5,$6,'fornecedor',$7,'sac',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, [
      org.organization_id, req.userId, s.seller_user_id, s.priority || 'normal',
      s.reason || 'garantia',
      b.description || `Garantia solicitada ao fornecedor referente à devolução #${s.numero} do cliente ${s.customer_name || ''}`.trim(),
      s.id,
      b.supplier_name, b.supplier_document || null, b.supplier_contact_name || null,
      b.supplier_whatsapp || null, b.supplier_email || null, b.supplier_address || null,
      b.supplier_rma_number || null, b.supplier_expected_return_date || null,
      b.warranty_type || 'garantia_fabrica', b.supplier_charge_status || 'pendente',
    ]);
    const dev = r.rows[0];

    // Copia itens
    const itens = (await query('SELECT * FROM devolucao_itens WHERE devolucao_id = $1', [s.id])).rows;
    for (const it of itens) {
      await query(
        `INSERT INTO devolucao_itens (devolucao_id, sku, product_name, quantity, serial_number, unit_value, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [dev.id, it.sku, it.product_name, it.quantity, it.serial_number, it.unit_value, it.notes]
      );
    }

    await logEvent(dev.id, req.userId, 'status_change', { to_status: dev.status, message: `RMA fornecedor aberto (vinculado ao RMA cliente #${s.numero})` });
    await logEvent(s.id, req.userId, 'note', { message: `RMA de fornecedor #${dev.numero} aberto para ${b.supplier_name}` });
    // Se a devolução de cliente ainda não tinha link, aponta pra este novo RMA de fornecedor
    if (!s.linked_devolucao_id) {
      await query('UPDATE devolucoes SET linked_devolucao_id = $1, updated_at = NOW() WHERE id = $2', [dev.id, s.id]);
    }

    res.status(201).json(dev);
  } catch (e) { console.error('link supplier', e); res.status(500).json({ error: e.message }); }
});

// ============================================ DELETE
router.delete('/:id', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (!['owner','admin','superadmin'].includes(org.role)) return res.status(403).json({ error: 'Sem permissão' });
    await query('DELETE FROM devolucoes WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================ ITENS
router.post('/:id/itens', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.product_name) return res.status(400).json({ error: 'Produto obrigatório' });
    const r = await query(
      `INSERT INTO devolucao_itens (devolucao_id, sku, product_name, quantity, serial_number, unit_value, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, b.sku || null, b.product_name, b.quantity || 1, b.serial_number || null, b.unit_value || null, b.notes || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/itens/:itemId', async (req, res) => {
  try {
    await query('DELETE FROM devolucao_itens WHERE id = $1', [req.params.itemId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================ ANEXOS
router.post('/:id/anexos', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.url) return res.status(400).json({ error: 'URL obrigatória' });
    const r = await query(
      `INSERT INTO devolucao_anexos (devolucao_id, category, name, url, mimetype, size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, b.category || 'foto', b.name || null, b.url, b.mimetype || null, b.size || null, req.userId]
    );
    await logEvent(req.params.id, req.userId, 'attachment', { message: `Anexo: ${b.name || b.url}`, metadata: { category: b.category } });
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/anexos/:attId', async (req, res) => {
  try {
    await query('DELETE FROM devolucao_anexos WHERE id = $1', [req.params.attId]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================ EVENTO MANUAL (nota)
router.post('/:id/eventos', async (req, res) => {
  try {
    const b = req.body || {};
    await logEvent(req.params.id, req.userId, b.event_type || 'note', { message: b.message, metadata: b.metadata || {} });
    res.status(201).json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
