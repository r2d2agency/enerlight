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

  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_org ON price_lists(organization_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_items_list ON price_list_items(price_list_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_price_list_access_user ON price_list_access(user_id)`);
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

export default router;
