import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import XLSX from 'xlsx';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

const uploadsDir = path.join(process.cwd(), 'uploads');
const upload = multer({ dest: uploadsDir, limits: { fileSize: 100 * 1024 * 1024 } });

async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(val).trim();
  // Try M/D/YY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    let y = parseInt(mdy[3]);
    if (y < 100) y += 2000;
    return `${y}-${String(parseInt(mdy[1])).padStart(2, '0')}-${String(parseInt(mdy[2])).padStart(2, '0')}`;
  }
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  // Try DD/MM/YYYY
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function parseValue(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const s = String(val).replace(/R\$\s*/g, '').replace(/\./g, '').replace(',', '.').trim();
  return parseFloat(s) || 0;
}

// Preview XLSX (parse and return rows + unique sellers)
router.post('/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const wb = XLSX.readFile(req.file.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // Map columns (flexible header matching)
    const mapped = [];
    const sellersSet = new Set();

    for (const row of rows) {
      const keys = Object.keys(row);
      const findCol = (patterns) => {
        for (const p of patterns) {
          const k = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
          if (k) return row[k];
        }
        return '';
      };

      const clientName = findCol(['cliente', 'client', 'razão', 'razao']);
      const orderNumber = findCol(['pedido', 'order', 'nº']);
      const orderValue = findCol(['valor', 'value', 'total']);
      const state = findCol(['uf', 'estado', 'state']);
      const seller = findCol(['vendedor', 'seller', 'representante']);
      const billingDate = findCol(['faturamento', 'billing', 'fat']);
      const channel = findCol(['canal', 'etapa', 'channel']);
      const orderDate = findCol(['data pedido', 'data do pedido']);

      if (!seller || !orderValue) continue;

      const sellerName = String(seller).trim();
      if (!sellerName) continue;
      sellersSet.add(sellerName);

      mapped.push({
        client_name: String(clientName).trim(),
        order_number: String(orderNumber).trim(),
        order_value: parseValue(orderValue),
        state: String(state).trim().toUpperCase(),
        seller_name: sellerName,
        billing_date: parseDate(billingDate) || parseDate(orderNumber),
        order_date: parseDate(orderDate) || parseDate(orderNumber),
        channel: String(channel).trim(),
      });
    }

    // Clean up temp file
    fs.unlink(req.file.path, () => {});

    // Get existing seller mappings
    const org = await getUserOrg(req.userId);
    let existingMappings = [];
    if (org) {
      const mapResult = await query(
        `SELECT m.seller_name, m.user_id, u.name as user_name
         FROM erp_seller_user_mapping m
         JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1`,
        [org.organization_id]
      );
      existingMappings = mapResult.rows;
    }

    // Get org users
    let orgUsers = [];
    if (org) {
      const usersResult = await query(
        `SELECT u.id, u.name FROM users u
         JOIN organization_members om ON om.user_id = u.id
         WHERE om.organization_id = $1 ORDER BY u.name`,
        [org.organization_id]
      );
      orgUsers = usersResult.rows;
    }

    res.json({
      rows: mapped,
      sellers: Array.from(sellersSet),
      existingMappings,
      orgUsers,
      totalValue: mapped.reduce((s, r) => s + r.order_value, 0),
    });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(500).json({ error: error.message });
  }
});

// Import billing records
router.post('/import', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { rows, sellerMapping } = req.body;
    // sellerMapping: { "SELLER NAME": "user-uuid" }

    if (!rows?.length) return res.status(400).json({ error: 'No rows to import' });

    const batchId = crypto.randomUUID();

    // Save/update seller mappings
    for (const [sellerName, userId] of Object.entries(sellerMapping || {})) {
      if (!userId) continue;
      await query(
        `INSERT INTO erp_seller_user_mapping (organization_id, seller_name, user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, seller_name) DO UPDATE SET user_id = $3`,
        [org.organization_id, sellerName, userId]
      );
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.billing_date || !row.seller_name) { skipped++; continue; }

      const linkedUserId = sellerMapping?.[row.seller_name] || null;

      // Check duplicate (same org + order_number — each order number is unique)
      if (row.order_number) {
        const dup = await query(
          `SELECT id FROM erp_billing_records
           WHERE organization_id = $1 AND order_number = $2`,
          [org.organization_id, row.order_number]
        );
        if (dup.rows.length > 0) { skipped++; continue; }
      }

      await query(
        `INSERT INTO erp_billing_records
         (organization_id, client_name, order_number, order_value, state, seller_name, billing_date, order_date, channel, linked_user_id, import_batch_id, imported_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::date, $9, $10, $11, $12)`,
        [
          org.organization_id, row.client_name, row.order_number, row.order_value,
          row.state, row.seller_name, row.billing_date, row.order_date || null,
          row.channel, linkedUserId, batchId, req.userId,
        ]
      );
      imported++;
    }

    res.json({ success: true, imported, skipped, batchId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get billing summary (for reports)
router.get('/summary', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { start_date, end_date, user_id } = req.query;
    const sd = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const ed = end_date || new Date().toISOString().split('T')[0];

    let userFilter = '';
    const params = [org.organization_id, sd, ed];
    if (user_id) {
      params.push(user_id);
      userFilter = ` AND b.linked_user_id = $${params.length}`;
    }

    // Total billing
    const totalResult = await query(
      `SELECT COUNT(*) as total_orders, COALESCE(SUM(order_value), 0) as total_value
       FROM erp_billing_records b
       WHERE b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date${userFilter}`,
      params
    );

    // By seller/user
    const bySellerResult = await query(
      `SELECT b.seller_name, b.linked_user_id, u.name as user_name, b.channel,
              COUNT(*) as order_count, COALESCE(SUM(b.order_value), 0) as total_value
       FROM erp_billing_records b
       LEFT JOIN users u ON u.id = b.linked_user_id
       WHERE b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date${userFilter}
       GROUP BY b.seller_name, b.linked_user_id, u.name, b.channel
       ORDER BY total_value DESC`,
      params
    );

    // By channel
    const byChannelResult = await query(
      `SELECT COALESCE(NULLIF(b.channel, ''), 'Sem canal') as channel,
              COUNT(*) as order_count, COALESCE(SUM(b.order_value), 0) as total_value
       FROM erp_billing_records b
       WHERE b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date${userFilter}
       GROUP BY channel
       ORDER BY total_value DESC`,
      params
    );

    // Timeline (daily)
    const timelineResult = await query(
      `SELECT b.billing_date::date as period,
              COUNT(*) as order_count, COALESCE(SUM(b.order_value), 0) as total_value
       FROM erp_billing_records b
       WHERE b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date${userFilter}
       GROUP BY b.billing_date::date
       ORDER BY period`,
      params
    );

    // By state
    const byStateResult = await query(
      `SELECT COALESCE(NULLIF(b.state, ''), 'N/A') as state,
              COUNT(*) as order_count, COALESCE(SUM(b.order_value), 0) as total_value
       FROM erp_billing_records b
       WHERE b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date${userFilter}
       GROUP BY state
       ORDER BY total_value DESC`,
      params
    );

    res.json({
      total: {
        orders: parseInt(totalResult.rows[0]?.total_orders || '0'),
        value: parseFloat(totalResult.rows[0]?.total_value || '0'),
      },
      bySeller: bySellerResult.rows.map(r => ({
        seller_name: r.seller_name,
        user_id: r.linked_user_id,
        user_name: r.user_name,
        channel: r.channel,
        order_count: parseInt(r.order_count),
        total_value: parseFloat(r.total_value),
      })),
      byChannel: byChannelResult.rows.map(r => ({
        channel: r.channel,
        order_count: parseInt(r.order_count),
        total_value: parseFloat(r.total_value),
      })),
      timeline: timelineResult.rows.map(r => ({
        period: r.period,
        order_count: parseInt(r.order_count),
        total_value: parseFloat(r.total_value),
      })),
      byState: byStateResult.rows.map(r => ({
        state: r.state,
        order_count: parseInt(r.order_count),
        total_value: parseFloat(r.total_value),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all records (paginated)
router.get('/records', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { start_date, end_date, seller_name, page = 1, limit = 50 } = req.query;
    const sd = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const ed = end_date || new Date().toISOString().split('T')[0];
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = `b.organization_id = $1 AND b.billing_date >= $2::date AND b.billing_date <= $3::date`;
    const params = [org.organization_id, sd, ed];

    if (seller_name) {
      params.push(seller_name);
      where += ` AND b.seller_name = $${params.length}`;
    }

    const countResult = await query(`SELECT COUNT(*) FROM erp_billing_records b WHERE ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    params.push(parseInt(limit), offset);
    const result = await query(
      `SELECT b.*, u.name as linked_user_name
       FROM erp_billing_records b
       LEFT JOIN users u ON u.id = b.linked_user_id
       WHERE ${where}
       ORDER BY b.billing_date DESC, b.order_value DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ records: result.rows, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete single record
router.delete('/records/:recordId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    await query(
      `DELETE FROM erp_billing_records WHERE organization_id = $1 AND id = $2`,
      [org.organization_id, req.params.recordId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete batch
router.delete('/batch/:batchId', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    await query(
      `DELETE FROM erp_billing_records WHERE organization_id = $1 AND import_batch_id = $2`,
      [org.organization_id, req.params.batchId]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove duplicates (keep oldest by created_at for same order_number)
router.post('/dedup', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `DELETE FROM erp_billing_records
       WHERE id IN (
         SELECT id FROM (
           SELECT id, ROW_NUMBER() OVER (
             PARTITION BY organization_id, order_number
             ORDER BY created_at ASC
           ) as rn
           FROM erp_billing_records
           WHERE organization_id = $1 AND order_number IS NOT NULL AND order_number != ''
         ) sub WHERE rn > 1
       )`,
      [org.organization_id]
    );
    res.json({ success: true, removed: result.rowCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get import history
router.get('/imports', async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT b.import_batch_id, u.name as imported_by_name, MIN(b.created_at) as imported_at,
              COUNT(*) as record_count, COALESCE(SUM(b.order_value), 0) as total_value,
              MIN(b.billing_date) as min_date, MAX(b.billing_date) as max_date
       FROM erp_billing_records b
       LEFT JOIN users u ON u.id = b.imported_by
       WHERE b.organization_id = $1
       GROUP BY b.import_batch_id, u.name
       ORDER BY imported_at DESC
       LIMIT 50`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
