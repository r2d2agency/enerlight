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


async function getRepresentativeId(userId, organizationId) {
  const repResult = await query(
    `SELECT id FROM crm_representatives WHERE linked_user_id = $1 AND organization_id = $2 LIMIT 1`,
    [userId, organizationId]
  );
  return repResult.rows[0]?.id;
}

// GET /api/representatives/customers
router.get('/customers', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    if (!repId) return res.status(403).json({ error: 'REPRESENTATIVE_NOT_FOUND' });

    const { search } = req.query;
    let queryStr = `SELECT * FROM rep_customers WHERE representative_id = $1`;
    const params = [repId];

    if (search) {
      queryStr += ` AND (name ILIKE $2 OR trading_name ILIKE $2 OR cpf_cnpj ILIKE $2 OR email ILIKE $2)`;
      params.push(`%${search}%`);
    }

    queryStr += ` ORDER BY name ASC`;
    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/representatives/customers
router.post('/customers', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    if (!repId) return res.status(403).json({ error: 'REPRESENTATIVE_NOT_FOUND' });

    const { name, trading_name, cpf_cnpj, contact_name, phone, email, address, city, state, zip_code, notes } = req.body;
    
    const result = await query(
      `INSERT INTO rep_customers (
        representative_id, name, trading_name, cpf_cnpj, contact_name, 
        phone, email, address, city, state, zip_code, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [repId, name, trading_name, cpf_cnpj, contact_name, phone, email, address, city, state, zip_code, notes]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/representatives/customers/:id
router.put('/customers/:id', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    if (!repId) return res.status(403).json({ error: 'REPRESENTATIVE_NOT_FOUND' });

    const { name, trading_name, cpf_cnpj, contact_name, phone, email, address, city, state, zip_code, notes } = req.body;
    
    const result = await query(
      `UPDATE rep_customers 
       SET name = $1, trading_name = $2, cpf_cnpj = $3, contact_name = $4, 
           phone = $5, email = $6, address = $7, city = $8, state = $9, 
           zip_code = $10, notes = $11, updated_at = NOW()
       WHERE id = $12 AND representative_id = $13
       RETURNING *`,
      [name, trading_name, cpf_cnpj, contact_name, phone, email, address, city, state, zip_code, notes, req.params.id, repId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/customers/:id/quotes
router.get('/customers/:id/quotes', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    if (!repId) return res.status(403).json({ error: 'REPRESENTATIVE_NOT_FOUND' });

    // Check if customer belongs to this representative
    const customerCheck = await query(
      `SELECT id FROM rep_customers WHERE id = $1 AND representative_id = $2`,
      [req.params.id, repId]
    );
    if (customerCheck.rows.length === 0) return res.status(404).json({ error: 'CUSTOMER_NOT_FOUND' });

    const result = await query(
      `SELECT * FROM crm_deals 
       WHERE representative_id = $1 AND rep_customer_id = $2 
       ORDER BY created_at DESC`,
      [repId, req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// POST /api/representatives/checkout
router.post('/checkout', async (req, res) => {
  try {
    const { company_id, rep_customer_id, contact_name, contact_phone, title, notes } = req.body;
    const context = await getUserContext(req.userId);
    
    // 1. Get cart items
    const cartItems = await query(
      `SELECT ci.*, pli.description, pli.sale_price, pli.code
       FROM cart_items ci
       JOIN price_list_items pli ON pli.id = ci.item_id
       WHERE ci.user_id = $1`,
      [req.userId]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

    const totalValue = cartItems.rows.reduce((acc, item) => acc + (item.sale_price * item.quantity), 0);

    // 2. Find representative ID linked to this user
    const repResult = await query(
      `SELECT id FROM crm_representatives WHERE linked_user_id = $1 AND organization_id = $2 LIMIT 1`,
      [req.userId, context.organization_id]
    );
    const representativeId = repResult.rows[0]?.id;

    // 3. Create CRM deal
    const dealResult = await query(
      `INSERT INTO crm_deals (
        organization_id, title, value, status, 
        company_id, rep_customer_id, representative_id, created_by, description
      ) VALUES ($1, $2, $3, 'open', $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        context.organization_id, 
        title || `Orçamento Representante - ${new Date().toLocaleDateString()}`,
        totalValue,
        company_id || null,
        rep_customer_id || null,
        representativeId,
        req.userId,
        notes
      ]
    );

    const dealId = dealResult.rows[0].id;

    // 4. Create history/notes for the deal with products
    const productList = cartItems.rows.map(item => `- ${item.description} (${item.code}): ${item.quantity} x ${item.sale_price}`).join('\n');
    await query(
      `INSERT INTO crm_deal_history (deal_id, user_id, content, type)
       VALUES ($1, $2, $3, 'note')`,
      [dealId, req.userId, `Orçamento gerado pelo catálogo:\n${productList}`]
    );

    // 5. Clear cart
    await query(`DELETE FROM cart_items WHERE user_id = $1`, [req.userId]);

    res.json({ success: true, deal_id: dealId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
