import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get all templates
router.get('/', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.is_superadmin FROM users u WHERE u.id = $1`,
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const isSuperadmin = !!userResult.rows[0]?.is_superadmin;
    
    // Check if table exists first
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'permission_templates'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.json([]);
    }

    // Fallback logic to check if column exists at runtime to avoid 500
    const columnsRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates' AND column_name IN ('status', 'organization_id')
    `);
    const hasStatus = columnsRes.rows.some(c => c.column_name === 'status');
    const hasOrgId = columnsRes.rows.some(c => c.column_name === 'organization_id');

    let sql = `SELECT * FROM permission_templates`;
    const conditions = [];
    const params = [];

    if (hasStatus) {
      conditions.push(`status = 'active'`);
    }

    if (!isSuperadmin) {
      // Get all organization IDs where user is member
      const orgsResult = await query(
        `SELECT organization_id FROM organization_members WHERE user_id = $1 AND status = 'active'`,
        [req.userId]
      );
      const orgIds = orgsResult.rows.map(r => r.organization_id).filter(Boolean);

      if (hasOrgId) {
        if (orgIds.length > 0) {
          conditions.push(`(organization_id IS NULL OR organization_id = ANY($${params.length + 1}::uuid[]))`);
          params.push(orgIds);
        } else {
          conditions.push(`organization_id IS NULL`);
        }
      }
    }

    if (conditions.length > 0) {
      sql += ` WHERE ` + conditions.join(' AND ');
    }

    sql += ` ORDER BY sort_order ASC, created_at ASC`;

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Get permission templates error:', error);
    res.status(500).json({ 
      error: 'Erro ao buscar templates',
      details: error.message 
    });
  }
});

// Create template (superadmin or org owner/admin)
router.post('/', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.is_superadmin, om.role, om.organization_id FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id AND om.status = 'active'
       WHERE u.id = $1`,
      [req.userId]
    );
    
    const isSuperadmin = userResult.rows.some(r => r.is_superadmin);
    const isOwnerOrAdmin = userResult.rows.some(r => r.role === 'owner' || r.role === 'admin');
    const activeOrgId = userResult.rows.find(r => r.organization_id)?.organization_id || null;

    if (!isSuperadmin && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Sem permissão para criar templates' });
    }

    const { name, description, icon, permissions, organization_id } = req.body;
    if (!name || !permissions) {
      return res.status(400).json({ error: 'Nome e permissões são obrigatórios' });
    }

    const targetOrgId = isSuperadmin ? (organization_id || null) : activeOrgId;

    // Check if table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'permission_templates'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(400).json({ error: 'Tabela de templates não inicializada' });
    }

    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM permission_templates`);
    
    const columnsRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates' AND column_name IN ('organization_id', 'status')
    `);
    const hasOrgId = columnsRes.rows.some(c => c.column_name === 'organization_id');
    const hasStatus = columnsRes.rows.some(c => c.column_name === 'status');

    const result = await query(
      `INSERT INTO permission_templates (name, description, icon, permissions, sort_order ${hasOrgId ? ', organization_id' : ''} ${hasStatus ? ', status' : ''})
       VALUES ($1, $2, $3, $4, $5 ${hasOrgId ? ', $6' : ''} ${hasStatus ? ", 'active'" : ''}) RETURNING *`,
      [name, description || null, icon || 'Users', typeof permissions === 'string' ? permissions : JSON.stringify(permissions), maxSort.rows[0].next, hasOrgId ? targetOrgId : undefined].filter(v => v !== undefined)
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create permission template error:', error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

// Update template (superadmin or org owner/admin)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.is_superadmin, om.role, om.organization_id FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id AND om.status = 'active'
       WHERE u.id = $1`,
      [req.userId]
    );
    
    const isSuperadmin = userResult.rows.some(r => r.is_superadmin);
    const isOwnerOrAdmin = userResult.rows.some(r => r.role === 'owner' || r.role === 'admin');
    const orgIds = userResult.rows.map(r => r.organization_id).filter(Boolean);

    if (!isSuperadmin && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Sem permissão para editar templates' });
    }

    const { name, description, icon, permissions, organization_id } = req.body;
    
    if (!isSuperadmin) {
      const templateCheck = await query(
        `SELECT organization_id FROM permission_templates WHERE id = $1`,
        [req.params.id]
      );
      if (templateCheck.rows.length === 0) return res.status(404).json({ error: 'Template não encontrado' });
      const tOrgId = templateCheck.rows[0].organization_id;
      if (tOrgId && !orgIds.includes(tOrgId)) {
        return res.status(403).json({ error: 'Sem acesso a este template' });
      }
    }

    // Check if table exists
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'permission_templates'
      )
    `);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(400).json({ error: 'Tabela de templates não inicializada' });
    }

    const columnsRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates' AND column_name IN ('organization_id', 'status')
    `);
    const hasOrgId = columnsRes.rows.some(c => c.column_name === 'organization_id');
    const hasStatus = columnsRes.rows.some(c => c.column_name === 'status');

    let updateSql = `UPDATE permission_templates SET name = COALESCE($1, name), description = $2, icon = COALESCE($3, icon), permissions = COALESCE($4, permissions)`;
    const updateParams = [
      name, 
      description || null, 
      icon, 
      permissions ? (typeof permissions === 'string' ? permissions : JSON.stringify(permissions)) : null
    ];

    if (hasOrgId) {
      updateSql += `, organization_id = COALESCE($${updateParams.length + 1}, organization_id)`;
      updateParams.push(isSuperadmin ? (organization_id || null) : undefined);
    }

    updateSql += ` WHERE id = $${updateParams.length + 1} RETURNING *`;
    updateParams.push(req.params.id);

    const result = await query(updateSql, updateParams.filter(v => v !== undefined));

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update permission template error:', error);
    res.status(500).json({ error: 'Erro ao atualizar template' });
  }
});

// Delete template (superadmin or org owner/admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.is_superadmin, om.role, om.organization_id FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id AND om.status = 'active'
       WHERE u.id = $1`,
      [req.userId]
    );
    
    const isSuperadmin = userResult.rows.some(r => r.is_superadmin);
    const isOwnerOrAdmin = userResult.rows.some(r => r.role === 'owner' || r.role === 'admin');
    const orgIds = userResult.rows.map(r => r.organization_id).filter(Boolean);

    if (!isSuperadmin && !isOwnerOrAdmin) {
      return res.status(403).json({ error: 'Sem permissão para excluir templates' });
    }

    if (!isSuperadmin) {
      const templateCheck = await query(
        `SELECT organization_id FROM permission_templates WHERE id = $1`,
        [req.params.id]
      );
      if (templateCheck.rows.length === 0) return res.status(404).json({ error: 'Template não encontrado' });
      const tOrgId = templateCheck.rows[0].organization_id;
      if (tOrgId && !orgIds.includes(tOrgId)) {
        return res.status(403).json({ error: 'Sem acesso a este template' });
      }
    }

    await query(`DELETE FROM permission_templates WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete permission template error:', error);
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
});

export default router;
