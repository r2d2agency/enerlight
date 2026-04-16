import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All permission column names
const PERMISSION_COLUMNS = [
  'can_view_chat', 'can_view_chatbots', 'can_view_flows', 'can_view_departments',
  'can_view_schedules', 'can_view_tags', 'can_view_contacts', 'can_view_ai_secretary',
  'can_view_ai_agents', 'can_view_crm', 'can_view_prospects', 'can_view_companies',
  'can_view_map', 'can_view_calendar', 'can_view_tasks', 'can_view_reports',
  'can_view_revenue_intel', 'can_view_ghost', 'can_view_crm_settings',
  'can_view_projects', 'can_view_campaigns', 'can_view_sequences',
  'can_view_external_flows', 'can_view_webhooks', 'can_view_ctwa',
  'can_view_billing', 'can_view_connections', 'can_view_organizations', 'can_view_settings',
  'can_view_internal_chat', 'can_view_lead_gleego', 'can_view_homologation', 'can_view_captador',
  'can_view_licitacao', 'can_view_logistics', 'can_view_document_signatures',
  'can_delete_deals', 'can_delete_projects', 'can_delete_tasks', 'can_delete_homologation', 'can_delete_licitacao',
  'can_edit_logistics', 'can_delete_logistics',
];

// Default permissions for each role
const ROLE_DEFAULTS = {
  owner: Object.fromEntries(PERMISSION_COLUMNS.map(c => [c, true])),
  admin: Object.fromEntries(PERMISSION_COLUMNS.map(c => [c, true])),
  manager: {
    can_view_chat: true, can_view_chatbots: false, can_view_flows: false,
    can_view_departments: false, can_view_schedules: true, can_view_tags: true,
    can_view_contacts: true, can_view_ai_secretary: false, can_view_ai_agents: false,
    can_view_crm: true, can_view_prospects: true, can_view_companies: true,
    can_view_map: true, can_view_calendar: true, can_view_tasks: true,
    can_view_reports: true, can_view_revenue_intel: false, can_view_ghost: false,
    can_view_crm_settings: false, can_view_projects: true,
    can_view_campaigns: false, can_view_sequences: false,
    can_view_external_flows: false, can_view_webhooks: false, can_view_ctwa: false,
    can_view_billing: false, can_view_connections: false, can_view_organizations: false,
    can_view_settings: true, can_view_internal_chat: true, can_view_lead_gleego: false,
    can_view_homologation: false, can_view_captador: false, can_view_licitacao: false, can_view_logistics: true,
    can_view_document_signatures: false,
    can_delete_deals: true, can_delete_projects: true, can_delete_tasks: true, can_delete_homologation: true, can_delete_licitacao: false,
    can_edit_logistics: false, can_delete_logistics: false,
  },
  supervisor: {
    can_view_chat: true, can_view_chatbots: true, can_view_flows: false,
    can_view_departments: true, can_view_schedules: true, can_view_tags: true,
    can_view_contacts: true, can_view_ai_secretary: false, can_view_ai_agents: false,
    can_view_crm: true, can_view_prospects: true, can_view_companies: true,
    can_view_map: true, can_view_calendar: true, can_view_tasks: true,
    can_view_reports: true, can_view_revenue_intel: false, can_view_ghost: false,
    can_view_crm_settings: false, can_view_projects: true,
    can_view_campaigns: false, can_view_sequences: false,
    can_view_external_flows: false, can_view_webhooks: false, can_view_ctwa: false,
    can_view_billing: false, can_view_connections: false, can_view_organizations: false,
    can_view_settings: true, can_view_internal_chat: true, can_view_lead_gleego: false,
    can_view_homologation: false, can_view_captador: false, can_view_licitacao: false, can_view_logistics: true,
    can_view_document_signatures: false,
    can_delete_deals: true, can_delete_projects: true, can_delete_tasks: true, can_delete_homologation: true, can_delete_licitacao: false,
    can_edit_logistics: false, can_delete_logistics: false,
  },
  designer: {
    can_view_chat: true, can_view_chatbots: false, can_view_flows: false,
    can_view_departments: false, can_view_schedules: true, can_view_tags: true,
    can_view_contacts: true, can_view_ai_secretary: false, can_view_ai_agents: false,
    can_view_crm: false, can_view_prospects: false, can_view_companies: false,
    can_view_map: false, can_view_calendar: true, can_view_tasks: true,
    can_view_reports: false, can_view_revenue_intel: false, can_view_ghost: false,
    can_view_crm_settings: false, can_view_projects: true,
    can_view_campaigns: false, can_view_sequences: false,
    can_view_external_flows: false, can_view_webhooks: false, can_view_ctwa: false,
    can_view_billing: false, can_view_connections: false, can_view_organizations: false,
    can_view_settings: true, can_view_internal_chat: true, can_view_lead_gleego: false,
    can_view_homologation: false, can_view_captador: false, can_view_licitacao: false, can_view_logistics: true,
    can_view_document_signatures: false,
    can_delete_deals: false, can_delete_projects: true, can_delete_tasks: true, can_delete_homologation: false, can_delete_licitacao: false,
    can_edit_logistics: false, can_delete_logistics: false,
  },
  agent: {
    can_view_chat: true, can_view_chatbots: false, can_view_flows: false,
    can_view_departments: false, can_view_schedules: true, can_view_tags: true,
    can_view_contacts: true, can_view_ai_secretary: false, can_view_ai_agents: false,
    can_view_crm: true, can_view_prospects: true, can_view_companies: false,
    can_view_map: false, can_view_calendar: true, can_view_tasks: true,
    can_view_reports: false, can_view_revenue_intel: false, can_view_ghost: false,
    can_view_crm_settings: false, can_view_projects: false,
    can_view_campaigns: false, can_view_sequences: false,
    can_view_external_flows: false, can_view_webhooks: false, can_view_ctwa: false,
    can_view_billing: false, can_view_connections: false, can_view_organizations: false,
    can_view_settings: true, can_view_internal_chat: true, can_view_lead_gleego: false,
    can_view_homologation: false, can_view_captador: false, can_view_licitacao: false, can_view_logistics: true,
    can_view_document_signatures: false,
    can_delete_deals: false, can_delete_projects: false, can_delete_tasks: false, can_delete_homologation: false, can_delete_licitacao: false,
    can_edit_logistics: false, can_delete_logistics: false,
  },
};

const PERMISSION_COLUMN_REGEX = /^(can_view_|can_edit_|can_delete_)[a-z0-9_]+$/;

let ensurePermissionColumnsPromise = null;

async function ensurePermissionColumns() {
  if (!ensurePermissionColumnsPromise) {
    ensurePermissionColumnsPromise = (async () => {
      const tableCheck = await query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'user_permissions' LIMIT 1`
      );

      if (tableCheck.rows.length === 0) {
        return false;
      }

      for (const column of PERMISSION_COLUMNS) {
        if (!PERMISSION_COLUMN_REGEX.test(column)) {
          throw new Error(`Nome de coluna de permissão inválido: ${column}`);
        }

        await query(
          `ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS ${column} BOOLEAN DEFAULT false`
        );
      }

      return true;
    })().catch((error) => {
      ensurePermissionColumnsPromise = null;
      throw error;
    });
  }

  return ensurePermissionColumnsPromise;
}

// Get permissions for a user
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;

    const callerOrg = await query(
      `SELECT om.organization_id, om.role, u.is_superadmin 
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1
       LIMIT 1`,
      [req.userId]
    );

    if (callerOrg.rows.length === 0) {
      return res.status(403).json({ error: 'Sem organização' });
    }

    const isSuperadmin = callerOrg.rows[0].is_superadmin === true;
    const callerRole = callerOrg.rows[0].role;
    const organization_id = callerOrg.rows[0].organization_id;

    if (!isSuperadmin && req.userId !== userId && !['owner', 'admin'].includes(callerRole)) {
      return res.status(403).json({ error: 'Apenas admin/owner podem visualizar permissões de outros usuários' });
    }

    const orgResult = await query(
      `SELECT om.organization_id, om.role
       FROM organization_members om
       WHERE om.user_id = $1 AND om.organization_id = $2
       LIMIT 1`,
      [userId, organization_id]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado na organização' });
    }

    const { role } = orgResult.rows[0];
    
    const hasPermissionTable = await ensurePermissionColumns();

    if (!hasPermissionTable) {
      // Table doesn't exist yet, return role defaults
      const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent;
      return res.json({ permissions: defaults, is_custom: false, role });
    }
    
    // Check if custom permissions exist
    const permResult = await query(
      `SELECT * FROM user_permissions WHERE user_id = $1 AND organization_id = $2`,
      [userId, organization_id]
    );
    
    if (permResult.rows.length > 0) {
      const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent;
      const perms = {};
      for (const col of PERMISSION_COLUMNS) {
        perms[col] = permResult.rows[0][col] ?? defaults[col];
      }
      res.json({ permissions: perms, is_custom: true, role });
    } else {
      // Return defaults for role
      const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent;
      res.json({ permissions: defaults, is_custom: false, role });
    }
  } catch (error) {
    console.error('Get permissions error:', error);
    // Fallback: return all-true permissions instead of 500
    res.json({ permissions: Object.fromEntries(PERMISSION_COLUMNS.map(c => [c, true])), is_custom: false, role: 'owner' });
  }
});

// Update permissions for a user
router.put('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;
    
    if (!permissions) {
      return res.status(400).json({ error: 'Permissões são obrigatórias' });
    }
    
    // Get caller's org and role
    const callerOrg = await query(
      `SELECT om.organization_id, om.role, u.is_superadmin 
       FROM organization_members om 
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1 LIMIT 1`,
      [req.userId]
    );
    
    if (callerOrg.rows.length === 0) return res.status(403).json({ error: 'Sem organização' });
    
    const isSuperadmin = callerOrg.rows[0].is_superadmin;
    const callerRole = callerOrg.rows[0].role;
    
    if (!isSuperadmin && !['owner', 'admin'].includes(callerRole)) {
      return res.status(403).json({ error: 'Apenas admin/owner podem alterar permissões' });
    }
    
    const orgId = callerOrg.rows[0].organization_id;

    const hasPermissionTable = await ensurePermissionColumns();

    if (!hasPermissionTable) {
      return res.status(500).json({ error: 'Tabela de permissões não encontrada' });
    }

    const targetMembership = await query(
      `SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2 LIMIT 1`,
      [userId, orgId]
    );

    if (targetMembership.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado na organização' });
    }
    
    // Get actual columns from the table to avoid inserting into non-existent columns
    const colCheck = await query(
       `SELECT column_name FROM information_schema.columns WHERE table_name = 'user_permissions' AND (column_name LIKE 'can_view_%' OR column_name LIKE 'can_edit_%' OR column_name LIKE 'can_delete_%')`
    );
    const existingCols = new Set(colCheck.rows.map(r => r.column_name));

    const requestedPermissionColumns = Object.keys(permissions).filter(col => PERMISSION_COLUMNS.includes(col));
    const missingCols = requestedPermissionColumns.filter(col => !existingCols.has(col));

    if (missingCols.length > 0) {
      console.error('Update permissions error: missing columns in user_permissions', {
        userId,
        organization_id: orgId,
        missingCols,
      });

      return res.status(500).json({
        error: `Colunas de permissão ausentes no banco: ${missingCols.join(', ')}`,
      });
    }
    
    // Build upsert only with columns that exist in DB AND were sent
    const columns = PERMISSION_COLUMNS.filter(c => permissions[c] !== undefined && existingCols.has(c));
    const values = columns.map(c => permissions[c]);
    
    if (columns.length === 0) {
      return res.status(400).json({ error: 'Nenhuma permissão válida para atualizar' });
    }
    
    const insertCols = ['user_id', 'organization_id', ...columns].join(', ');
    const insertVals = [userId, orgId, ...values].map((_, i) => `$${i + 1}`).join(', ');
    const updateClauses = columns.map(c => `${c} = EXCLUDED.${c}`).join(', ');
    
    await query(
      `INSERT INTO user_permissions (${insertCols}) VALUES (${insertVals})
       ON CONFLICT (user_id, organization_id) DO UPDATE SET ${updateClauses}, updated_at = NOW()`,
      [userId, orgId, ...values]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: error.message || 'Erro ao atualizar permissões' });
  }
});

// Reset permissions to role defaults
router.delete('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const callerOrg = await query(
      `SELECT om.organization_id, om.role, u.is_superadmin 
       FROM organization_members om 
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1 LIMIT 1`,
      [req.userId]
    );
    
    if (callerOrg.rows.length === 0) return res.status(403).json({ error: 'Sem organização' });
    
    const isSuperadmin = callerOrg.rows[0].is_superadmin;
    const callerRole = callerOrg.rows[0].role;
    
    if (!isSuperadmin && !['owner', 'admin'].includes(callerRole)) {
      return res.status(403).json({ error: 'Apenas admin/owner podem alterar permissões' });
    }
    
    const targetMembership = await query(
      `SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2 LIMIT 1`,
      [userId, callerOrg.rows[0].organization_id]
    );

    if (targetMembership.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado na organização' });
    }

    await query(
      `DELETE FROM user_permissions WHERE user_id = $1 AND organization_id = $2`,
      [userId, callerOrg.rows[0].organization_id]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Reset permissions error:', error);
    res.status(500).json({ error: 'Erro ao resetar permissões' });
  }
});

export default router;
export { PERMISSION_COLUMNS, ROLE_DEFAULTS };
