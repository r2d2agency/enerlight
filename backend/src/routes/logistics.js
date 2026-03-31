import { Router } from 'express';
import { query } from '../db.js';
import { authenticate as requireAuth } from '../middleware/auth.js';

const router = Router();

async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

// ===================== LIST SHIPMENTS =====================
router.get('/shipments', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { status, carrier, start_date, end_date, search, requester_id, company_name } = req.query;
    let sql = `
      SELECT ls.*, u.name as requester_name, u2.name as created_by_name
      FROM logistics_shipments ls
      LEFT JOIN users u ON u.id = ls.requester_id
      LEFT JOIN users u2 ON u2.id = ls.created_by
      WHERE ls.organization_id = $1
    `;
    const params = [org.organization_id];
    let idx = 2;

    if (status && status !== 'all') {
      sql += ` AND ls.status = $${idx++}`;
      params.push(status);
    }
    if (carrier) {
      sql += ` AND ls.carrier ILIKE $${idx++}`;
      params.push(`%${carrier}%`);
    }
    if (company_name && company_name !== 'all') {
      sql += ` AND ls.company_name = $${idx++}`;
      params.push(company_name);
    }
    if (start_date) {
      sql += ` AND ls.requested_date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      sql += ` AND ls.requested_date <= $${idx++}`;
      params.push(end_date);
    }
    if (search) {
      sql += ` AND (ls.client_name ILIKE $${idx} OR ls.invoice_number ILIKE $${idx} OR ls.order_number ILIKE $${idx} OR ls.carrier ILIKE $${idx})`;
      params.push(`%${search}%`);
      idx++;
    }
    if (requester_id) {
      sql += ` AND ls.requester_id = $${idx++}`;
      params.push(requester_id);
    }

    sql += ` ORDER BY ls.created_at DESC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (e) {
    console.error('List shipments error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== GET SINGLE =====================
router.get('/shipments/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT ls.*, u.name as requester_name, u2.name as created_by_name
       FROM logistics_shipments ls
       LEFT JOIN users u ON u.id = ls.requester_id
       LEFT JOIN users u2 ON u2.id = ls.created_by
       WHERE ls.id = $1 AND ls.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== CREATE =====================
router.post('/shipments', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const {
      company_name, client_name, invoice_number, order_number,
      requested_date, departure_date, estimated_delivery, actual_delivery,
      carrier, carrier_quote_code, volumes,
      freight_paid, freight_invoiced, tax_value,
      status, channel, deal_id, requester_id, notes
    } = req.body;

    const real_cost = (parseFloat(freight_paid) || 0) + (parseFloat(tax_value) || 0);

    const result = await query(
      `INSERT INTO logistics_shipments (
        organization_id, company_name, client_name, invoice_number, order_number,
        requested_date, departure_date, estimated_delivery, actual_delivery,
        carrier, carrier_quote_code, volumes,
        freight_paid, freight_invoiced, tax_value, real_cost,
        status, channel, deal_id, requester_id, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
      RETURNING *`,
      [
        org.organization_id, company_name, client_name, invoice_number, order_number,
        requested_date || null, departure_date || null, estimated_delivery || null, actual_delivery || null,
        carrier, carrier_quote_code, volumes || 0,
        freight_paid || 0, freight_invoiced || 0, tax_value || 0, real_cost,
        status || 'Pendente', channel, deal_id || null, requester_id || null, notes, req.userId
      ]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Create shipment error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== UPDATE =====================
router.put('/shipments/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const {
      company_name, client_name, invoice_number, order_number,
      requested_date, departure_date, estimated_delivery, actual_delivery,
      carrier, carrier_quote_code, volumes,
      freight_paid, freight_invoiced, tax_value,
      status, channel, deal_id, requester_id, notes
    } = req.body;

    const real_cost = (parseFloat(freight_paid) || 0) + (parseFloat(tax_value) || 0);

    const result = await query(
      `UPDATE logistics_shipments SET
        company_name=$1, client_name=$2, invoice_number=$3, order_number=$4,
        requested_date=$5, departure_date=$6, estimated_delivery=$7, actual_delivery=$8,
        carrier=$9, carrier_quote_code=$10, volumes=$11,
        freight_paid=$12, freight_invoiced=$13, tax_value=$14, real_cost=$15,
        status=$16, channel=$17, deal_id=$18, requester_id=$19, notes=$20,
        updated_at=NOW()
      WHERE id=$21 AND organization_id=$22
      RETURNING *`,
      [
        company_name, client_name, invoice_number, order_number,
        requested_date || null, departure_date || null, estimated_delivery || null, actual_delivery || null,
        carrier, carrier_quote_code, volumes || 0,
        freight_paid || 0, freight_invoiced || 0, tax_value || 0, real_cost,
        status || 'Pendente', channel, deal_id || null, requester_id || null, notes,
        req.params.id, org.organization_id
      ]
    );
    res.json(result.rows[0]);
  } catch (e) {
    console.error('Update shipment error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== DELETE =====================
router.delete('/shipments/:id', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    await query(
      `DELETE FROM logistics_shipments WHERE id = $1 AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== IMPORT XLSX =====================
router.post('/import', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { items } = req.body;
    if (!items || !items.length) return res.status(400).json({ error: 'Nenhum item para importar' });

    let imported = 0;
    for (const item of items) {
      const real_cost = (parseFloat(item.freight_paid) || 0) + (parseFloat(item.tax_value) || 0);
      await query(
        `INSERT INTO logistics_shipments (
          organization_id, company_name, client_name, invoice_number, order_number,
          requested_date, departure_date, estimated_delivery, actual_delivery,
          carrier, volumes, freight_paid, freight_invoiced, tax_value, real_cost,
          status, channel, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT DO NOTHING`,
        [
          org.organization_id, item.company_name, item.client_name, item.invoice_number, item.order_number,
          item.requested_date || null, item.departure_date || null, item.estimated_delivery || null, item.actual_delivery || null,
          item.carrier, item.volumes || 0, item.freight_paid || 0, item.freight_invoiced || 0, item.tax_value || 0, real_cost,
          item.status || 'Pendente', item.channel, req.userId
        ]
      );
      imported++;
    }
    res.json({ imported });
  } catch (e) {
    console.error('Import shipments error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== DASHBOARD / REPORTS =====================
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { start_date, end_date, company_name } = req.query;
    let dateFilter = '';
    const params = [org.organization_id];
    let idx = 2;

    if (start_date) {
      dateFilter += ` AND ls.requested_date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND ls.requested_date <= $${idx++}`;
      params.push(end_date);
    }
    if (company_name && company_name !== 'all') {
      dateFilter += ` AND ls.company_name = $${idx++}`;
      params.push(company_name);
    }

    // Summary
    const summary = await query(`
      SELECT
        COUNT(*) as total_shipments,
        COALESCE(SUM(freight_paid),0) as total_freight_paid,
        COALESCE(SUM(freight_invoiced),0) as total_freight_invoiced,
        COALESCE(SUM(tax_value),0) as total_tax,
        COALESCE(SUM(real_cost),0) as total_real_cost,
        COALESCE(SUM(freight_invoiced) - SUM(freight_paid),0) as balance,
        COUNT(CASE WHEN status = 'Entregue no prazo' THEN 1 END) as on_time,
        COUNT(CASE WHEN status = 'Entregue com atraso' THEN 1 END) as late,
        COUNT(CASE WHEN status = 'Em trânsito' THEN 1 END) as in_transit,
        COUNT(CASE WHEN status = 'Pendente' THEN 1 END) as pending
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter}
    `, params);

    // By carrier
    const byCarrier = await query(`
      SELECT carrier, COUNT(*) as total,
        COALESCE(SUM(freight_paid),0) as freight_paid,
        COALESCE(SUM(freight_invoiced),0) as freight_invoiced,
        COALESCE(SUM(real_cost),0) as real_cost
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter} AND carrier IS NOT NULL
      GROUP BY carrier ORDER BY total DESC
    `, params);

    // By requester (wallet)
    const byRequester = await query(`
      SELECT ls.requester_id, u.name as requester_name,
        COUNT(*) as total_shipments,
        COALESCE(SUM(freight_paid),0) as total_freight_paid,
        COALESCE(SUM(freight_invoiced),0) as total_invoiced,
        COALESCE(SUM(freight_invoiced) - SUM(freight_paid),0) as balance
      FROM logistics_shipments ls
      LEFT JOIN users u ON u.id = ls.requester_id
      WHERE ls.organization_id = $1 ${dateFilter} AND ls.requester_id IS NOT NULL
      GROUP BY ls.requester_id, u.name
      ORDER BY balance DESC
    `, params);

    // By status
    const byStatus = await query(`
      SELECT status, COUNT(*) as total,
        COALESCE(SUM(freight_paid),0) as freight_paid
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter}
      GROUP BY status ORDER BY total DESC
    `, params);

    // Monthly trend
    const monthlyTrend = await query(`
      SELECT 
        TO_CHAR(requested_date, 'YYYY-MM') as month,
        COUNT(*) as total,
        COALESCE(SUM(freight_paid),0) as freight_paid,
        COALESCE(SUM(freight_invoiced),0) as freight_invoiced,
        COALESCE(SUM(real_cost),0) as real_cost
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter} AND requested_date IS NOT NULL
      GROUP BY TO_CHAR(requested_date, 'YYYY-MM')
      ORDER BY month
    `, params);

    // By channel
    const byChannel = await query(`
      SELECT channel, COUNT(*) as total,
        COALESCE(SUM(freight_paid),0) as freight_paid,
        COALESCE(SUM(freight_invoiced),0) as freight_invoiced
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter} AND channel IS NOT NULL
      GROUP BY channel ORDER BY total DESC
    `, params);

    // By company
    const byCompany = await query(`
      SELECT company_name, COUNT(*) as total,
        COALESCE(SUM(freight_paid),0) as freight_paid,
        COALESCE(SUM(freight_invoiced),0) as freight_invoiced,
        COALESCE(SUM(real_cost),0) as real_cost,
        COALESCE(SUM(freight_invoiced) - SUM(freight_paid),0) as balance
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter} AND company_name IS NOT NULL AND company_name != ''
      GROUP BY company_name ORDER BY total DESC
    `, params);

    // By carrier + status (for carrier status tracking)
    const byCarrierStatus = await query(`
      SELECT carrier, status, COUNT(*) as total,
        MIN(estimated_delivery) as nearest_delivery,
        COUNT(CASE WHEN estimated_delivery IS NOT NULL AND estimated_delivery >= CURRENT_DATE THEN 1 END) as future_deliveries,
        COUNT(CASE WHEN estimated_delivery IS NOT NULL AND estimated_delivery < CURRENT_DATE AND status NOT LIKE 'Entregue%' THEN 1 END) as overdue
      FROM logistics_shipments ls
      WHERE ls.organization_id = $1 ${dateFilter} AND carrier IS NOT NULL AND carrier != ''
      GROUP BY carrier, status ORDER BY carrier, status
    `, params);

    res.json({
      summary: summary.rows[0],
      byCarrier: byCarrier.rows,
      byRequester: byRequester.rows,
      byStatus: byStatus.rows,
      monthlyTrend: monthlyTrend.rows,
      byChannel: byChannel.rows,
      byCompany: byCompany.rows,
      byCarrierStatus: byCarrierStatus.rows,
    });
  } catch (e) {
    console.error('Dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== DISTINCT COMPANIES =====================
router.get('/companies', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT DISTINCT company_name FROM logistics_shipments
       WHERE organization_id = $1 AND company_name IS NOT NULL AND company_name != ''
       ORDER BY company_name`,
      [org.organization_id]
    );
    res.json(result.rows.map(r => r.company_name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ===================== DISTINCT CARRIERS =====================
router.get('/carriers', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT DISTINCT carrier FROM logistics_shipments
       WHERE organization_id = $1 AND carrier IS NOT NULL AND carrier != ''
       ORDER BY carrier`,
      [org.organization_id]
    );
    res.json(result.rows.map(r => r.carrier));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== DISTINCT CHANNELS =====================
router.get('/channels', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT DISTINCT channel FROM logistics_shipments
       WHERE organization_id = $1 AND channel IS NOT NULL AND channel != ''
       ORDER BY channel`,
      [org.organization_id]
    );
    res.json(result.rows.map(r => r.channel));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/members', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(
      `SELECT u.id, u.name, u.email FROM users u
       INNER JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1 ORDER BY u.name`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== FIND BY QUOTE CODE (CRM cross-reference) =====================
router.get('/by-quote-code/:code', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT ls.*, u.name as requester_name
       FROM logistics_shipments ls
       LEFT JOIN users u ON u.id = ls.requester_id
       WHERE ls.organization_id = $1 AND ls.carrier_quote_code = $2`,
      [org.organization_id, req.params.code]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== CHANNEL WALLET (cross-reference with crm_goals_data) =====================
router.get('/channel-wallet', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [org.organization_id];
    let idx = 2;

    if (start_date) {
      dateFilter += ` AND ls.requested_date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND ls.requested_date <= $${idx++}`;
      params.push(end_date);
    }

    // Cross-reference: join logistics order_number with crm_goals_data number (pedido)
    // to get the channel from metas
    const result = await query(`
      SELECT 
        COALESCE(gd.channel, 'Sem canal') as metas_channel,
        COUNT(*) as total_shipments,
        COALESCE(SUM(ls.freight_paid), 0) as freight_paid,
        COALESCE(SUM(ls.freight_invoiced), 0) as freight_invoiced,
        COALESCE(SUM(ls.tax_value), 0) as tax_value,
        COALESCE(SUM(ls.real_cost), 0) as real_cost,
        COALESCE(SUM(ls.freight_invoiced) - SUM(ls.freight_paid), 0) as balance
      FROM logistics_shipments ls
      LEFT JOIN crm_goals_data gd 
        ON gd.organization_id = ls.organization_id 
        AND gd.data_type = 'pedido'
        AND TRIM(gd.number) = TRIM(ls.order_number)
        AND ls.order_number IS NOT NULL 
        AND ls.order_number != ''
      WHERE ls.organization_id = $1 ${dateFilter}
      GROUP BY COALESCE(gd.channel, 'Sem canal')
      ORDER BY freight_invoiced DESC
    `, params);

    res.json(result.rows);
  } catch (e) {
    console.error('Channel wallet error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== SELLER WALLET (cross-reference with crm_goals_data) =====================
router.get('/seller-wallet', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { start_date, end_date } = req.query;
    let dateFilter = '';
    const params = [org.organization_id];
    let idx = 2;

    if (start_date) {
      dateFilter += ` AND ls.requested_date >= $${idx++}`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND ls.requested_date <= $${idx++}`;
      params.push(end_date);
    }

    // Use a CTE to deduplicate shipments first, then join with goals
    const result = await query(`
      WITH shipment_goals AS (
        SELECT DISTINCT ON (ls.id)
          ls.id,
          ls.order_number,
          ls.freight_paid,
          ls.freight_invoiced,
          ls.channel as ls_channel,
          gd.channel as gd_channel,
          gd.seller_name,
          gd.user_id as seller_user_id,
          gd.value as order_value
        FROM logistics_shipments ls
        LEFT JOIN crm_goals_data gd 
          ON gd.organization_id = ls.organization_id 
          AND gd.data_type = 'pedido'
          AND TRIM(gd.number) = TRIM(ls.order_number)
          AND ls.order_number IS NOT NULL 
          AND ls.order_number != ''
        WHERE ls.organization_id = $1 ${dateFilter}
        ORDER BY ls.id, gd.value DESC NULLS LAST
      )
      SELECT
        COALESCE(gd_channel, 'Sem canal') as channel,
        COALESCE(seller_name, 'Sem vendedor') as seller_name,
        seller_user_id,
        COUNT(*) as total_shipments,
        COALESCE(SUM(freight_paid), 0) as freight_paid,
        COALESCE(SUM(freight_invoiced), 0) as freight_invoiced,
        COALESCE(SUM(freight_invoiced) - SUM(freight_paid), 0) as balance,
        COALESCE(SUM(order_value), 0) as total_order_value
      FROM shipment_goals
      GROUP BY COALESCE(gd_channel, 'Sem canal'), COALESCE(seller_name, 'Sem vendedor'), seller_user_id
      ORDER BY channel, freight_invoiced DESC
    `, params);

    res.json(result.rows);
  } catch (e) {
    console.error('Seller wallet error:', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
