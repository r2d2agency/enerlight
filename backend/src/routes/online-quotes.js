import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

// Helper: Get user's organization and groups
async function getUserContext(userId) {
  const orgResult = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  
  if (orgResult.rows.length === 0) return null;
  
  const groupsResult = await query(
    `SELECT group_id FROM crm_user_group_members WHERE user_id = $1`,
    [userId]
  );
  
  return {
    organizationId: orgResult.rows[0].organization_id,
    role: orgResult.rows[0].role,
    groupIds: groupsResult.rows.map(g => g.group_id)
  };
}

// Get accessible templates (Cover Pages)
router.get('/templates', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });

    const result = await query(
      `SELECT * FROM online_quote_templates WHERE organization_id = $1 ORDER BY is_default DESC, name ASC`,
      [ctx.organizationId]
    );
    res.json(result.rows);
  } catch (err) {
    logError('online-quotes.templates.get', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});


// Create/Update template
router.post('/templates', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { id, name, description, cover_url, header_text, footer_text, footer_config, fiscal_info, is_default } = req.body;

    
    if (is_default) {
      await query(`UPDATE online_quote_templates SET is_default = false WHERE organization_id = $1`, [ctx.organizationId]);
    }

    const fConfig = typeof footer_config === 'object' ? JSON.stringify(footer_config) : footer_config;

    if (id) {
      const result = await query(
        `UPDATE online_quote_templates 
         SET name = $1, description = $2, cover_url = $3, header_text = $4, footer_text = $5, footer_config = $6, fiscal_info = $7, is_default = $8, updated_at = NOW()
         WHERE id = $9 AND organization_id = $10 RETURNING *`,
        [name, description, cover_url, header_text, footer_text, fConfig, fiscal_info || '', is_default, id, ctx.organizationId]
      );
      res.json(result.rows[0]);
    } else {
      const result = await query(
        `INSERT INTO online_quote_templates 
         (organization_id, name, description, cover_url, header_text, footer_text, footer_config, fiscal_info, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [ctx.organizationId, name, description, cover_url, header_text, footer_text, fConfig, fiscal_info || '', is_default]
      );
      res.json(result.rows[0]);
    }

  } catch (err) {
    logError('online-quotes.templates.post', err);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// Get accessible price lists
router.get('/price-lists', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });

    // Admins and Managers see all. Sellers see lists assigned to them or their groups.
    let sql = `
      SELECT DISTINCT pl.* 
      FROM price_lists pl
      LEFT JOIN price_list_access pla ON pl.id = pla.price_list_id
      WHERE pl.organization_id = $1 AND pl.is_active = true
    `;
    
    const params = [ctx.organizationId];
    
    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      sql += ` AND (pla.user_id = $2 OR pla.group_id = ANY($3::uuid[]))`;
      params.push(req.userId, ctx.groupIds);
    }


    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    logError('online-quotes.price-lists.get', err);
    res.status(500).json({ error: 'Failed to fetch price lists' });
  }
});

// Create/Update a price list
router.post('/price-lists', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { id, name, description, segment, is_active, default_template_id } = req.body;
    
    if (id) {
      const result = await query(
        `UPDATE price_lists 
         SET name = $1, description = $2, segment = $3, is_active = $4, default_template_id = $5, updated_at = NOW()
         WHERE id = $6 AND organization_id = $7 RETURNING *`,
        [name, description, segment, is_active !== false, default_template_id || null, id, ctx.organizationId]
      );
      res.json(result.rows[0]);
    } else {
      const result = await query(
        `INSERT INTO price_lists (organization_id, name, description, segment, default_template_id) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [ctx.organizationId, name, description, segment, default_template_id || null]
      );
      res.json(result.rows[0]);
    }
  } catch (err) {
    logError('online-quotes.price-lists.post', err);
    res.status(500).json({ error: 'Failed to save price list' });
  }
});

// Get items for a price list
router.get('/price-lists/:id/items', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    // Security check: verify access to this price list
    const accessCheck = await query(
      `SELECT organization_id FROM price_lists WHERE id = $1`,
      [req.params.id]
    );
    
    if (accessCheck.rows.length === 0 || accessCheck.rows[0].organization_id !== ctx.organizationId) {
      return res.status(403).json({ error: 'Access denied to this price list' });
    }

    // Cost price is only returned for admins/managers
    const showCost = ctx.role === 'admin' || ctx.role === 'manager' || ctx.role === 'owner';
    const fields = showCost 
      ? 'id, product_code, product_name, description, sale_price, min_price, cost_price, unit, image_url'
      : 'id, product_code, product_name, description, sale_price, min_price, unit, image_url';

    const result = await query(
      `SELECT ${fields} FROM price_list_items WHERE price_list_id = $1 ORDER BY product_name ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    logError('online-quotes.price-list-items.get', err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// Update a single price list item (e.g. upload image)
router.patch('/price-lists/:id/items/:productCode', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    const { image_url } = req.body;
    
    await query(
      `UPDATE price_list_items SET image_url = $1, updated_at = NOW() 
       WHERE price_list_id = $2 AND product_code = $3`,
      [image_url, req.params.id, req.params.productCode]
    );
    res.json({ success: true });
  } catch (err) {
    logError('online-quotes.price-list-items.patch', err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// Bulk upsert price list items (from XLSX)
router.post('/price-lists/:id/items/bulk', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    const { items } = req.body; // items: { product_code, product_name, description, sale_price, cost_price, unit, image_url }
    
    for (const item of items) {
      await query(
        `INSERT INTO price_list_items 
         (price_list_id, product_code, product_name, description, sale_price, cost_price, unit, image_url, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (price_list_id, product_code) 
         DO UPDATE SET 
           product_name = EXCLUDED.product_name,
           description = EXCLUDED.description,
           sale_price = EXCLUDED.sale_price,
           cost_price = EXCLUDED.cost_price,
           unit = EXCLUDED.unit,
           image_url = EXCLUDED.image_url,
           updated_at = NOW()`,
        [req.params.id, item.product_code, item.product_name, item.description, item.sale_price, item.cost_price || 0, item.unit || 'un', item.image_url || null]
      );
    }
    res.json({ success: true, count: items.length });
  } catch (err) {
    logError('online-quotes.price-list-items.bulk', err);
    res.status(500).json({ error: 'Failed to bulk import items' });
  }
});

// Create a new quote
router.post('/quotes', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    const { 
      client_name, client_document, client_email, client_phone, 
      price_list_id, template_id, items, cover_image_url, footer_text, footer_config, valid_until, notes,
      include_images, payment_terms, payment_method
    } = req.body;

    const fConfig = typeof footer_config === 'object' ? JSON.stringify(footer_config) : footer_config;

    const result = await query(
      `INSERT INTO online_quotes 
       (organization_id, user_id, client_name, client_document, client_email, client_phone, 
        price_list_id, template_id, cover_image_url, footer_text, footer_config, valid_until, notes, 
        include_images, payment_terms, payment_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id`,
      [
        ctx.organizationId, req.userId, client_name, client_document, client_email, client_phone, 
        price_list_id, template_id || null, cover_image_url, footer_text, fConfig, valid_until, notes, 
        include_images ?? true, payment_terms, payment_method
      ]
    );

    
    const quoteId = result.rows[0].id;
    let totalValue = 0;
    let totalCost = 0;

    for (const item of items) {
      // Get current cost and image from price list item for snapshots
      const plItem = await query(
        `SELECT cost_price, image_url FROM price_list_items WHERE price_list_id = $1 AND product_code = $2`,
        [price_list_id, item.product_code]
      );
      const cost = plItem.rows[0]?.cost_price || 0;
      const imageUrl = plItem.rows[0]?.image_url || null;
      const unitPrice = Number(item.unit_price) || 0;
      const discount = Number(item.discount) || 0;
      const discountType = item.discount_type || 'fixed';
      
      const discountValue = discountType === 'percentage' 
        ? (unitPrice * discount / 100)
        : discount;
      
      const finalPrice = Math.max(0, unitPrice - discountValue);
      const subtotal = (Number(item.quantity) || 0) * finalPrice;
      
      await query(
        `INSERT INTO online_quote_items 
         (quote_id, product_code, product_name, quantity, unit_price, cost_price, total_price, image_url, discount_type, discount_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [quoteId, item.product_code, item.product_name, item.quantity, unitPrice, cost, subtotal, imageUrl, discountType, discount]
      );
      
      totalValue += subtotal;
      totalCost += (item.quantity * cost);
    }

    const marginPercent = totalValue > 0 ? ((totalValue - totalCost) / totalValue) * 100 : 0;
    
    await query(
      `UPDATE online_quotes SET total_value = $1, total_cost = $2, margin_percent = $3 WHERE id = $4`,
      [totalValue, totalCost, marginPercent, quoteId]
    );

    res.json({ id: quoteId, total_value: totalValue });
  } catch (err) {
    logError('online-quotes.create', err);
    res.status(500).json({ error: 'Failed to create quote' });
  }
});

// Update an existing quote
router.put('/quotes/:id', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });

    const { 
      client_name, client_document, client_email, client_phone, 
      price_list_id, template_id, items, cover_image_url, footer_text, footer_config, valid_until, notes,
      include_images, payment_terms, payment_method, status
    } = req.body;

    const fConfig = typeof footer_config === 'object' ? JSON.stringify(footer_config) : footer_config;

    // Verify ownership/access
    const existingCheck = await query(
      `SELECT user_id FROM online_quotes WHERE id = $1 AND organization_id = $2`,
      [req.params.id, ctx.organizationId]
    );

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner' && existingCheck.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Unauthorized to update this quote' });
    }

    // Update main quote record
    await query(
      `UPDATE online_quotes 
       SET client_name = $1, client_document = $2, client_email = $3, client_phone = $4, 
           price_list_id = $5, template_id = $6, cover_image_url = $7, footer_text = $8, 
           footer_config = $9, valid_until = $10, notes = $11, include_images = $12, 
           payment_terms = $13, payment_method = $14, status = COALESCE($15, status), updated_at = NOW()
       WHERE id = $16`,
      [
        client_name, client_document, client_email, client_phone, 
        price_list_id, template_id || null, cover_image_url, footer_text, 
        fConfig, valid_until, notes, include_images ?? true, 
        payment_terms, payment_method, status, req.params.id
      ]
    );

    // Refresh items: simpler to delete and re-insert
    await query(`DELETE FROM online_quote_items WHERE quote_id = $1`, [req.params.id]);

    let totalValue = 0;
    let totalCost = 0;

    for (const item of items) {
      const plItem = await query(
        `SELECT cost_price, image_url FROM price_list_items WHERE price_list_id = $1 AND product_code = $2`,
        [price_list_id, item.product_code]
      );
      const cost = plItem.rows[0]?.cost_price || 0;
      const imageUrl = plItem.rows[0]?.image_url || item.image_url || null;
      
      const unitPrice = Number(item.unit_price) || 0;
      const discount = Number(item.discount) || 0;
      const discountType = item.discount_type || 'fixed';
      
      const discountValue = discountType === 'percentage' 
        ? (unitPrice * discount / 100)
        : discount;
      
      const finalPrice = Math.max(0, unitPrice - discountValue);
      const subtotal = (Number(item.quantity) || 0) * finalPrice;
      
      await query(
        `INSERT INTO online_quote_items 
         (quote_id, product_code, product_name, quantity, unit_price, cost_price, total_price, image_url, discount_type, discount_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [req.params.id, item.product_code, item.product_name, item.quantity, unitPrice, cost, subtotal, imageUrl, discountType, discount]
      );
      
      totalValue += subtotal;
      totalCost += ((Number(item.quantity) || 0) * cost);
    }

    const marginPercent = totalValue > 0 ? ((totalValue - totalCost) / totalValue) * 100 : 0;
    
    await query(
      `UPDATE online_quotes SET total_value = $1, total_cost = $2, margin_percent = $3 WHERE id = $4`,
      [totalValue, totalCost, marginPercent, req.params.id]
    );

    res.json({ id: req.params.id, total_value: totalValue });
  } catch (err) {
    logError('online-quotes.update', err);
    res.status(500).json({ error: 'Failed to update quote' });
  }
});

// Get all quotes for the organization
router.get('/quotes', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    
    let sql = `SELECT * FROM online_quotes WHERE organization_id = $1`;
    const params = [ctx.organizationId];
    
    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      sql += ` AND user_id = $2`;
      params.push(req.userId);
    }

    
    sql += ` ORDER BY created_at DESC`;
    
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    logError('online-quotes.quotes.get', err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// Get a single quote with items
router.get('/quotes/:id', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    const quote = await query(
      `SELECT q.*, t.cover_url as template_cover, t.header_text as template_header, t.footer_text as template_footer, t.footer_config as template_footer_config, t.fiscal_info as template_fiscal_info
       FROM online_quotes q
       LEFT JOIN online_quote_templates t ON q.template_id = t.id
       WHERE q.id = $1 AND q.organization_id = $2`,
      [req.params.id, ctx.organizationId]
    );

    
    if (quote.rows.length === 0) return res.status(404).json({ error: 'Quote not found' });
    
    const items = await query(
      `SELECT * FROM online_quote_items WHERE quote_id = $1`,
      [req.params.id]
    );
    
    res.json({ ...quote.rows[0], items: items.rows });
  } catch (err) {
    logError('online-quotes.quote.get', err);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Create organization company from quote data
router.post('/companies/create-from-quote', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);

    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });

    const { name, document, email, phone } = req.body;
    
    // Check if company already exists
    const existing = await query(
      `SELECT id FROM crm_companies WHERE organization_id = $1 AND (cnpj = $2 OR name = $3)`,
      [ctx.organizationId, document, name]
    );

    if (existing.rows.length > 0) {
      return res.json({ id: existing.rows[0].id, alreadyExists: true });
    }

    const result = await query(
      `INSERT INTO crm_companies (organization_id, name, cnpj, email, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [ctx.organizationId, name, document, email, phone]
    );

    res.json({ id: result.rows[0].id });
  } catch (err) {
    logError('online-quotes.companies.create', err);
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// Delete a price list
router.post('/price-lists/delete/:id', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await query(`DELETE FROM price_list_items WHERE price_list_id = $1`, [req.params.id]);
    await query(`DELETE FROM price_lists WHERE id = $1 AND organization_id = $2`, [req.params.id, ctx.organizationId]);

    res.json({ success: true });
  } catch (err) {
    logError('online-quotes.price-lists.delete', err);
    res.status(500).json({ error: 'Failed to delete price list' });
  }
});

// Delete a quote (Support both DELETE and POST /delete/:id)
const deleteQuoteHandler = async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });

    // Admins/Managers can delete any quote in their org. Sellers only their own.
    let sql = `DELETE FROM online_quotes WHERE id = $1 AND organization_id = $2`;
    const params = [req.params.id, ctx.organizationId];

    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      sql += ` AND user_id = $3`;
      params.push(req.userId);
    }

    const result = await query(sql, params);
    
    // online_quote_items should be deleted automatically via ON DELETE CASCADE in DB
    // but we ensure it here
    await query(`DELETE FROM online_quote_items WHERE quote_id = $1`, [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    logError('online-quotes.quotes.delete', err);
    res.status(500).json({ error: 'Failed to delete quote' });
  }
};

router.delete('/quotes/:id', deleteQuoteHandler);
router.post('/quotes/delete/:id', deleteQuoteHandler);

export default router;
