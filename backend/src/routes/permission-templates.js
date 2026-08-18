import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logInfo, logWarn, logError } from '../logger.js';

const router = Router();

// Get all templates
router.get('/', authenticate, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const userResult = await query(
      `SELECT u.is_superadmin FROM users u WHERE u.id = $1`,
      [req.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado', requestId });
    }

    const isSuperadmin = !!userResult.rows[0]?.is_superadmin;
    
    // Check if table exists
    const tableExists = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'permission_templates'
      )
    `);

    if (!tableExists.rows[0].exists) {
      logWarn('permission_templates.table_missing', { requestId });
      return res.json([]);
    }

    let sql = `SELECT * FROM permission_templates`;
    const conditions = [];
    const params = [];

    const columnsRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates' 
        AND table_schema = 'public'
    `);
    
    const columnNames = columnsRes.rows.map(c => c.column_name);
    const hasStatus = columnNames.includes('status');
    const hasOrgId = columnNames.includes('organization_id');

    if (hasStatus) {
      conditions.push(`status = 'active'`);
    }

    if (!isSuperadmin) {
      const orgsResult = await query(
        `SELECT organization_id FROM organization_members WHERE user_id = $1 AND status = 'active'`,
        [req.userId]
      );
      const orgIds = orgsResult.rows.map(r => r.organization_id).filter(Boolean);

      if (hasOrgId) {
        if (orgIds.length > 0) {
          // Only show templates from the user's organizations OR global templates (NULL organization_id)
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

    if (columnNames.includes('sort_order')) {
      sql += ` ORDER BY sort_order ASC, created_at ASC`;
    } else {
      sql += ` ORDER BY created_at ASC`;
    }

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('CRITICAL: Permission Templates Fetch Error', {
      requestId,
      userId: req.userId,
      message: error.message,
      code: error.code,
      stack: error.stack,
      sql: error.query || 'N/A'
    });
    logError('permission_templates.get_failed', error, { userId: req.userId, requestId });
    res.status(500).json({ error: 'Erro ao buscar templates', requestId });
  }
});

// Create template (superadmin or org owner/admin)
router.post('/', authenticate, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  try {
    const userResult = await query(
      `SELECT u.is_superadmin, om.role, om.organization_id FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id AND om.status = 'active'
       WHERE u.id = $1`,
      [req.userId]
    );
    
    const isSuperadmin = userResult.rows.some(r => r.is_superadmin);
    const userRole = userResult.rows.find(r => r.role === 'owner' || r.role === 'admin')?.role;
    const isOwnerOrAdmin = !!userRole;
    const activeOrgId = userResult.rows.find(r => r.organization_id)?.organization_id || null;

    if (!isSuperadmin && !isOwnerOrAdmin) {
      logWarn('permission_templates.create_denied', { userId: req.userId, requestId });
      return res.status(403).json({ error: 'Sem permissão para criar templates' });
    }

    const { name, description, icon, permissions, organization_id } = req.body;
    
    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório', requestId });
    }
    if (!permissions || (typeof permissions !== 'object' && typeof permissions !== 'string')) {
      return res.status(400).json({ error: 'Permissões são obrigatórias', requestId });
    }

    const targetOrgId = isSuperadmin ? (organization_id || null) : activeOrgId;

    // Check for duplicate name in the same company
    const duplicateCheck = await query(
      `SELECT id FROM permission_templates 
       WHERE LOWER(name) = LOWER($1) 
       AND (organization_id = $2 OR (organization_id IS NULL AND $2 IS NULL))
       AND status = 'active'`,
      [name.trim(), targetOrgId]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Já existe um template com este nome nesta empresa', 
        requestId 
      });
    }

    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM permission_templates`);
    
    const columnsRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates' AND column_name IN ('organization_id', 'status', 'is_default')
    `);
    const columnNames = columnsRes.rows.map(c => c.column_name);
    const hasOrgId = columnNames.includes('organization_id');
    const hasStatus = columnNames.includes('status');
    const hasIsDefault = columnNames.includes('is_default');

    const permissionsJson = typeof permissions === 'string' ? permissions : JSON.stringify(permissions);

    let insertSql = `INSERT INTO permission_templates (name, description, icon, permissions, sort_order`;
    let valuesSql = `VALUES ($1, $2, $3, $4, $5`;
    const params = [name.trim(), description || null, icon || 'Users', permissionsJson, maxSort.rows[0].next];

    if (hasOrgId) {
      insertSql += `, organization_id`;
      valuesSql += `, $${params.length + 1}`;
      params.push(targetOrgId);
    }
    if (hasStatus) {
      insertSql += `, status`;
      valuesSql += `, 'active'`;
    }
    if (hasIsDefault) {
      insertSql += `, is_default`;
      valuesSql += `, false`;
    }

    insertSql += `) ${valuesSql}) RETURNING *`;

    const result = await query(insertSql, params);
    logInfo('permission_templates.created', { templateId: result.rows[0].id, userId: req.userId, requestId });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logError('permission_templates.create_failed', error, { 
      userId: req.userId, 
      requestId,
      body: { ...req.body, permissions: '...' } 
    });
    res.status(500).json({ 
      error: 'Erro interno ao criar template', 
      requestId 
    });
  }
});

// Update template (superadmin or org owner/admin)
router.put('/:id', authenticate, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
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
      logWarn('permission_templates.update_denied', { userId: req.userId, requestId, templateId: req.params.id });
      return res.status(403).json({ error: 'Sem permissão para editar templates', requestId });
    }

    const { name, description, icon, permissions, organization_id } = req.body;
    
    if (!isSuperadmin) {
      const templateCheck = await query(
        `SELECT organization_id FROM permission_templates WHERE id = $1`,
        [req.params.id]
      );
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Template não encontrado', requestId });
      }
      const tOrgId = templateCheck.rows[0].organization_id;
      if (tOrgId && !orgIds.includes(tOrgId)) {
        logWarn('permission_templates.update_unauthorized_org', { userId: req.userId, requestId, templateId: req.params.id });
        return res.status(403).json({ error: 'Sem acesso a este template', requestId });
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
      return res.status(400).json({ error: 'Tabela de templates não inicializada', requestId });
    }

    const columnsRes = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'permission_templates' AND column_name IN ('organization_id', 'status')
    `);
    const hasOrgId = columnsRes.rows.some(c => c.column_name === 'organization_id');

    let updateSql = `UPDATE permission_templates SET name = COALESCE($1, name), description = $2, icon = COALESCE($3, icon), permissions = COALESCE($4, permissions), updated_at = NOW()`;
    const updateParams = [
      name || null, 
      description || null, 
      icon || null, 
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
      return res.status(404).json({ error: 'Template não encontrado após atualização', requestId });
    }

    logInfo('permission_templates.updated', { templateId: result.rows[0].id, userId: req.userId, requestId });
    res.json(result.rows[0]);
  } catch (error) {
    logError('permission_templates.update_failed', error, { userId: req.userId, requestId, templateId: req.params.id });
    res.status(500).json({ error: 'Erro ao atualizar template', requestId });
  }
});

// Delete template (superadmin or org owner/admin)
router.delete('/:id', authenticate, async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
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
      return res.status(403).json({ error: 'Sem permissão para excluir templates', requestId });
    }

    if (!isSuperadmin) {
      const templateCheck = await query(
        `SELECT organization_id FROM permission_templates WHERE id = $1`,
        [req.params.id]
      );
      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Template não encontrado', requestId });
      }
      const tOrgId = templateCheck.rows[0].organization_id;
      if (tOrgId && !orgIds.includes(tOrgId)) {
        return res.status(403).json({ error: 'Sem acesso a este template', requestId });
      }
    }

    const result = await query(`DELETE FROM permission_templates WHERE id = $1 RETURNING id`, [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado ou já excluído', requestId });
    }

    logInfo('permission_templates.deleted', { templateId: req.params.id, userId: req.userId, requestId });
    res.json({ success: true });
  } catch (error) {
    logError('permission_templates.delete_failed', error, { userId: req.userId, requestId, templateId: req.params.id });
    res.status(500).json({ error: 'Erro ao excluir template', requestId });
  }
});

export default router;
