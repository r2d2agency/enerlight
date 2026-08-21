import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

async function getUserContext(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role, u.is_superadmin,
            up.can_manage_representative_config
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     LEFT JOIN user_permissions up ON up.user_id = u.id AND up.organization_id = om.organization_id
     WHERE om.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// GET /api/online-quotes/price-lists
router.get('/price-lists', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const params = [context.organization_id];
    let whereClause = 'organization_id = $1';

    // If not admin/superadmin, filter by allowed_templates
    if (!context.is_superadmin && context.role !== 'owner' && context.role !== 'admin' && !context.can_manage_representative_config) {
        // Fetch user's permission template IDs if any
        const templateRes = await query(`SELECT id FROM permission_templates WHERE organization_id = $1 AND name = $2`, [context.organization_id, context.role]);
        const templateIds = templateRes.rows.map(r => r.id);
        
        whereClause += ` AND (allowed_templates = '{}' OR allowed_templates IS NULL OR allowed_templates && $2::uuid[])`;
        params.push(templateIds);
    }

    const result = await query(
      `SELECT * FROM price_lists WHERE ${whereClause} ORDER BY name ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/online-quotes/price-lists
router.post('/price-lists', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    // For now, allow owners/admins or anyone with the config permission
    const canManage = context.is_superadmin || ['owner', 'admin'].includes(context.role) || context.can_manage_representative_config;
    if (!canManage) return res.status(403).json({ error: 'FORBIDDEN' });

    const { name, description, segment, is_active, is_master, markup_percentage, allowed_templates, parent_id, custom_cover_url } = req.body;
    const result = await query(
      `INSERT INTO price_lists (organization_id, name, description, segment, is_active, is_master, markup_percentage, allowed_templates, parent_id, custom_cover_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [context.organization_id, name, description, segment, is_active ?? true, is_master ?? false, markup_percentage || 0, allowed_templates || [], parent_id || null, custom_cover_url || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/online-quotes/price-lists/:id
router.put('/price-lists/:id', async (req, res) => {
    try {
      const context = await getUserContext(req.userId);
      if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });
  
      const canManage = context.is_superadmin || ['owner', 'admin'].includes(context.role) || context.can_manage_representative_config;
      if (!canManage) return res.status(403).json({ error: 'FORBIDDEN' });
  
      const { name, description, segment, is_active, is_master, markup_percentage, allowed_templates, parent_id, custom_cover_url } = req.body;
      const result = await query(
        `UPDATE price_lists 
         SET name = $1, description = $2, segment = $3, is_active = $4, is_master = $5, markup_percentage = $6, allowed_templates = $7, parent_id = $8, custom_cover_url = $9, updated_at = NOW()
         WHERE id = $10 AND organization_id = $11
         RETURNING *`,
        [name, description, segment, is_active, is_master, markup_percentage, allowed_templates, parent_id || null, custom_cover_url || null, req.params.id, context.organization_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

// DELETE /api/online-quotes/price-lists/:id
router.delete('/price-lists/:id', async (req, res) => {
    try {
      const context = await getUserContext(req.userId);
      if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });
  
      const canManage = context.is_superadmin || ['owner', 'admin'].includes(context.role) || context.can_manage_representative_config;
      if (!canManage) return res.status(403).json({ error: 'FORBIDDEN' });
  
      const result = await query(
        `DELETE FROM price_lists WHERE id = $1 AND organization_id = $2 RETURNING id`,
        [req.params.id, context.organization_id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
});

// GET /api/online-quotes/items - All items for management
router.get('/items', async (req, res) => {
    try {
        const context = await getUserContext(req.userId);
        if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });
        
        const result = await query(
            `SELECT pli.* FROM price_list_items pli
             JOIN price_lists pl ON pl.id = pli.price_list_id
             WHERE pl.organization_id = $1
             ORDER BY pli.description ASC`,
            [context.organization_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
