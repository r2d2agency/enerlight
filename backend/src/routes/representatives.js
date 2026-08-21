import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

async function getUserContext(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role, u.is_superadmin,
            up.can_manage_representative_config, up.can_view_representative_dashboard as is_representative
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     LEFT JOIN user_permissions up ON up.user_id = u.id AND up.organization_id = om.organization_id
     WHERE om.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

// GET /api/representatives/catalog
router.get('/catalog', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const { category, subcategory, brand, search, price_list_id } = req.query;
    
    let queryStr = `
      SELECT pli.*, pl.name as price_list_name, pl.markup_percentage
      FROM price_list_items pli
      JOIN price_lists pl ON pl.id = pli.price_list_id
      WHERE pl.organization_id = $1 AND pl.is_active = true
    `;
    const params = [context.organization_id];

    if (price_list_id) {
      queryStr += ` AND pli.price_list_id = $${params.length + 1}`;
      params.push(price_list_id);
    }

    if (category) {
      queryStr += ` AND pli.category = $${params.length + 1}`;
      params.push(category);
    }
    if (subcategory) {
      queryStr += ` AND pli.subcategory = $${params.length + 1}`;
      params.push(subcategory);
    }
    if (brand) {
      queryStr += ` AND pli.brand = $${params.length + 1}`;
      params.push(brand);
    }
    if (search) {
      queryStr += ` AND (pli.description ILIKE $${params.length + 1} OR pli.code ILIKE $${params.length + 1})`;
      params.push(`%${search}%`);
    }

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/cart
router.get('/cart', async (req, res) => {
  try {
    const result = await query(
      `SELECT ci.*, pli.description, pli.code, pli.sale_price, pli.cost_price, pli.brand
       FROM cart_items ci
       JOIN price_list_items pli ON pli.id = ci.item_id
       WHERE ci.user_id = $1`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/representatives/cart
router.post('/cart', async (req, res) => {
  try {
    const { item_id, quantity } = req.body;
    const result = await query(
      `INSERT INTO cart_items (user_id, item_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, item_id) 
       DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = NOW()
       RETURNING *`,
      [req.userId, item_id, quantity || 1]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/representatives/cart/:id
router.delete('/cart/:id', async (req, res) => {
  try {
    await query(`DELETE FROM cart_items WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
