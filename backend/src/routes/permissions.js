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
  'can_view_internal_chat',
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
    can_view_settings: true, can_view_internal_chat: true,
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
    can_view_settings: true, can_view_internal_chat: true,
  },
};

// Get permissions for a user
router.get('/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get user's org
    const orgResult = await query(
      `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
      [userId]
    );
    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado na organização' });
    }
    
    const { organization_id, role } = orgResult.rows[0];
    
    // Check if custom permissions exist
    const permResult = await query(
      `SELECT * FROM user_permissions WHERE user_id = $1 AND organization_id = $2`,
      [userId, organization_id]
    );
    
    if (permResult.rows.length > 0) {
      const perms = {};
      for (const col of PERMISSION_COLUMNS) {
        perms[col] = permResult.rows[0][col];
      }
      res.json({ permissions: perms, is_custom: true, role });
    } else {
      // Return defaults for role
      const defaults = ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent;
      res.json({ permissions: defaults, is_custom: false, role });
    }
  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({ error: 'Erro ao buscar permissões' });
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
    
    // Build upsert
    const columns = PERMISSION_COLUMNS.filter(c => permissions[c] !== undefined);
    const values = columns.map(c => permissions[c]);
    
    const setClauses = columns.map((c, i) => `${c} = $${i + 3}`).join(', ');
    const insertCols = ['user_id', 'organization_id', ...columns].join(', ');
    const insertVals = [userId, orgId, ...values].map((_, i) => `$${i + 1}`).join(', ');
    const updateClauses = columns.map((c, i) => `${c} = EXCLUDED.${c}`).join(', ');
    
    await query(
      `INSERT INTO user_permissions (${insertCols}) VALUES (${insertVals})
       ON CONFLICT (user_id, organization_id) DO UPDATE SET ${updateClauses}, updated_at = NOW()`,
      [userId, orgId, ...values]
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update permissions error:', error);
    res.status(500).json({ error: 'Erro ao atualizar permissões' });
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
