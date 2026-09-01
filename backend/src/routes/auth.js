import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db.js';
import { ROLE_DEFAULTS } from './permissions.js';
import { invalidatePasswordChangedCache, isTokenInvalidated } from '../middleware/auth.js';
import { sendSystemEmail } from '../lib/systemEmail.js';

const router = Router();

function generateTempPassword() {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(10);
  let pwd = '';
  for (let i = 0; i < bytes.length; i++) {
    pwd += charset[bytes[i] % charset.length];
  }
  return pwd;
}

// Public app URL to link back to from system emails (never an internal/host URL)
function appBaseUrl(req) {
  const PUBLIC_DEFAULT = 'https://app.enerlight.com.br';
  const isInternal = (u) => /easypanel|localhost|127\.0\.0\.1|whastsale-backend|backend\./i.test(String(u || ''));
  const clean = (u) => {
    if (!u || isInternal(u)) return '';
    try { return new URL(u).origin; } catch { return ''; }
  };
  const fromHeader = clean(req.get('origin') || req.get('referer') || '');
  return fromHeader || PUBLIC_DEFAULT;
}

// Very small in-memory cooldown to avoid trivial email-bombing of /forgot-password
const forgotPasswordCooldown = new Map();
const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;

const SESSION_PERMISSION_PREFIXES = ['can_view_', 'can_edit_', 'can_delete_', 'can_validate_', 'can_manage_', 'can_approve_', 'can_accept_', 'can_refuse_', 'can_create_', 'can_manage_representative_config'];

function buildSessionPermissions(row, role) {
  const roleDefaults = role ? (ROLE_DEFAULTS[role] || ROLE_DEFAULTS.agent) : null;

  if (row) {
    const permissions = {};
    const permissionKeys = new Set([
      ...Object.keys(roleDefaults || {}),
      ...Object.keys(row),
    ]);

    for (const key of permissionKeys) {
      if (SESSION_PERMISSION_PREFIXES.some(prefix => key.startsWith(prefix))) {
        const value = row[key] ?? roleDefaults?.[key];
        if (value !== undefined) {
          permissions[key] = value;
        }
      }
    }
    return permissions;
  }

  return roleDefaults;
}

// Get visible plans for signup (public endpoint)
router.get('/plans', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, max_connections, max_monthly_messages, max_users, max_supervisors, 
              has_asaas_integration, has_chat, has_whatsapp_groups, has_campaigns, 
              price, billing_period, trial_days
       FROM plans 
       WHERE is_active = true AND visible_on_signup = true 
       ORDER BY price ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({ error: 'Erro ao buscar planos' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    let { email, password, name, plan_id } = req.body;

    // Normalize inputs (prevents trailing spaces and case issues that block login)
    email = typeof email === 'string' ? email.trim() : email;
    name = typeof name === 'string' ? name.trim() : name;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    // Check if user exists (case-insensitive + trim)
    const existing = await query(
      'SELECT id FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Validate plan if provided
    let selectedPlan = null;
    if (plan_id) {
      const planResult = await query(
        'SELECT id, name, trial_days FROM plans WHERE id = $1 AND is_active = true AND visible_on_signup = true',
        [plan_id]
      );
      if (planResult.rows.length === 0) {
        return res.status(400).json({ error: 'Plano inválido ou não disponível' });
      }
      selectedPlan = planResult.rows[0];
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const result = await query(
      'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [email, passwordHash, name]
    );

    const user = result.rows[0];

    // Create organization (always, even without a plan)
    const slug = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      + '-' + Date.now().toString(36);

    let modulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
      chat: true,
      crm: true,
      logistics: false,
    };

    let expiresAt = null;

    if (selectedPlan) {
      const trialDays = selectedPlan.trial_days || 3;
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + trialDays);

      // Get plan modules for organization
      const planModulesResult = await query(
        `SELECT has_campaigns, has_asaas_integration, has_whatsapp_groups, has_scheduled_messages, has_chatbots, has_chat, has_crm, has_group_secretary, has_ghost, has_projects, has_homologation, has_tasks, has_lead_gleego, has_licitacao, has_logistics FROM plans WHERE id = $1`,
        [selectedPlan.id]
      );
      
      if (planModulesResult.rows.length > 0) {
        const plan = planModulesResult.rows[0];
        modulesEnabled = {
          campaigns: plan.has_campaigns ?? true,
          billing: plan.has_asaas_integration ?? true,
          groups: plan.has_whatsapp_groups ?? true,
          scheduled_messages: plan.has_scheduled_messages ?? true,
          chatbots: plan.has_chatbots ?? true,
          chat: plan.has_chat ?? true,
          crm: plan.has_crm ?? true,
          group_secretary: plan.has_group_secretary ?? false,
          ghost: plan.has_ghost ?? false,
          projects: plan.has_projects ?? false,
          homologation: plan.has_homologation ?? false,
          tasks: plan.has_tasks !== false,
          lead_gleego: plan.has_lead_gleego ?? false,
          licitacao: plan.has_licitacao ?? false,
          logistics: plan.has_logistics ?? false,
        };
      }
    }

    // Create organization with modules
    const orgResult = await query(
      `INSERT INTO organizations (name, slug, plan_id, expires_at, modules_enabled) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, slug, selectedPlan?.id || null, expiresAt?.toISOString() || null, JSON.stringify(modulesEnabled)]
    );

    const orgId = orgResult.rows[0].id;

    // Add user as owner
    await query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [orgId, user.id]
    );

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Fetch role and modules like login does, so the frontend has full context
    const orgRoleResult = await query(
      `SELECT om.role, o.id as organization_id, o.modules_enabled
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'agent' THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [user.id]
    );

    const role = orgRoleResult.rows[0]?.role || null;
    const organizationId = orgRoleResult.rows[0]?.organization_id || null;
    const finalModules = orgRoleResult.rows[0]?.modules_enabled || {
      campaigns: true, billing: true, groups: true,
       scheduled_messages: true, chatbots: true, chat: true, crm: true, logistics: false,
    };

    res.status(201).json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role,
        organization_id: organizationId,
        modules_enabled: finalModules,
         user_permissions: buildSessionPermissions(null, role),
      }, 
      token 
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    // Normalize inputs
    email = typeof email === 'string' ? email.trim() : email;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Find user
    const result = await query(
      'SELECT id, email, name, password_hash, is_superadmin, must_change_password, temp_password_expires_at FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const isSuperadmin = user.is_superadmin === true;

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.must_change_password && user.temp_password_expires_at && new Date(user.temp_password_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Senha temporária expirada. Solicite a recuperação de senha novamente.' });
    }

    // Get role and organization info
    const orgResult = await query(
      `SELECT om.role, o.id as organization_id, o.modules_enabled
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'agent' THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [user.id]
    );

    const role = orgResult.rows[0]?.role || null;
    const organizationId = orgResult.rows[0]?.organization_id || null;
    
    // Superadmin always has all modules enabled
    const allModulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
      chat: true,
      crm: true,
      ai_agents: true,
      group_secretary: true,
      ghost: true,
      projects: true,
      internal_chat: true,
      homologation: true,
      tasks: true,
      lead_gleego: true,
      captador: true,
      licitacao: true,
      document_signatures: true,
      logistics: true,
    };
    
    // Only superadmin bypasses module restrictions - owners/admins follow plan settings
    let modulesEnabled = allModulesEnabled;
    if (!isSuperadmin) {
      modulesEnabled = orgResult.rows[0]?.modules_enabled || allModulesEnabled;
    }

    // Get user-level permissions
    let userPermissions = buildSessionPermissions(null, role);
    try {
      const permResult = await query(
        `SELECT * FROM user_permissions WHERE user_id = $1 AND organization_id = $2`,
        [user.id, organizationId]
      );
      if (permResult.rows.length > 0) {
        userPermissions = buildSessionPermissions(permResult.rows[0], role);
      }
    } catch (_) {
      // table might not exist yet
    }

    // Generate token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Check if user has any connections assigned
    let hasConnections = false;
    try {
      const connResult = await query(
        `SELECT 1 FROM connection_members WHERE user_id = $1 LIMIT 1`,
        [user.id]
      );
      if (connResult.rows.length > 0) {
        hasConnections = true;
      } else {
        const directConn = await query(
          `SELECT 1 FROM connections WHERE user_id = $1 LIMIT 1`,
          [user.id]
        );
        hasConnections = directConn.rows.length > 0;
      }
    } catch (e) {
      try {
        const directConn = await query(
          `SELECT 1 FROM connections WHERE user_id = $1 LIMIT 1`,
          [user.id]
        );
        hasConnections = directConn.rows.length > 0;
      } catch (e2) {
        hasConnections = true;
      }
    }
    if (isSuperadmin || ['owner', 'admin', 'manager'].includes(role)) {
      hasConnections = true;
    }

    res.json({
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        is_superadmin: isSuperadmin,
        role,
        organization_id: organizationId,
        modules_enabled: modulesEnabled,
        has_connections: hasConnections,
        user_permissions: isSuperadmin ? null : userPermissions,
        must_change_password: user.must_change_password === true,
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Forgot password: emails a temporary password to the registered address (public endpoint)
router.post('/forgot-password', async (req, res) => {
  try {
    let { email } = req.body;
    email = typeof email === 'string' ? email.trim() : email;

    if (!email) {
      return res.status(400).json({ error: 'Email é obrigatório' });
    }

    const genericResponse = { message: 'Se o email estiver cadastrado, você receberá uma senha temporária em instantes.' };

    const cooldownKey = email.toLowerCase();
    const lastRequest = forgotPasswordCooldown.get(cooldownKey);
    if (lastRequest && Date.now() - lastRequest < FORGOT_PASSWORD_COOLDOWN_MS) {
      return res.json(genericResponse);
    }
    forgotPasswordCooldown.set(cooldownKey, Date.now());

    const result = await query(
      'SELECT id, name, email FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.json(genericResponse);
    }

    const user = result.rows[0];
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = true,
           temp_password_expires_at = NOW() + INTERVAL '1 hour',
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, user.id]
    );
    invalidatePasswordChangedCache(user.id);

    try {
      const loginUrl = `${appBaseUrl(req)}/login`;
      await sendSystemEmail({
        to: user.email,
        subject: 'Recuperação de senha',
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
          <h2 style="color:#0ea5e9">Recuperação de senha</h2>
          <p>Olá${user.name ? `, <b>${user.name}</b>` : ''}!</p>
          <p>Recebemos uma solicitação para redefinir sua senha. Use a senha temporária abaixo para entrar:</p>
          <p style="font-size:20px;font-weight:bold;letter-spacing:1px;background:#f5f5f5;padding:12px 16px;border-radius:6px;text-align:center">${tempPassword}</p>
          <p>Essa senha temporária é válida por <b>1 hora</b>. Ao entrar com ela, você será solicitado a cadastrar uma nova senha.</p>
          <p><a href="${loginUrl}" style="color:#0ea5e9">Acessar agora</a></p>
          <p style="color:#666;font-size:13px;margin-top:16px">Se você não solicitou esta recuperação, ignore este email — sua senha atual deixará de funcionar após o envio; entre em contato com o suporte caso não reconheça esta ação.</p>
        </div>`,
      });
    } catch (emailError) {
      console.error('Forgot password email error:', emailError);
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// Set a new password after logging in with a temporary one
router.post('/set-new-password', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = false,
           temp_password_expires_at = NULL,
           password_changed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id`,
      [passwordHash, decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    invalidatePasswordChangedCache(decoded.userId);

    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Set new password error:', error);
    res.status(500).json({ error: 'Erro ao atualizar senha' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (await isTokenInvalidated(decoded.userId, decoded.iat)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    
    const result = await query(
      'SELECT id, email, name, is_superadmin, must_change_password, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = result.rows[0];
    const isSuperadmin = user.is_superadmin === true;

    // Role and organization info (multi-tenant)
    const orgResult = await query(
      `SELECT om.role, o.id as organization_id, o.modules_enabled
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY CASE om.role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'agent' THEN 4
         ELSE 5
       END
       LIMIT 1`,
      [decoded.userId]
    );

    const role = orgResult.rows[0]?.role || null;
    const organizationId = orgResult.rows[0]?.organization_id || null;
    
    // Superadmin always has all modules enabled
    const allModulesEnabled = {
      campaigns: true,
      billing: true,
      groups: true,
      scheduled_messages: true,
      chatbots: true,
      chat: true,
      crm: true,
      ai_agents: true,
      group_secretary: true,
      ghost: true,
      projects: true,
      internal_chat: true,
      homologation: true,
      tasks: true,
      lead_gleego: true,
      captador: true,
      licitacao: true,
      document_signatures: true,
      logistics: true,
    };
    
    // Only superadmin bypasses module restrictions - owners/admins follow plan settings
    let modulesEnabled = allModulesEnabled;
    if (!isSuperadmin) {
      modulesEnabled = orgResult.rows[0]?.modules_enabled || allModulesEnabled;
    }

    // Get user-level permissions
    let userPermissions = buildSessionPermissions(null, role);
    try {
      const permResult = await query(
        `SELECT * FROM user_permissions WHERE user_id = $1 AND organization_id = $2`,
        [decoded.userId, organizationId]
      );
      if (permResult.rows.length > 0) {
        userPermissions = buildSessionPermissions(permResult.rows[0], role);
      }
    } catch (_) {
      // table might not exist yet
    }

    // Check if user has any connections assigned
    let hasConnections = false;
    try {
      const connResult = await query(
        `SELECT 1 FROM connection_members WHERE user_id = $1 LIMIT 1`,
        [decoded.userId]
      );
      if (connResult.rows.length > 0) {
        hasConnections = true;
      } else {
        // Also check if user owns connections directly or has org-level access
        const directConn = await query(
          `SELECT 1 FROM connections WHERE user_id = $1 LIMIT 1`,
          [decoded.userId]
        );
        hasConnections = directConn.rows.length > 0;
      }
    } catch (e) {
      // connection_members table might not exist, fallback to direct connections
      try {
        const directConn = await query(
          `SELECT 1 FROM connections WHERE user_id = $1 LIMIT 1`,
          [decoded.userId]
        );
        hasConnections = directConn.rows.length > 0;
      } catch (e2) {
        hasConnections = true; // Assume true if we can't check
      }
    }
    // Superadmin/admin always has connections access
    if (isSuperadmin || ['owner', 'admin', 'manager'].includes(role)) {
      hasConnections = true;
    }

    // Auto-renew token if it expires within 7 days
    let newToken = null;
    if (decoded.exp) {
      const daysUntilExpiry = (decoded.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry < 7) {
        newToken = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '30d' }
        );
      }
    }

    res.json({ 
      user: { 
        id: user.id,
        email: user.email,
        name: user.name,
        is_superadmin: isSuperadmin,
        role,
        organization_id: organizationId,
        modules_enabled: modulesEnabled,
        has_connections: hasConnections,
        user_permissions: isSuperadmin ? null : userPermissions,
        must_change_password: user.must_change_password === true,
      },
      ...(newToken ? { token: newToken } : {}),
    });
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
});

// Update current user profile (name)
router.put('/profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (await isTokenInvalidated(decoded.userId, decoded.iat)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    
    let { name } = req.body;
    
    // Validate name
    name = typeof name === 'string' ? name.trim() : '';
    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Nome deve ter no máximo 100 caracteres' });
    }
    
    // Update user name
    const result = await query(
      'UPDATE users SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, name',
      [name, decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ user: result.rows[0], message: 'Perfil atualizado com sucesso' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// Change password
router.put('/password', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (await isTokenInvalidated(decoded.userId, decoded.iat)) {
      return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    }
    
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }
    
    // Get current user
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }
    
    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    // Update password and invalidate existing sessions
    await query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2',
      [passwordHash, decoded.userId]
    );
    invalidatePasswordChangedCache(decoded.userId);

    res.json({ message: 'Senha alterada com sucesso' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Erro ao alterar senha' });
  }
});

export default router;
