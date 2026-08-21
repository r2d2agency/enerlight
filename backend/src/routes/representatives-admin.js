import express from 'express';
import { query } from '../db.js';
import { getUserContext, logAudit } from './representatives.js';

const router = express.Router();


// Administrative Endpoints for Managers/Admins


// GET /api/representatives/admin/list
router.get('/admin/list', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context || (!context.is_superadmin && context.role !== 'owner' && context.role !== 'admin')) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }

    const { search, status } = req.query;
    let queryStr = `
      SELECT cr.*, u.email, u.status as user_status,
             (u.status = 'active') as is_active
      FROM crm_representatives cr
      JOIN users u ON u.id = cr.linked_user_id
      WHERE cr.organization_id = $1
    `;
    const params = [context.organization_id];

    if (search) {
      queryStr += ` AND (cr.name ILIKE $2 OR u.email ILIKE $2 OR cr.region ILIKE $2)`;
      params.push(`%${search}%`);
    }

    if (status === 'active') {
      queryStr += ` AND u.status = 'active'`;
    } else if (status === 'inactive') {
      queryStr += ` AND u.status != 'active'`;
    }

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/representatives/admin/reps/:id/status
router.patch('/admin/reps/:id/status', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context || (!context.is_superadmin && context.role !== 'owner' && context.role !== 'admin')) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }

    const { active } = req.body;
    const repId = req.params.id;

    const repResult = await query(`SELECT linked_user_id FROM crm_representatives WHERE id = $1`, [repId]);
    if (repResult.rows.length === 0) return res.status(404).json({ error: 'REP_NOT_FOUND' });

    const userId = repResult.rows[0].linked_user_id;
    await query(`UPDATE users SET status = $1 WHERE id = $2`, [active ? 'active' : 'inactive', userId]);
    
    await logAudit(req.userId, context.organization_id, active ? 'activate_rep' : 'deactivate_rep', 'representative', repId, { active });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/admin/all-quotes
router.get('/admin/all-quotes', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context || (!context.is_superadmin && context.role !== 'owner' && context.role !== 'admin')) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }

    const { search, status, rep_id } = req.query;
    let queryStr = `
      SELECT d.*, c.name as customer_name, cr.name as rep_name
      FROM crm_deals d
      LEFT JOIN rep_customers c ON c.id = d.rep_customer_id
      JOIN crm_representatives cr ON cr.id = d.representative_id
      WHERE cr.organization_id = $1
    `;
    const params = [context.organization_id];

    if (search) {
      queryStr += ` AND (d.title ILIKE $${params.length + 1} OR c.name ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    if (status && status !== 'all') {
      queryStr += ` AND d.status = $${params.length + 1}`;
      params.push(status);
    }

    if (rep_id && rep_id !== 'all') {
      queryStr += ` AND d.representative_id = $${params.length + 1}`;
      params.push(rep_id);
    }

    queryStr += ` ORDER BY d.created_at DESC`;
    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/admin/stats
router.get('/admin/stats', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context || (!context.is_superadmin && context.role !== 'owner' && context.role !== 'admin')) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }

    const repsCount = await query(`SELECT COUNT(*) FROM crm_representatives WHERE organization_id = $1`, [context.organization_id]);
    const quotesCount = await query(`
      SELECT COUNT(*) FROM crm_deals d 
      JOIN crm_representatives cr ON cr.id = d.representative_id 
      WHERE cr.organization_id = $1`, [context.organization_id]);
    const salesVolume = await query(`
      SELECT SUM(value) FROM crm_deals d 
      JOIN crm_representatives cr ON cr.id = d.representative_id 
      WHERE cr.organization_id = $1 AND d.status = 'convertido'`, [context.organization_id]);
    const productsCount = await query(`SELECT COUNT(*) FROM price_list_items pli JOIN price_lists pl ON pl.id = pli.price_list_id WHERE pl.organization_id = $1`, [context.organization_id]);

    res.json({
      total_representatives: repsCount.rows[0].count,
      total_quotes: quotesCount.rows[0].count,
      sales_volume: salesVolume.rows[0].sum || 0,
      total_products: productsCount.rows[0].count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/admin/performance
router.get('/admin/performance', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context || (!context.is_superadmin && context.role !== 'owner' && context.role !== 'admin')) {
      return res.status(403).json({ error: 'ACCESS_DENIED' });
    }

    const result = await query(`
      SELECT cr.name, 
             COUNT(d.id) as total_quotes,
             COUNT(d.id) FILTER (WHERE d.status = 'convertido') as converted_quotes,
             SUM(d.value) FILTER (WHERE d.status = 'convertido') as sales_value
      FROM crm_representatives cr
      LEFT JOIN crm_deals d ON d.representative_id = cr.id
      WHERE cr.organization_id = $1
      GROUP BY cr.id, cr.name
      ORDER BY sales_value DESC NULLS LAST
      LIMIT 10
    `, [context.organization_id]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;
