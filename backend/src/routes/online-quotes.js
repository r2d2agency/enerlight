import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logError, logWarn } from '../logger.js';

const router = express.Router();
router.use(authenticate);

// Helper: Get user's organization and groups
async function getUserContext(userId) {
  try {
    const userBase = await query(`SELECT id, is_superadmin FROM users WHERE id = $1`, [userId]);
    if (userBase.rows.length === 0) return null;
    
    const isSuperadmin = userBase.rows[0].is_superadmin === true;

    const userResult = await query(
      `SELECT om.organization_id, om.role, om.permission_template_id
       FROM organization_members om
       WHERE om.user_id = $1 AND om.status = 'active'
       ORDER BY (CASE WHEN om.role = 'owner' THEN 1 WHEN om.role = 'admin' THEN 2 WHEN om.role = 'manager' THEN 3 ELSE 4 END) ASC`,
      [userId]
    );
    
    const organizationId = userResult.rows[0]?.organization_id || null;
    const role = isSuperadmin ? 'owner' : (userResult.rows[0]?.role || null);
    const permissionTemplateId = userResult.rows[0]?.permission_template_id || null;
    const allOrgIds = userResult.rows.map(r => r.organization_id);

    const groupsResult = await query(
      `SELECT group_id FROM crm_user_group_members WHERE user_id = $1`,
      [userId]
    );
    
    return {
      organizationId,
      allOrgIds,
      role,
      isSuperadmin,
      permissionTemplateId,
      groupIds: groupsResult.rows.map(g => g.group_id)
    };
  } catch (err) {
    logError('online-quotes.getUserContext', err, { userId });
    return null;
  }
}

// Get accessible templates (Cover Pages)
router.get('/templates', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.json([]);
    
    const orgIds = ctx.allOrgIds || [];
    let sql = `SELECT * FROM online_quote_templates`;
    const params = [];

    if (ctx.isSuperadmin) {
      // Superadmins see all
    } else if (orgIds.length > 0) {
      sql += ` WHERE (organization_id = ANY($1::uuid[]) OR organization_id IS NULL)`;
      params.push(orgIds);
    } else {
      // Return empty if no org and not superadmin
      return res.json([]);
    }

    sql += ` ORDER BY is_default DESC, name ASC`;

    const result = await query(sql, params);
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
    if (!ctx) {
      logError('online-quotes.templates.post', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    // Allow owner, admin, manager OR users with specific permissions (can_manage_online_quotes, can_edit_price_lists, can_manage_quotes)
    const canManage = ctx.isSuperadmin || 
      ['owner', 'admin', 'manager'].includes(ctx.role) || 
      req.userPermissions?.can_manage_online_quotes || 
      req.userPermissions?.can_edit_price_lists || 
      req.userPermissions?.can_manage_quotes;

    if (!canManage) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    const { id, name, description, cover_url, header_text, footer_text, footer_config, fiscal_info, is_default } = req.body;

    
    if (is_default) {
      await query(`UPDATE online_quote_templates SET is_default = false WHERE organization_id = $1 OR $2 = true`, [orgId, ctx.isSuperadmin]);
    }

    const fConfig = typeof footer_config === 'object' ? JSON.stringify(footer_config) : footer_config;

    if (id) {
      const result = await query(
        `UPDATE online_quote_templates 
         SET name = $1, description = $2, cover_url = $3, header_text = $4, footer_text = $5, footer_config = $6, is_default = $7, updated_at = NOW()
         WHERE id = $8 AND (organization_id = $9 OR $10 = true) RETURNING *`,
        [name, description, cover_url, header_text, footer_text, fConfig, is_default, id, orgId, ctx.isSuperadmin]

      );
      res.json(result.rows[0]);
    } else {
      const result = await query(
        `INSERT INTO online_quote_templates 
         (organization_id, name, description, cover_url, header_text, footer_text, footer_config, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [orgId, name, description, cover_url, header_text, footer_text, fConfig, is_default]
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
    if (!ctx) return res.json([]);
    
    const orgId = ctx.organizationId;

    // Admins and Managers see all. Sellers see lists assigned to them or their groups.
    let sql = `
      SELECT DISTINCT pl.* 
      FROM price_lists pl
      LEFT JOIN price_list_access pla ON pl.id = pla.price_list_id
      WHERE pl.is_active = true
    `;
    const params = [];

    if (ctx.isSuperadmin) {
       // Superadmin sees all active lists across orgs? 
       // Usually we filter by org unless it's global.
       const orgIds = ctx.allOrgIds || [];
       if (orgIds.length > 0) {
         sql += ` AND pl.organization_id = ANY($1::uuid[])`;
         params.push(orgIds);
       }
    } else if (ctx.allOrgIds && ctx.allOrgIds.length > 0) {
      sql += ` AND pl.organization_id = ANY($1::uuid[])`;
      params.push(ctx.allOrgIds);

      if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner' && !req.userPermissions?.can_manage_online_quotes) {
        sql += ` AND (
          pla.user_id = $2 OR pla.group_id = ANY($3::uuid[])
          OR 
          pl.allowed_templates IS NULL OR pl.allowed_templates = '[]'::jsonb OR pl.allowed_templates @> jsonb_build_array($4::text)
          OR
          pl.allowed_templates @> jsonb_build_array('')
        )`;
        params.push(req.userId, ctx.groupIds || [], ctx.permissionTemplateId || '');
      }
    } else {
      return res.json([]);
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
    if (!ctx) {
      logError('online-quotes.price-lists.post', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    // Allow owner, admin, manager OR users with specific permissions
    const canManage = ctx.isSuperadmin || 
      ['owner', 'admin'].includes(ctx.role) || 
      req.userPermissions?.can_manage_online_quotes || 
      req.userPermissions?.can_edit_price_lists || 
      req.userPermissions?.can_manage_quotes;

    if (!canManage) {
      logWarn('online-quotes.price-lists.post.unauthorized', { userId: req.userId, role: ctx.role, permissions: req.userPermissions });
      return res.status(403).json({ error: 'Unauthorized access' });
    }
    const { id, name, description, segment, is_active, default_template_id, allowed_templates } = req.body;
    
    let allowedTemplates = '[]';
    if (Array.isArray(allowed_templates)) {
      // Se não houver nada selecionado na UI, salvamos como [''] para indicar acesso global/fallback
      allowedTemplates = allowed_templates.length === 0 ? '[""]' : JSON.stringify(allowed_templates);
    }

    if (id) {
      const result = await query(
        `UPDATE price_lists 
         SET name = $1, description = $2, segment = $3, is_active = $4, default_template_id = $5, allowed_templates = $6, updated_at = NOW()
         WHERE id = $7 AND (organization_id = $8 OR $9 = true) RETURNING *`,
        [name, description, segment, is_active !== false, default_template_id || null, allowedTemplates, id, orgId, ctx.isSuperadmin]

      );
      res.json(result.rows[0]);
    } else {
      const result = await query(
        `INSERT INTO price_lists (organization_id, name, description, segment, default_template_id, allowed_templates) 
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [orgId, name, description, segment, default_template_id || null, allowedTemplates]

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

    if (!ctx) {
      logError('online-quotes.price-list-items.get', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    // Security check: verify access to this price list
    const accessCheck = await query(
      `SELECT organization_id FROM price_lists WHERE id = $1`,
      [req.params.id]
    );
    
    if (accessCheck.rows.length === 0 || (accessCheck.rows[0].organization_id !== orgId && !ctx.isSuperadmin)) {
      return res.status(403).json({ error: 'Access denied to this price list' });
    }


    // Cost price is only returned for admins/managers or those with permissions
    const showCost = ctx.isSuperadmin || 
      ['owner', 'admin', 'manager'].includes(ctx.role) || 
      req.userPermissions?.can_manage_online_quotes || 
      req.userPermissions?.can_edit_price_lists || 
      req.userPermissions?.can_manage_quotes;
    const fields = showCost 
      ? 'id, product_code, product_name, description, sale_price, min_price, cost_price, unit, image_url, category, subcategory, brand'
      : 'id, product_code, product_name, description, sale_price, min_price, unit, image_url, category, subcategory, brand';

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

// Update a single price list item
router.patch('/price-lists/:id/items/:productCode', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) {
      logError('online-quotes.price-list-items.patch', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }


    const { 
      product_name, description, sale_price, cost_price, 
      unit, image_url, category, subcategory, brand 
    } = req.body;
    
    await query(
      `UPDATE price_list_items 
       SET product_name = COALESCE($1, product_name),
           description = COALESCE($2, description),
           sale_price = COALESCE($3, sale_price),
           cost_price = COALESCE($4, cost_price),
           unit = COALESCE($5, unit),
           image_url = COALESCE($6, image_url),
           category = COALESCE($7, category),
           subcategory = COALESCE($8, subcategory),
           brand = COALESCE($9, brand),
           updated_at = NOW() 
       WHERE price_list_id = $10 AND product_code = $11 AND (EXISTS (SELECT 1 FROM price_lists WHERE id = $10 AND organization_id = $12) OR $13 = true)`,
      [
        product_name, description, sale_price, cost_price, 
        unit, image_url, category, subcategory, brand,
        req.params.id, req.params.productCode, orgId, ctx.isSuperadmin
      ]

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

    if (!ctx) {
      logError('online-quotes.price-list-items.bulk', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    // Security check: verify access to this price list
    const accessCheck = await query(
      `SELECT organization_id FROM price_lists WHERE id = $1`,
      [req.params.id]
    );
    
    if (accessCheck.rows.length === 0 || (accessCheck.rows[0].organization_id !== orgId && !ctx.isSuperadmin)) {
      return res.status(403).json({ error: 'Access denied to this price list' });
    }

    const { items } = req.body;

    
    for (const item of items) {
      await query(
        `INSERT INTO price_list_items 
         (price_list_id, product_code, product_name, description, sale_price, cost_price, unit, image_url, category, subcategory, brand, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (price_list_id, product_code) 
         DO UPDATE SET 
           product_name = EXCLUDED.product_name,
           description = EXCLUDED.description,
           sale_price = EXCLUDED.sale_price,
           cost_price = EXCLUDED.cost_price,
           unit = EXCLUDED.unit,
           image_url = EXCLUDED.image_url,
           category = EXCLUDED.category,
           subcategory = EXCLUDED.subcategory,
           brand = EXCLUDED.brand,
           updated_at = NOW()`,
        [req.params.id, item.product_code, item.product_name, item.description, item.sale_price, item.cost_price || 0, item.unit || 'un', item.image_url || null, item.category || null, item.subcategory || null, item.brand || null]
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
    if (!ctx) {
      logError('online-quotes.create', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    const { 
      client_name, client_document, client_email, client_phone, 
      price_list_id, template_id, items, cover_image_url, fiscal_info, footer_text, footer_config, valid_until, notes,
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
        orgId, req.userId, client_name, client_document, client_email, client_phone, 
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
    if (!ctx) {
      logError('online-quotes.update', new Error(`Unauthorized access attempt or user not found: ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }


    const { 
      client_name, client_document, client_email, client_phone, 
      price_list_id, template_id, items, cover_image_url, fiscal_info, footer_text, footer_config, valid_until, notes,
      include_images, payment_terms, payment_method, status
    } = req.body;

    const fConfig = typeof footer_config === 'object' ? JSON.stringify(footer_config) : footer_config;

    // Verify ownership/access
    const existingCheck = await query(
      `SELECT user_id FROM online_quotes WHERE id = $1 AND (organization_id = $2 OR $3 = true)`,
      [req.params.id, orgId, ctx.isSuperadmin]

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
    if (!ctx) return res.json([]);
    
    const orgIds = ctx.allOrgIds || [];

    let sql = `
      SELECT q.*, q.client_document as cnpj, u.name as user_name 
      FROM online_quotes q 
      LEFT JOIN users u ON q.user_id = u.id
      WHERE 1=1`;
    const params = [];

    if (ctx.isSuperadmin) {
      if (orgIds.length > 0) {
        sql += ` AND (q.organization_id = ANY($1::uuid[]) OR q.organization_id IS NULL)`;
        params.push(orgIds);
      }
    } else if (orgIds.length > 0) {
      sql += ` AND (q.organization_id = ANY($1::uuid[]) OR q.organization_id IS NULL)`;
      params.push(orgIds);

      if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner' && ctx.role !== 'supervisor' && !req.userPermissions?.can_manage_online_quotes) {
        sql += ` AND q.user_id = $${params.length + 1}`;
        params.push(req.userId);
      }
    } else {
      return res.json([]);
    }
    
    sql += ` ORDER BY q.created_at DESC`;
    
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
    if (!ctx) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const orgIds = ctx.allOrgIds || [];
    const isExport = req.query.export === 'true';
    
    // For exports/previews, we might want to relax the organization check if it's a valid quote ID
    // and the user has some relation to it (is admin or the creator).
    let quoteSql = `
       SELECT q.*, t.cover_url as template_cover, t.header_text as template_header, t.footer_text as template_footer, t.footer_config as template_footer_config
       FROM online_quotes q
       LEFT JOIN online_quote_templates t ON q.template_id = t.id
       WHERE q.id = $1`;
    
    const quoteParams = [req.params.id];

    if (!ctx.isSuperadmin) {
      quoteSql += ` AND (q.organization_id = ANY($2::uuid[]) OR q.organization_id IS NULL OR q.user_id = $3)`;
      quoteParams.push(orgIds);
      quoteParams.push(req.userId);
    }

    const quote = await query(quoteSql, quoteParams);

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


// Delete a quote (Support both DELETE and POST /delete/:id)
const deleteQuoteHandler = async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) {
      logError('online-quotes.quotes.delete', new Error(`Unauthorized access attempt for user ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    // Admins/Managers can delete any quote in their org. Sellers only their own.
    let sql = `DELETE FROM online_quotes WHERE id = $1 AND (organization_id = $2 OR $3 = true)`;
    const params = [req.params.id, orgId, ctx.isSuperadmin];

    const canManageAll = ctx.isSuperadmin || 
      ['owner', 'admin', 'manager'].includes(ctx.role) || 
      req.userPermissions?.can_manage_online_quotes || 
      req.userPermissions?.can_manage_quotes;

    if (!canManageAll) {
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

// Create company from quote data (isolated for representatives)
router.post('/companies/create-from-quote', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) {
      logError('online-quotes.companies.create-from-quote', new Error(`Unauthorized access attempt for user ${req.userId}`));
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const orgId = ctx.organizationId;
    if (!orgId && !ctx.isSuperadmin) {
      return res.status(403).json({ error: 'User not associated with any organization' });
    }

    const { name, document, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'Company name is required' });

    const cnpj = document ? document.replace(/\D/g, '') : null;

    // Isolation logic: representatives only see/reuse their own created companies
    let checkSql = `SELECT id FROM crm_companies WHERE (organization_id = $1 OR organization_id IS NULL) AND (name = $2`;
    const checkParams = [orgId, name];

    if (cnpj) {
      checkSql += ` OR cnpj = $3`;
      checkParams.push(cnpj);
    }
    checkSql += `)`;

    if (ctx.role === 'representative') {
      checkSql += ` AND created_by = $${checkParams.length + 1}`;
      checkParams.push(req.userId);
    }

    const existing = await query(checkSql, checkParams);
    if (existing.rows.length > 0) {
      return res.json({ id: existing.rows[0].id, existing: true });
    }

    // Create new company
    const result = await query(
      `INSERT INTO crm_companies (organization_id, name, cnpj, email, phone, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [orgId, name, cnpj, email || null, phone || null, req.userId]
    );

    res.json({ id: result.rows[0].id, existing: false });
  } catch (err) {
    logError('online-quotes.companies.create-from-quote', err);
    res.status(500).json({ error: 'Failed to create company' });
  }
});


// Update quote status
router.patch('/quotes/:id/status', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'Unauthorized' });

    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });

    const orgId = ctx.organizationId;
    const isSuperadmin = ctx.isSuperadmin;

    // Check if user has permission to update this quote
    let sql = `UPDATE online_quotes SET status = $1, updated_at = NOW() WHERE id = $2`;
    const params = [status, req.params.id];

    if (!isSuperadmin) {
      sql += ` AND (organization_id = $3 OR user_id = $4)`;
      params.push(orgId, req.userId);
    }

    const result = await query(sql, params);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Quote not found or permission denied' });
    }

    res.json({ success: true, status });
  } catch (err) {
    logError('online-quotes.quotes.status.patch', err);
    res.status(500).json({ error: 'Failed to update quote status' });
  }
});

export default router;
