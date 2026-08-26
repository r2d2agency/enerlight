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

function canManage(role) {
  return ['owner', 'admin', 'manager'].includes(role);
}

async function ensureOnlineQuotesSchema() {
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
    CREATE TABLE IF NOT EXISTS price_list_access (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      price_list_id UUID REFERENCES price_lists(id) ON DELETE CASCADE NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE CASCADE,
      group_id UUID REFERENCES crm_user_groups(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      CHECK (user_id IS NOT NULL OR group_id IS NOT NULL)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS price_list_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (organization_id, name)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS price_list_subcategories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      category_id UUID REFERENCES price_list_categories(id) ON DELETE CASCADE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE (category_id, name)
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_org ON price_lists(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON price_list_items(price_list_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_access_user ON price_list_access(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_categories_org ON price_list_categories(organization_id, sort_order, name)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_subcategories_org ON price_list_subcategories(organization_id, category_id, sort_order, name)`);
}

async function requireManagerAccess(userId) {
  const org = await getUserOrg(userId);
  if (!org) return null;

  if (canManage(org.role)) {
    return org;
  }

  const perms = await query(
    `SELECT can_manage_representative_config
       FROM user_permissions
      WHERE user_id = $1 AND organization_id = $2`,
    [userId, org.organization_id]
  );

  return perms.rows[0]?.can_manage_representative_config ? org : null;
}

async function getPriceListForOrg(priceListId, organizationId) {
  const result = await query(
    `SELECT *
       FROM price_lists
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1`,
    [priceListId, organizationId]
  );

  return result.rows[0] || null;
}

async function getCategoryForOrg(categoryId, organizationId) {
  const result = await query(
    `SELECT *
       FROM price_list_categories
      WHERE id = $1
        AND organization_id = $2
      LIMIT 1`,
    [categoryId, organizationId]
  );

  return result.rows[0] || null;
}

async function ensureCategoryByName(organizationId, name) {
  const trimmed = name?.toString().trim();
  if (!trimmed) return null;

  const result = await query(
    `INSERT INTO price_list_categories (organization_id, name)
     VALUES ($1, $2)
     ON CONFLICT (organization_id, name)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [organizationId, trimmed]
  );

  return result.rows[0] || null;
}

async function ensureSubcategoryByName(organizationId, categoryId, name) {
  const trimmed = name?.toString().trim();
  if (!trimmed || !categoryId) return null;

  const result = await query(
    `INSERT INTO price_list_subcategories (organization_id, category_id, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (category_id, name)
     DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [organizationId, categoryId, trimmed]
  );

  return result.rows[0] || null;
}

function sanitizeItem(item = {}) {
  const productCode =
    item.product_code?.toString().trim() ||
    item.codigo?.toString().trim() ||
    item.code?.toString().trim() ||
    null;

  const productName =
    item.product_name?.toString().trim() ||
    item.nome?.toString().trim() ||
    item.name?.toString().trim() ||
    '';

  const costPrice = Number(item.cost_price ?? item.custo ?? item.cost ?? 0) || 0;
  const salePrice = Number(item.sale_price ?? item.preco ?? item.preco_venda ?? item.price ?? 0) || 0;

  return {
    product_code: productCode,
    product_name: productName,
    description: item.description?.toString().trim() || item.descricao?.toString().trim() || null,
    cost_price: costPrice,
    sale_price: salePrice,
    image_url: item.image_url?.toString().trim() || item.imagem?.toString().trim() || null,
    category: item.category?.toString().trim() || item.categoria?.toString().trim() || null,
    subcategory: item.subcategory?.toString().trim() || item.subcategoria?.toString().trim() || null,
    brand: item.brand?.toString().trim() || item.marca?.toString().trim() || null,
  };
}

async function upsertPriceListItem(priceListId, item) {
  const normalized = sanitizeItem(item);

  if (!normalized.product_name) {
    throw new Error('Nome do produto é obrigatório');
  }

  const conflictCode = normalized.product_code || `AUTO-${normalized.product_name.toUpperCase().replace(/\s+/g, '-').slice(0, 60)}`;

  const result = await query(
    `INSERT INTO price_list_items (
       price_list_id, product_code, product_name, description, cost_price, sale_price, image_url, category, subcategory, brand
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
     )
     ON CONFLICT (price_list_id, product_code)
     DO UPDATE SET
       product_name = EXCLUDED.product_name,
       description = EXCLUDED.description,
       cost_price = EXCLUDED.cost_price,
       sale_price = EXCLUDED.sale_price,
       image_url = EXCLUDED.image_url,
       category = EXCLUDED.category,
       subcategory = EXCLUDED.subcategory,
       brand = EXCLUDED.brand,
       updated_at = NOW()
     RETURNING *`,
    [
      priceListId,
      conflictCode,
      normalized.product_name,
      normalized.description,
      normalized.cost_price,
      normalized.sale_price,
      normalized.image_url,
      normalized.category,
      normalized.subcategory,
      normalized.brand,
    ]
  );

  return result.rows[0];
}

router.get('/categories', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT *,
              (SELECT COUNT(*)::int FROM price_list_subcategories sc WHERE sc.category_id = c.id) AS subcategory_count
         FROM price_list_categories c
        WHERE organization_id = $1
        ORDER BY is_active DESC, sort_order ASC, name ASC`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing price list categories:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const {
      name,
      description = null,
      is_active = true,
      sort_order = 0,
    } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const result = await query(
      `INSERT INTO price_list_categories (organization_id, name, description, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [org.organization_id, name.trim(), description?.trim() || null, is_active !== false, Number(sort_order) || 0]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating price list category:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const {
      name,
      description = null,
      is_active = true,
      sort_order = 0,
    } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const result = await query(
      `UPDATE price_list_categories
          SET name = $1,
              description = $2,
              is_active = $3,
              sort_order = $4,
              updated_at = NOW()
        WHERE id = $5
          AND organization_id = $6
      RETURNING *`,
      [name.trim(), description?.trim() || null, is_active !== false, Number(sort_order) || 0, req.params.id, org.organization_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating price list category:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    await query(
      `DELETE FROM price_list_categories
        WHERE id = $1
          AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting price list category:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/subcategories', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT sc.*, c.name AS category_name
         FROM price_list_subcategories sc
         JOIN price_list_categories c ON c.id = sc.category_id
        WHERE sc.organization_id = $1
        ORDER BY sc.is_active DESC, c.sort_order ASC, c.name ASC, sc.sort_order ASC, sc.name ASC`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing price list subcategories:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/subcategories', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const {
      category_id,
      name,
      description = null,
      is_active = true,
      sort_order = 0,
    } = req.body || {};

    if (!category_id) {
      return res.status(400).json({ error: 'Categoria é obrigatória' });
    }
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da subcategoria é obrigatório' });
    }

    const category = await getCategoryForOrg(category_id, org.organization_id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const result = await query(
      `INSERT INTO price_list_subcategories (organization_id, category_id, name, description, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [org.organization_id, category_id, name.trim(), description?.trim() || null, is_active !== false, Number(sort_order) || 0]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating price list subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/subcategories/:id', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const {
      category_id,
      name,
      description = null,
      is_active = true,
      sort_order = 0,
    } = req.body || {};

    if (!category_id) {
      return res.status(400).json({ error: 'Categoria é obrigatória' });
    }
    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da subcategoria é obrigatório' });
    }

    const category = await getCategoryForOrg(category_id, org.organization_id);
    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    const result = await query(
      `UPDATE price_list_subcategories
          SET category_id = $1,
              name = $2,
              description = $3,
              is_active = $4,
              sort_order = $5,
              updated_at = NOW()
        WHERE id = $6
          AND organization_id = $7
      RETURNING *`,
      [category_id, name.trim(), description?.trim() || null, is_active !== false, Number(sort_order) || 0, req.params.id, org.organization_id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Subcategoria não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating price list subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/subcategories/:id', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    await query(
      `DELETE FROM price_list_subcategories
        WHERE id = $1
          AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting price list subcategory:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/price-lists', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      `SELECT *
         FROM price_lists
        WHERE organization_id = $1
        ORDER BY is_master DESC, is_active DESC, name ASC`,
      [org.organization_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing price lists:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/price-lists', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const {
      name,
      description,
      is_active = true,
      segment = null,
      is_master = false,
      markup_percentage = 0,
      allowed_templates = [],
    } = req.body || {};

    if (!name?.trim()) {
      return res.status(400).json({ error: 'Nome da tabela é obrigatório' });
    }

    const result = await query(
      `INSERT INTO price_lists (
         organization_id, name, description, is_active, segment, is_master, markup_percentage, allowed_templates
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        org.organization_id,
        name.trim(),
        description?.trim() || null,
        is_active !== false,
        segment?.trim() || null,
        !!is_master,
        Number(markup_percentage) || 0,
        JSON.stringify(Array.isArray(allowed_templates) ? allowed_templates : []),
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating price list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/price-lists', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const {
      id,
      name,
      description,
      is_active = true,
      segment = null,
      is_master = false,
      markup_percentage = 0,
      allowed_templates = [],
    } = req.body || {};

    if (!id) return res.status(400).json({ error: 'ID da tabela é obrigatório' });
    if (!name?.trim()) return res.status(400).json({ error: 'Nome da tabela é obrigatório' });

    const result = await query(
      `UPDATE price_lists
          SET name = $1,
              description = $2,
              is_active = $3,
              segment = $4,
              is_master = $5,
              markup_percentage = $6,
              allowed_templates = $7::jsonb,
              updated_at = NOW()
        WHERE id = $8
          AND organization_id = $9
      RETURNING *`,
      [
        name.trim(),
        description?.trim() || null,
        is_active !== false,
        segment?.trim() || null,
        !!is_master,
        Number(markup_percentage) || 0,
        JSON.stringify(Array.isArray(allowed_templates) ? allowed_templates : []),
        id,
        org.organization_id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Tabela não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating price list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/price-lists/:id', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    await query(
      `DELETE FROM price_lists
        WHERE id = $1
          AND organization_id = $2`,
      [req.params.id, org.organization_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting price list:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/price-lists/:id/items', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const priceList = await getPriceListForOrg(req.params.id, org.organization_id);
    if (!priceList) return res.status(404).json({ error: 'Tabela não encontrada' });

    const result = await query(
      `SELECT *
         FROM price_list_items
        WHERE price_list_id = $1
        ORDER BY category NULLS LAST, brand NULLS LAST, product_name ASC`,
      [priceList.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error listing price list items:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/price-lists/:id/items', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const priceList = await getPriceListForOrg(req.params.id, org.organization_id);
    if (!priceList) return res.status(404).json({ error: 'Tabela não encontrada' });

    const draftItem = sanitizeItem(req.body || {});
    if (draftItem.category) {
      const category = await ensureCategoryByName(org.organization_id, draftItem.category);
      if (draftItem.subcategory && category?.id) {
        await ensureSubcategoryByName(org.organization_id, category.id, draftItem.subcategory);
      }
    }

    const created = await upsertPriceListItem(priceList.id, req.body || {});
    res.json(created);
  } catch (error) {
    console.error('Error creating price list item:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/price-lists/:id/items/:itemId', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const priceList = await getPriceListForOrg(req.params.id, org.organization_id);
    if (!priceList) return res.status(404).json({ error: 'Tabela não encontrada' });

    const normalized = sanitizeItem(req.body || {});
    if (!normalized.product_name) {
      return res.status(400).json({ error: 'Nome do produto é obrigatório' });
    }

    if (normalized.category) {
      const category = await ensureCategoryByName(org.organization_id, normalized.category);
      if (normalized.subcategory && category?.id) {
        await ensureSubcategoryByName(org.organization_id, category.id, normalized.subcategory);
      }
    }

    const result = await query(
      `UPDATE price_list_items
          SET product_code = $1,
              product_name = $2,
              description = $3,
              cost_price = $4,
              sale_price = $5,
              image_url = $6,
              category = $7,
              subcategory = $8,
              brand = $9,
              updated_at = NOW()
        WHERE id = $10
          AND price_list_id = $11
      RETURNING *`,
      [
        normalized.product_code || `AUTO-${normalized.product_name.toUpperCase().replace(/\s+/g, '-').slice(0, 60)}`,
        normalized.product_name,
        normalized.description,
        normalized.cost_price,
        normalized.sale_price,
        normalized.image_url,
        normalized.category,
        normalized.subcategory,
        normalized.brand,
        req.params.itemId,
        priceList.id,
      ]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating price list item:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/price-lists/:id/items/:itemId', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const priceList = await getPriceListForOrg(req.params.id, org.organization_id);
    if (!priceList) return res.status(404).json({ error: 'Tabela não encontrada' });

    await query(
      `DELETE FROM price_list_items
        WHERE id = $1
          AND price_list_id = $2`,
      [req.params.itemId, priceList.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting price list item:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/price-lists/:id/import-items', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const priceList = await getPriceListForOrg(req.params.id, org.organization_id);
    if (!priceList) return res.status(404).json({ error: 'Tabela não encontrada' });

    const { items = [], replace_existing = false } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Nenhum item informado para importação' });
    }

    if (replace_existing) {
      await query(`DELETE FROM price_list_items WHERE price_list_id = $1`, [priceList.id]);
    }

    const imported = [];
    const errors = [];

    for (const [index, item] of items.entries()) {
      try {
        const normalized = sanitizeItem(item);
        if (normalized.category) {
          const category = await ensureCategoryByName(org.organization_id, normalized.category);
          if (normalized.subcategory && category?.id) {
            await ensureSubcategoryByName(org.organization_id, category.id, normalized.subcategory);
          }
        }

        const saved = await upsertPriceListItem(priceList.id, item);
        imported.push(saved);
      } catch (error) {
        errors.push({
          index,
          product_name: item?.product_name || item?.nome || null,
          error: error.message,
        });
      }
    }

    res.json({
      success: true,
      imported_count: imported.length,
      error_count: errors.length,
      errors,
    });
  } catch (error) {
    console.error('Error importing price list items:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/price-lists/:id/apply-markup', async (req, res) => {
  try {
    await ensureOnlineQuotesSchema();
    const org = await requireManagerAccess(req.userId);
    if (!org) return res.status(403).json({ error: 'Acesso negado' });

    const priceList = await getPriceListForOrg(req.params.id, org.organization_id);
    if (!priceList) return res.status(404).json({ error: 'Tabela não encontrada' });

    const {
      markup_percentage = 0,
      base = 'cost',
      round_to = 2,
      update_table_markup = true,
    } = req.body || {};

    const markup = Number(markup_percentage);
    if (!Number.isFinite(markup)) {
      return res.status(400).json({ error: 'Markup inválido' });
    }

    const decimals = Number.isFinite(Number(round_to)) ? Math.max(0, Math.min(4, Number(round_to))) : 2;

    const result = await query(
      `UPDATE price_list_items
          SET sale_price = ROUND(
                (
                  CASE
                    WHEN $2 = 'sale' THEN COALESCE(sale_price, 0)
                    ELSE COALESCE(cost_price, 0)
                  END
                ) * (1 + ($3 / 100.0)),
                $4
              ),
              updated_at = NOW()
        WHERE price_list_id = $1
      RETURNING id`,
      [priceList.id, base === 'sale' ? 'sale' : 'cost', markup, decimals]
    );

    if (update_table_markup) {
      await query(
        `UPDATE price_lists
            SET markup_percentage = $1,
                updated_at = NOW()
          WHERE id = $2`,
        [markup, priceList.id]
      );
    }

    res.json({
      success: true,
      updated_count: result.rowCount || 0,
      markup_percentage: markup,
      base: base === 'sale' ? 'sale' : 'cost',
    });
  } catch (error) {
    console.error('Error applying markup to price list items:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
