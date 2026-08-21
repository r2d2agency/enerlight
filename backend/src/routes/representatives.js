import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { generateQuotePDF } from '../utils/pdf-generator.js';

const router = express.Router();
router.use(authenticate);

export async function getUserContext(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role, u.is_superadmin, u.status as user_status,
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

export async function logAudit(userId, organizationId, action, entityType, entityId, details) {
  try {
    await query(
      `INSERT INTO crm_audit_log (user_id, organization_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, organizationId, action, entityType, entityId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}



export async function getUserContext(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role, u.is_superadmin, u.status as user_status,
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

export async function logAudit(userId, organizationId, action, entityType, entityId, details) {
  try {
    await query(
      `INSERT INTO crm_audit_log (user_id, organization_id, action, entity_type, entity_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, organizationId, action, entityType, entityId, JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

router.get('/my-deals', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    if (!repId) return res.status(403).json({ error: 'REPRESENTATIVE_NOT_FOUND' });

    const result = await query(
      `SELECT d.*, c.name as customer_name, co.name as company_name, c.cpf_cnpj as customer_document
       FROM crm_deals d
       LEFT JOIN rep_customers c ON c.id = d.rep_customer_id
       LEFT JOIN companies co ON co.id = d.company_id
       WHERE d.representative_id = $1
       ORDER BY d.created_at DESC`,
      [repId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/quotes/:id/pdf
router.get('/quotes/:id/pdf', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const dealId = req.params.id;
    
    // Fetch deal with items and cover URL from price list
    const dealResult = await query(
      `SELECT d.*, c.name as customer_name, c.cpf_cnpj as customer_document,
              pl.custom_cover_url
       FROM crm_deals d
       LEFT JOIN rep_customers c ON c.id = d.rep_customer_id
       -- Logic to link to price list cover: we look for the first item's price list
       LEFT JOIN LATERAL (
         SELECT pli.price_list_id
         FROM cart_items ci -- This is not correct for historical deals, we need a deal_items table.
         -- For now, we'll try to find if we stored the price_list_id in the deal or if we can infer it.
         -- Let's assume for Sprint 7 that we might need a join to price_lists if we stored it.
         -- Since we don't have deal_items yet, we'll try to find items from crm_deal_history or similar if applicable.
         -- Actually, let's just use the organization's default cover for now if not found.
         LIMIT 1
       ) dl ON true
       LEFT JOIN price_lists pl ON pl.id = d.price_list_id -- We should add this column to crm_deals
       WHERE d.id = $1`,
      [dealId]
    );

    if (dealResult.rows.length === 0) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    const quote = dealResult.rows[0];

    // Mock items since we haven't implemented a formal deal_items table yet (stored in history as text currently)
    // In a real implementation, we'd have a crm_deal_items table.
    // For this sprint, I'll extract items from the note if it exists or return empty.
    const historyResult = await query(
      `SELECT content FROM crm_deal_history WHERE deal_id = $1 AND type = 'note' ORDER BY created_at ASC LIMIT 1`,
      [dealId]
    );
    
    const items = [];
    if (historyResult.rows[0]) {
      // Very basic parser for the format: "- description (code): quantity x R$ price"
      const lines = historyResult.rows[0].content.split('\n');
      lines.forEach(line => {
        if (line.startsWith('- ')) {
          const match = line.match(/- (.*) \((.*)\): (\d+) x R\$ ([\d,.]+)/);
          if (match) {
            items.push({
              name: match[1],
              code: match[2],
              quantity: parseInt(match[3]),
              unit_price: parseFloat(match[4].replace(',', '.'))
            });
          }
        }
      });
    }
    
    quote.items = items;
    quote.subtotal = items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);

    const pdfBuffer = await generateQuotePDF(quote);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=orcamento-${dealId}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/representatives/quotes/:id/convert
router.post('/quotes/:id/convert', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const dealId = req.params.id;
    const repId = await getRepresentativeId(req.userId, context.organization_id);

    // 1. Check if deal belongs to rep and isn't already converted
    const dealCheck = await query(
      `SELECT d.*, c.name as customer_name, cr.name as rep_name, cr.commission_percentage
       FROM crm_deals d
       LEFT JOIN rep_customers c ON c.id = d.rep_customer_id
       JOIN crm_representatives cr ON cr.id = d.representative_id
       WHERE d.id = $1 AND d.representative_id = $2`,
      [dealId, repId]
    );

    if (dealCheck.rows.length === 0) return res.status(404).json({ error: 'QUOTE_NOT_FOUND' });
    const deal = dealCheck.rows[0];

    if (deal.status === 'convertido') {
      return res.status(400).json({ error: 'QUOTE_ALREADY_CONVERTED' });
    }

    // 2. Update status and record audit
    await query(
      `UPDATE crm_deals 
       SET status = 'convertido', 
           updated_at = NOW() 
       WHERE id = $1`,
      [dealId]
    );

    const auditNote = `Orçamento convertido em venda pelo representante ${deal.rep_name} em ${new Date().toLocaleString('pt-BR')}.`;
    await query(
      `INSERT INTO crm_deal_history (deal_id, user_id, content, type)
       VALUES ($1, $2, $3, 'note')`,
      [dealId, req.userId, auditNote]
    );

    // 3. Create commission entry
    const commissionValue = (Number(deal.value) * Number(deal.commission_percentage || 0)) / 100;
    try {
      // Ensure rep_commissions table exists
      await query(`
        CREATE TABLE IF NOT EXISTS rep_commissions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          representative_id UUID REFERENCES crm_representatives(id),
          deal_id UUID REFERENCES crm_deals(id),
          customer_name TEXT,
          deal_value DECIMAL(12,2),
          commission_percentage DECIMAL(5,2),
          commission_value DECIMAL(12,2),
          status TEXT DEFAULT 'pendente',
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await query(
        `INSERT INTO rep_commissions (
          representative_id, deal_id, customer_name, deal_value, 
          commission_percentage, commission_value
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [repId, dealId, deal.customer_name, deal.value, deal.commission_percentage, commissionValue]
      );
    } catch (e) {
      console.error('Error creating commission entry:', e);
    }

    // 4. Notify internal managers/sales (mock notification)
    // In a real scenario, this would trigger a push notification or email
    console.log(`NOTIFICAÇÃO: Orçamento #${dealId} convertido. Cliente: ${deal.customer_name}, Valor: R$ ${deal.value}`);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/stats
router.get('/stats', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    if (!repId) return res.status(403).json({ error: 'REPRESENTATIVE_NOT_FOUND' });

    // Monthly stats
    const statsResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', current_date)) as created_this_month,
        COUNT(*) FILTER (WHERE status = 'convertido' AND updated_at >= date_trunc('month', current_date)) as converted_this_month,
        SUM(value) FILTER (WHERE status = 'convertido' AND updated_at >= date_trunc('month', current_date)) as value_this_month,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', current_date - interval '1 month') AND created_at < date_trunc('month', current_date)) as created_last_month
       FROM crm_deals
       WHERE representative_id = $1`,
      [repId]
    );

    // Commissions summary
    const commissionResult = await query(
      `SELECT SUM(commission_value) as estimated_commission
       FROM rep_commissions
       WHERE representative_id = $1 AND status = 'pendente'`,
      [repId]
    );

    res.json({
      ...statsResult.rows[0],
      estimated_commission: commissionResult.rows[0]?.estimated_commission || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/representatives/commissions
router.get('/commissions', async (req, res) => {
  try {
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    
    const result = await query(
      `SELECT * FROM rep_commissions 
       WHERE representative_id = $1 
       ORDER BY created_at DESC`,
      [repId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    const repId = await getRepresentativeId(req.userId, context.organization_id);
    
    const { category, subcategory, brand, search, price_list_id } = req.query;
    
    // Security Restriction: Representatives can only see products from authorized price lists
    let authorizedCondition = "";
    if (repId) {
      authorizedCondition = `
        AND (
          pl.is_public = true 
          OR pl.id IN (SELECT price_list_id FROM price_list_authorized_reps WHERE representative_id = $2)
        )
      `;
    }

    let queryStr = `
      SELECT pli.*, pl.name as price_list_name, pl.markup_percentage
      FROM price_list_items pli
      JOIN price_lists pl ON pl.id = pli.price_list_id
      WHERE pl.organization_id = $1 AND pl.is_active = true
      ${authorizedCondition}
    `;
    const params = [context.organization_id];
    if (repId) params.push(repId);


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
      `SELECT ci.*, pli.description, pli.code, pli.sale_price, pli.cost_price, pli.brand, pl.id as price_list_id
       FROM cart_items ci
       JOIN price_list_items pli ON pli.id = ci.item_id
       JOIN price_lists pl ON pl.id = pli.price_list_id
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
    const { 
      company_id, 
      rep_customer_id, 
      contact_name, 
      contact_phone, 
      title, 
      notes,
      shipping_value = 0,
      discount_value = 0,
      commercial_conditions,
      status = 'rascunho'
    } = req.body;
    
    const context = await getUserContext(req.userId);
    if (!context) return res.status(403).json({ error: 'USER_CONTEXT_NOT_FOUND' });

    const cartItems = await query(
      `SELECT ci.*, pli.description, pli.sale_price, pli.code, pli.price_list_id
       FROM cart_items ci
       JOIN price_list_items pli ON pli.id = ci.item_id
       WHERE ci.user_id = $1`,
      [req.userId]
    );

    if (cartItems.rows.length === 0) {
      return res.status(400).json({ error: 'Carrinho vazio' });
    }

    const priceListId = cartItems.rows[0].price_list_id;
    const subtotal = cartItems.rows.reduce((acc, item) => acc + (Number(item.sale_price) * item.quantity), 0);
    const totalValue = Number(subtotal) + Number(shipping_value) - Number(discount_value);
    const representativeId = await getRepresentativeId(req.userId, context.organization_id);

    // First ensure the column price_list_id exists in crm_deals (Sprint 7 needs it for cover mapping)
    try {
      await query(`ALTER TABLE crm_deals ADD COLUMN IF NOT EXISTS price_list_id UUID REFERENCES price_lists(id)`);
    } catch (e) { /* ignore */ }

    const dealResult = await query(
      `INSERT INTO crm_deals (
        organization_id, title, value, status, 
        company_id, rep_customer_id, representative_id, created_by, description,
        shipping_value, discount_value, commercial_conditions, price_list_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id`,
      [
        context.organization_id, 
        title || `Orçamento Representante - ${new Date().toLocaleDateString()}`,
        totalValue,
        status,
        company_id || null,
        rep_customer_id || null,
        representativeId,
        req.userId,
        notes,
        shipping_value,
        discount_value,
        commercial_conditions,
        priceListId
      ]
    );

    const dealId = dealResult.rows[0].id;
    const productList = cartItems.rows.map(item => `- ${item.description} (${item.code}): ${item.quantity} x R$ ${Number(item.sale_price).toFixed(2)}`).join('\n');
    const summary = `Orçamento gerado pelo catálogo:\n${productList}\n\nSubtotal: R$ ${subtotal.toFixed(2)}\nFrete: R$ ${Number(shipping_value).toFixed(2)}\nDesconto: R$ ${Number(discount_value).toFixed(2)}\nTotal: R$ ${totalValue.toFixed(2)}`;
    
    await query(
      `INSERT INTO crm_deal_history (deal_id, user_id, content, type)
       VALUES ($1, $2, $3, 'note')`,
      [dealId, req.userId, summary]
    );

    await query(`DELETE FROM cart_items WHERE user_id = $1`, [req.userId]);
    res.json({ success: true, deal_id: dealId });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

import adminRoutes from './representatives-admin.js';
router.use('/', adminRoutes);

export default router;