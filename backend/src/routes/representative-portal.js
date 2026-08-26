import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role
       FROM organization_members om
      WHERE om.user_id = $1
      LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

async function getRepresentativeByUser(userId, organizationId) {
  try {
    const result = await query(
      `SELECT r.*
         FROM crm_representatives r
        WHERE r.organization_id = $1
          AND (
            r.linked_user_id = $2
            OR EXISTS (
              SELECT 1
                FROM crm_representative_users ru
               WHERE ru.representative_id = r.id
                 AND ru.user_id = $2
            )
          )
        ORDER BY r.created_at ASC
        LIMIT 1`,
      [organizationId, userId]
    );
    return result.rows[0] || null;
  } catch (_) {
    const fallback = await query(
      `SELECT *
         FROM crm_representatives
        WHERE organization_id = $1
          AND linked_user_id = $2
        ORDER BY created_at ASC
        LIMIT 1`,
      [organizationId, userId]
    );
    return fallback.rows[0] || null;
  }
}

async function hasPortalAccess(userId, org) {
  if (!org) return false;
  if (['owner', 'admin', 'manager'].includes(org.role)) return true;

  const perms = await query(
    `SELECT can_view_representative_dashboard
       FROM user_permissions
      WHERE user_id = $1 AND organization_id = $2`,
    [userId, org.organization_id]
  );

  return perms.rows[0]?.can_view_representative_dashboard === true;
}

async function ensureRepresentativePortalSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS price_lists (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      segment TEXT,
      is_master BOOLEAN DEFAULT false,
      markup_percentage DECIMAL(10, 2) DEFAULT 0,
      allowed_templates JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS price_list_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE NOT NULL,
      product_code VARCHAR(100) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      description TEXT,
      cost_price DECIMAL(15, 2) DEFAULT 0,
      sale_price DECIMAL(15, 2) DEFAULT 0,
      image_url TEXT,
      category VARCHAR(255),
      subcategory VARCHAR(255),
      brand VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(price_list_id, product_code)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rep_portal_companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      representative_id UUID NOT NULL REFERENCES crm_representatives(id) ON DELETE CASCADE,
      company_name VARCHAR(255) NOT NULL,
      trade_name VARCHAR(255),
      cnpj VARCHAR(20),
      state_registration VARCHAR(50),
      contact_name VARCHAR(255),
      contact_phone VARCHAR(50),
      contact_email VARCHAR(255),
      address_street VARCHAR(255),
      address_number VARCHAR(50),
      address_complement VARCHAR(255),
      address_district VARCHAR(255),
      address_city VARCHAR(150),
      address_state VARCHAR(2),
      address_zip_code VARCHAR(20),
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rep_portal_quotes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      representative_id UUID NOT NULL REFERENCES crm_representatives(id) ON DELETE CASCADE,
      company_id UUID REFERENCES rep_portal_companies(id) ON DELETE SET NULL,
      price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL,
      code VARCHAR(50),
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      company_name VARCHAR(255) NOT NULL,
      client_document VARCHAR(20),
      client_contact_name VARCHAR(255),
      client_phone VARCHAR(50),
      client_email VARCHAR(255),
      notes TEXT,
      subtotal_value NUMERIC(15,2) NOT NULL DEFAULT 0,
      discount_value NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_value NUMERIC(15,2) NOT NULL DEFAULT 0,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rep_portal_quote_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      quote_id UUID NOT NULL REFERENCES rep_portal_quotes(id) ON DELETE CASCADE,
      product_code VARCHAR(100),
      product_name VARCHAR(255) NOT NULL,
      description TEXT,
      quantity NUMERIC(15,3) NOT NULL DEFAULT 1,
      unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_price NUMERIC(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rep_portal_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      representative_id UUID NOT NULL REFERENCES crm_representatives(id) ON DELETE CASCADE,
      quote_id UUID REFERENCES rep_portal_quotes(id) ON DELETE SET NULL,
      company_id UUID REFERENCES rep_portal_companies(id) ON DELETE SET NULL,
      order_number VARCHAR(50),
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      company_name VARCHAR(255) NOT NULL,
      client_document VARCHAR(20),
      client_contact_name VARCHAR(255),
      client_phone VARCHAR(50),
      client_email VARCHAR(255),
      notes TEXT,
      total_value NUMERIC(15,2) NOT NULL DEFAULT 0,
      erp_status VARCHAR(30) NOT NULL DEFAULT 'pending_integration',
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS rep_portal_order_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES rep_portal_orders(id) ON DELETE CASCADE,
      product_code VARCHAR(100),
      product_name VARCHAR(255) NOT NULL,
      description TEXT,
      quantity NUMERIC(15,3) NOT NULL DEFAULT 1,
      unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
      total_price NUMERIC(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_rep_portal_companies_rep ON rep_portal_companies(representative_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rep_portal_quotes_rep ON rep_portal_quotes(representative_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_rep_portal_orders_rep ON rep_portal_orders(representative_id, created_at DESC)`);
}

async function getPortalContext(userId) {
  await ensureRepresentativePortalSchema();

  const org = await getUserOrg(userId);
  if (!org) return { org: null, representative: null };
  if (!(await hasPortalAccess(userId, org))) return { org, representative: null };

  const representative = await getRepresentativeByUser(userId, org.organization_id);
  return { org, representative };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && item.product_name)
    .map((item) => {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unit_price) || 0;
      return {
        product_code: item.product_code || null,
        product_name: String(item.product_name).trim(),
        description: item.description?.trim() || null,
        quantity,
        unit_price: unitPrice,
        total_price: Number(item.total_price) || quantity * unitPrice,
      };
    });
}

async function replaceQuoteItems(quoteId, items) {
  await query(`DELETE FROM rep_portal_quote_items WHERE quote_id = $1`, [quoteId]);

  for (const item of items) {
    await query(
      `INSERT INTO rep_portal_quote_items (
         quote_id, product_code, product_name, description, quantity, unit_price, total_price
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        quoteId,
        item.product_code,
        item.product_name,
        item.description,
        item.quantity,
        item.unit_price,
        item.total_price,
      ]
    );
  }
}

async function replaceOrderItems(orderId, items) {
  await query(`DELETE FROM rep_portal_order_items WHERE order_id = $1`, [orderId]);

  for (const item of items) {
    await query(
      `INSERT INTO rep_portal_order_items (
         order_id, product_code, product_name, description, quantity, unit_price, total_price
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        orderId,
        item.product_code,
        item.product_name,
        item.description,
        item.quantity,
        item.unit_price,
        item.total_price,
      ]
    );
  }
}

router.get('/me', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org) return res.status(403).json({ error: 'Organização não encontrada' });
    if (!representative) return res.status(403).json({ error: 'Usuário sem vínculo com representante' });

    res.json({ organization_id: org.organization_id, representative });
  } catch (error) {
    console.error('Error fetching representative portal user:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const [companies, quotes, orders] = await Promise.all([
      query(
        `SELECT COUNT(*)::int AS total
           FROM rep_portal_companies
          WHERE organization_id = $1 AND representative_id = $2`,
        [org.organization_id, representative.id]
      ),
      query(
        `SELECT
            COUNT(*)::int AS total,
            COALESCE(SUM(total_value), 0) AS total_value
           FROM rep_portal_quotes
          WHERE organization_id = $1 AND representative_id = $2`,
        [org.organization_id, representative.id]
      ),
      query(
        `SELECT
            COUNT(*)::int AS total,
            COALESCE(SUM(total_value), 0) AS total_value
           FROM rep_portal_orders
          WHERE organization_id = $1 AND representative_id = $2`,
        [org.organization_id, representative.id]
      ),
    ]);

    res.json({
      companies: companies.rows[0]?.total || 0,
      quotes: {
        total: quotes.rows[0]?.total || 0,
        total_value: Number(quotes.rows[0]?.total_value || 0),
      },
      orders: {
        total: orders.rows[0]?.total || 0,
        total_value: Number(orders.rows[0]?.total_value || 0),
      },
    });
  } catch (error) {
    console.error('Error fetching representative portal dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/companies', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT *
         FROM rep_portal_companies
        WHERE organization_id = $1
          AND representative_id = $2
        ORDER BY created_at DESC`,
      [org.organization_id, representative.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing representative companies:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/companies', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const {
      company_name,
      trade_name,
      cnpj,
      state_registration,
      contact_name,
      contact_phone,
      contact_email,
      address_street,
      address_number,
      address_complement,
      address_district,
      address_city,
      address_state,
      address_zip_code,
      notes,
    } = req.body || {};

    if (!company_name?.trim()) {
      return res.status(400).json({ error: 'Razão social é obrigatória' });
    }

    const result = await query(
      `INSERT INTO rep_portal_companies (
         organization_id, representative_id, company_name, trade_name, cnpj, state_registration,
         contact_name, contact_phone, contact_email, address_street, address_number,
         address_complement, address_district, address_city, address_state, address_zip_code,
         notes, created_by
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18
       ) RETURNING *`,
      [
        org.organization_id,
        representative.id,
        company_name.trim(),
        trade_name?.trim() || null,
        cnpj?.trim() || null,
        state_registration?.trim() || null,
        contact_name?.trim() || null,
        contact_phone?.trim() || null,
        contact_email?.trim() || null,
        address_street?.trim() || null,
        address_number?.trim() || null,
        address_complement?.trim() || null,
        address_district?.trim() || null,
        address_city?.trim() || null,
        address_state?.trim() || null,
        address_zip_code?.trim() || null,
        notes?.trim() || null,
        req.userId,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating representative company:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/price-lists', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT pl.*
         FROM price_lists pl
        WHERE pl.organization_id = $1
          AND pl.is_active = true
        ORDER BY pl.is_master DESC, pl.name ASC`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing representative price lists:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/price-lists/:id/items', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const list = await query(
      `SELECT id
         FROM price_lists
        WHERE id = $1
          AND organization_id = $2
          AND is_active = true`,
      [req.params.id, org.organization_id]
    );

    if (!list.rows[0]) {
      return res.status(404).json({ error: 'Tabela não encontrada' });
    }

    const items = await query(
      `SELECT *
         FROM price_list_items
        WHERE price_list_id = $1
        ORDER BY category NULLS LAST, product_name ASC`,
      [req.params.id]
    );

    res.json(items.rows);
  } catch (error) {
    console.error('Error listing representative price list items:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/quotes', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT q.*
         FROM rep_portal_quotes q
        WHERE q.organization_id = $1
          AND q.representative_id = $2
        ORDER BY q.created_at DESC`,
      [org.organization_id, representative.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing representative quotes:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/quotes', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const {
      company_id = null,
      price_list_id = null,
      company_name,
      client_document,
      client_contact_name,
      client_phone,
      client_email,
      notes,
      status = 'draft',
      discount_value = 0,
      items = [],
    } = req.body || {};

    if (!company_name?.trim()) {
      return res.status(400).json({ error: 'Cliente/empresa é obrigatório' });
    }

    if (company_id) {
      const company = await query(
        `SELECT id
           FROM rep_portal_companies
          WHERE id = $1
            AND organization_id = $2
            AND representative_id = $3`,
        [company_id, org.organization_id, representative.id]
      );

      if (!company.rows[0]) {
        return res.status(404).json({ error: 'Cliente não encontrado para este representante' });
      }
    }

    if (price_list_id) {
      const priceList = await query(
        `SELECT id
           FROM price_lists
          WHERE id = $1
            AND organization_id = $2
            AND is_active = true`,
        [price_list_id, org.organization_id]
      );

      if (!priceList.rows[0]) {
        return res.status(404).json({ error: 'Tabela de preço não encontrada' });
      }
    }

    const normalizedItems = normalizeItems(items);
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.total_price, 0);
    const discount = Number(discount_value) || 0;
    const total = Math.max(0, subtotal - discount);

    const result = await query(
      `INSERT INTO rep_portal_quotes (
         organization_id, representative_id, company_id, price_list_id, code, status,
         company_name, client_document, client_contact_name, client_phone, client_email,
         notes, subtotal_value, discount_value, total_value, created_by
       ) VALUES (
         $1, $2, $3, $4, CONCAT('Q-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8))), $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15
       ) RETURNING *`,
      [
        org.organization_id,
        representative.id,
        company_id,
        price_list_id,
        status,
        company_name.trim(),
        client_document?.trim() || null,
        client_contact_name?.trim() || null,
        client_phone?.trim() || null,
        client_email?.trim() || null,
        notes?.trim() || null,
        subtotal,
        discount,
        total,
        req.userId,
      ]
    );

    const created = result.rows[0];
    await replaceQuoteItems(created.id, normalizedItems);
    res.json(created);
  } catch (error) {
    console.error('Error creating representative quote:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/quotes/:id/items', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const quote = await query(
      `SELECT id
         FROM rep_portal_quotes
        WHERE id = $1
          AND organization_id = $2
          AND representative_id = $3`,
      [req.params.id, org.organization_id, representative.id]
    );

    if (!quote.rows[0]) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const items = await query(
      `SELECT *
         FROM rep_portal_quote_items
        WHERE quote_id = $1
        ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json(items.rows);
  } catch (error) {
    console.error('Error listing representative quote items:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/quotes/:id/confirm-order', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const quoteResult = await query(
      `SELECT *
         FROM rep_portal_quotes
        WHERE id = $1
          AND organization_id = $2
          AND representative_id = $3`,
      [req.params.id, org.organization_id, representative.id]
    );

    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const quoteItems = await query(
      `SELECT *
         FROM rep_portal_quote_items
        WHERE quote_id = $1
        ORDER BY created_at ASC`,
      [quote.id]
    );

    const orderResult = await query(
      `INSERT INTO rep_portal_orders (
         organization_id, representative_id, quote_id, company_id, order_number, status,
         company_name, client_document, client_contact_name, client_phone, client_email,
         notes, total_value, erp_status, created_by
       ) VALUES (
         $1, $2, $3, $4, CONCAT('P-', UPPER(SUBSTRING(REPLACE(gen_random_uuid()::text, '-', '') FROM 1 FOR 8))), $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13, $14
       ) RETURNING *`,
      [
        org.organization_id,
        representative.id,
        quote.id,
        quote.company_id,
        'pending',
        quote.company_name,
        quote.client_document,
        quote.client_contact_name,
        quote.client_phone,
        quote.client_email,
        quote.notes,
        quote.total_value,
        'pending_integration',
        req.userId,
      ]
    );

    const order = orderResult.rows[0];
    await replaceOrderItems(order.id, quoteItems.rows);

    await query(
      `UPDATE rep_portal_quotes
          SET status = 'approved',
              updated_at = NOW()
        WHERE id = $1`,
      [quote.id]
    );

    res.json(order);
  } catch (error) {
    console.error('Error confirming representative order:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const { org, representative } = await getPortalContext(req.userId);
    if (!org || !representative) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT *
         FROM rep_portal_orders
        WHERE organization_id = $1
          AND representative_id = $2
        ORDER BY created_at DESC`,
      [org.organization_id, representative.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing representative orders:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
