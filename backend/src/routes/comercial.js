import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sendSystemEmail } from '../lib/systemEmail.js';

// Portal Comercial — módulo unificado com duas portas de entrada:
//  - `router`        : login isolado para atores externos (representantes/parceiros sem conta `users`)
//  - `internalRouter` : atores internos (vendedores/gerentes da Enerlight), reaproveita o login do CRM
//  - `adminRouter`    : administração do módulo (gerida por quem já tem acesso ao CRM interno)
// Toda autorização é resolvida a partir de quem autenticou (req.actor / req.userId),
// nunca de um id recebido do cliente — ver PLAN item 21.

const router = Router();
const internalRouter = Router();
const adminRouter = Router();

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

const ACTOR_PROFILES = ['admin', 'gerente', 'vendedor', 'parceiro'];

// ---------------------------------------------------------------------------
// Helpers (deliberately local/duplicated — mesmo estilo já usado em
// representantes.js/ead.js/crm.js neste repo: helpers pequenos são copiados
// por arquivo de rota em vez de compartilhados)
// ---------------------------------------------------------------------------

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signExternalActor(actor) {
  return jwt.sign(
    { actorId: actor.id, email: actor.email, type: 'com_actor_external' },
    SECRET(),
    { expiresIn: '30d' }
  );
}

async function externalActorAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.slice(7), SECRET());
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  if (decoded.type !== 'com_actor_external') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Reconsulta o status a cada request (sem cache) para que um bloqueio pelo
  // admin tenha efeito imediato, sem esperar o JWT de 30 dias expirar.
  const result = await query(
    'SELECT id, status, organization_id FROM com_actors WHERE id = $1',
    [decoded.actorId]
  );
  const actor = result.rows[0];
  if (!actor || actor.status !== 'active') {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }

  req.actorId = actor.id;
  req.actorOrgId = actor.organization_id;
  next();
}

// Público, para linkar de volta a partir de e-mails do sistema (nunca uma URL interna/host)
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

async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

async function hasPerm(userId, key) {
  const u = await query('SELECT is_superadmin FROM users WHERE id = $1', [userId]);
  if (u.rows[0]?.is_superadmin) return true;
  const m = await query(`SELECT om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`, [userId]);
  const role = m.rows[0]?.role;
  if (['owner', 'admin'].includes(role)) return true;
  try {
    const p = await query(`SELECT ${key} as v FROM user_permissions WHERE user_id = $1 LIMIT 1`, [userId]);
    return !!p.rows[0]?.v;
  } catch {
    return false;
  }
}

function gate(key) {
  return async (req, res, next) => {
    const ok = await hasPerm(req.userId, key);
    if (!ok) return res.status(403).json({ error: 'Sem permissão' });
    next();
  };
}

// Resolve o com_actors do usuário interno autenticado (login do CRM) e bloqueia
// quem ainda não foi provisionado como ator do Portal Comercial pelo admin.
async function internalActorGate(req, res, next) {
  const result = await query('SELECT * FROM com_actors WHERE user_id = $1', [req.userId]);
  const actor = result.rows[0];
  if (!actor || actor.status !== 'active') {
    return res.status(403).json({ error: 'Você ainda não tem acesso ao Portal Comercial. Fale com o administrador.' });
  }
  req.actor = actor;
  next();
}

const INVITE_TOKEN_TTL_HOURS = 48;
const RESET_TOKEN_TTL_HOURS = 1;
const forgotPasswordCooldown = new Map();
const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;

function inviteEmailHtml({ name, link }) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
    <h2 style="color:#0ea5e9">Você foi convidado para o Portal Comercial Enerlight</h2>
    <p>Olá${name ? `, <b>${name}</b>` : ''}!</p>
    <p>Você foi cadastrado no Portal Comercial. Para ativar seu acesso, defina sua senha clicando no link abaixo:</p>
    <p><a href="${link}" style="color:#0ea5e9">Ativar minha conta</a></p>
    <p style="color:#666;font-size:13px;margin-top:16px">Este link é válido por ${INVITE_TOKEN_TTL_HOURS} horas.</p>
  </div>`;
}

function resetEmailHtml({ name, link }) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
    <h2 style="color:#0ea5e9">Recuperação de senha</h2>
    <p>Olá${name ? `, <b>${name}</b>` : ''}!</p>
    <p>Recebemos uma solicitação para redefinir sua senha do Portal Comercial. Clique no link abaixo para definir uma nova senha:</p>
    <p><a href="${link}" style="color:#0ea5e9">Redefinir senha</a></p>
    <p style="color:#666;font-size:13px;margin-top:16px">Este link é válido por ${RESET_TOKEN_TTL_HOURS} hora. Se você não solicitou, ignore este email.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Público (ator externo)
// ---------------------------------------------------------------------------

router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    email = typeof email === 'string' ? email.trim() : email;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await query(
      'SELECT id, email, name, password_hash, status FROM com_actors WHERE lower(email) = lower(trim($1)) LIMIT 1',
      [email]
    );

    const actor = result.rows[0];
    if (!actor || !actor.password_hash) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(password, actor.password_hash);
    if (!validPassword || actor.status !== 'active') {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    await query('UPDATE com_actors SET last_login_at = NOW() WHERE id = $1', [actor.id]);

    res.json({
      actor: { id: actor.id, email: actor.email, name: actor.name },
      token: signExternalActor(actor),
    });
  } catch (error) {
    console.error('[comercial] login error:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/validar-token', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).json({ valid: false });

    const result = await query(
      `SELECT name, invite_token_expires_at, invite_token_purpose
       FROM com_actors WHERE invite_token_hash = $1 LIMIT 1`,
      [hashToken(token)]
    );

    const actor = result.rows[0];
    if (!actor || !actor.invite_token_expires_at || new Date(actor.invite_token_expires_at) < new Date()) {
      return res.json({ valid: false });
    }

    res.json({ valid: true, purpose: actor.invite_token_purpose, name: actor.name });
  } catch (error) {
    console.error('[comercial] validar-token error:', error);
    res.status(500).json({ valid: false });
  }
});

router.post('/ativar-conta', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6) {
      return res.status(400).json({ error: 'Token e senha (mínimo 6 caracteres) são obrigatórios' });
    }

    const result = await query(
      `SELECT id, invite_token_expires_at FROM com_actors WHERE invite_token_hash = $1 LIMIT 1`,
      [hashToken(token)]
    );

    const actor = result.rows[0];
    if (!actor || !actor.invite_token_expires_at || new Date(actor.invite_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE com_actors
       SET password_hash = $1, status = 'active', activated_at = COALESCE(activated_at, NOW()),
           invite_token_hash = NULL, invite_token_expires_at = NULL, invite_token_purpose = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, actor.id]
    );

    res.json({ message: 'Senha definida com sucesso' });
  } catch (error) {
    console.error('[comercial] ativar-conta error:', error);
    res.status(500).json({ error: 'Erro ao ativar conta' });
  }
});

router.post('/esqueci-senha', async (req, res) => {
  try {
    let { email } = req.body;
    email = typeof email === 'string' ? email.trim() : email;
    if (!email) return res.status(400).json({ error: 'Email é obrigatório' });

    const genericResponse = { message: 'Se o email estiver cadastrado, você receberá um link de redefinição em instantes.' };

    const cooldownKey = email.toLowerCase();
    const last = forgotPasswordCooldown.get(cooldownKey);
    if (last && Date.now() - last < FORGOT_PASSWORD_COOLDOWN_MS) {
      return res.json(genericResponse);
    }
    forgotPasswordCooldown.set(cooldownKey, Date.now());

    const result = await query(
      `SELECT id, name, email, status, password_hash FROM com_actors WHERE lower(email) = lower(trim($1)) LIMIT 1`,
      [email]
    );

    const actor = result.rows[0];
    // Contas internas (sem password_hash) ou ainda pendentes não usam este fluxo
    if (!actor || !actor.password_hash) {
      return res.json(genericResponse);
    }

    const rawToken = genToken();
    await query(
      `UPDATE com_actors
       SET invite_token_hash = $1, invite_token_expires_at = NOW() + INTERVAL '${RESET_TOKEN_TTL_HOURS} hours',
           invite_token_purpose = 'reset', updated_at = NOW()
       WHERE id = $2`,
      [hashToken(rawToken), actor.id]
    );

    try {
      const link = `${appBaseUrl(req)}/comercial/definir-senha?token=${rawToken}`;
      await sendSystemEmail({
        to: actor.email,
        subject: 'Recuperação de senha — Portal Comercial Enerlight',
        html: resetEmailHtml({ name: actor.name, link }),
      });
    } catch (emailError) {
      console.error('[comercial] esqueci-senha email error:', emailError);
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('[comercial] esqueci-senha error:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// ---------------------------------------------------------------------------
// Ator externo autenticado
// ---------------------------------------------------------------------------

router.get('/me', externalActorAuth, async (req, res) => {
  const result = await query(
    `SELECT a.id, a.email, a.name, a.phone, a.profile, a.status, a.max_discount_percent,
            a.can_view_costs, a.can_view_margin, a.can_edit_price_manually,
            a.default_price_list_id, t.name as team_name
     FROM com_actors a LEFT JOIN com_teams t ON t.id = a.team_id
     WHERE a.id = $1`,
    [req.actorId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ator não encontrado' });
  res.json({ actor: result.rows[0] });
});

// ---------------------------------------------------------------------------
// Ator interno autenticado (mesmo login do CRM, escopo restrito ao Portal Comercial)
// ---------------------------------------------------------------------------

internalRouter.use(authenticate, internalActorGate);

internalRouter.get('/me', async (req, res) => {
  const result = await query(
    `SELECT a.id, a.email, a.name, a.phone, a.profile, a.status, a.max_discount_percent,
            a.can_view_costs, a.can_view_margin, a.can_edit_price_manually,
            a.default_price_list_id, t.name as team_name
     FROM com_actors a LEFT JOIN com_teams t ON t.id = a.team_id
     WHERE a.id = $1`,
    [req.actor.id]
  );
  res.json({ actor: result.rows[0] });
});

router.use('/interno', internalRouter);

// ---------------------------------------------------------------------------
// Administração do módulo (mesmo login do CRM interno, gate por permissão)
// ---------------------------------------------------------------------------

adminRouter.use(authenticate);

adminRouter.get('/actors', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT a.id, a.name, a.email, a.phone, a.profile, a.status, a.user_id, a.team_id,
            t.name as team_name, a.default_price_list_id, a.max_discount_percent,
            a.can_view_costs, a.can_view_margin, a.can_edit_price_manually,
            a.invited_at, a.activated_at, a.last_login_at, a.created_at
     FROM com_actors a LEFT JOIN com_teams t ON t.id = a.team_id
     WHERE a.organization_id = $1 ORDER BY a.created_at DESC`,
    [org.organization_id]
  );
  res.json({ actors: result.rows });
});

adminRouter.get('/actors/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT a.*, t.name as team_name FROM com_actors a
     LEFT JOIN com_teams t ON t.id = a.team_id
     WHERE a.id = $1 AND a.organization_id = $2`,
    [req.params.id, org.organization_id]
  );
  const actor = result.rows[0];
  if (!actor) return res.status(404).json({ error: 'Ator não encontrado' });
  delete actor.password_hash;
  delete actor.invite_token_hash;
  res.json({ actor });
});

// Vincula um usuário interno já existente no CRM como ator do Portal Comercial
// (sem senha nova — continua logando pelo /api/auth/login de sempre).
adminRouter.post('/actors/link-internal', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const { user_id, profile, team_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Usuário é obrigatório' });
    if (profile && !ACTOR_PROFILES.includes(profile)) {
      return res.status(400).json({ error: 'Perfil inválido' });
    }

    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const member = await query(
      `SELECT u.id, u.name, u.email FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.user_id = $1 AND om.organization_id = $2`,
      [user_id, org.organization_id]
    );
    const user = member.rows[0];
    if (!user) return res.status(400).json({ error: 'Usuário não pertence a esta organização' });

    const existing = await query('SELECT id FROM com_actors WHERE user_id = $1', [user_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Este usuário já tem acesso ao Portal Comercial' });
    }

    const result = await query(
      `INSERT INTO com_actors
         (organization_id, user_id, name, email, phone, profile, team_id, status, created_by)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, 'active', $7)
       RETURNING id, name, email, profile, status, team_id, created_at`,
      [org.organization_id, user_id, user.name, user.email, profile || 'vendedor', team_id || null, req.userId]
    );

    res.status(201).json({ actor: result.rows[0] });
  } catch (error) {
    console.error('[comercial] link-internal error:', error);
    res.status(500).json({ error: 'Erro ao vincular usuário' });
  }
});

// Convida um ator externo (representante/parceiro sem conta no CRM) por e-mail.
adminRouter.post('/actors/invite-external', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    let { name, email, phone, profile } = req.body;
    name = typeof name === 'string' ? name.trim() : name;
    email = typeof email === 'string' ? email.trim() : email;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }
    if (profile && !ACTOR_PROFILES.includes(profile)) {
      return res.status(400).json({ error: 'Perfil inválido' });
    }

    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const existing = await query(
      'SELECT id FROM com_actors WHERE organization_id = $1 AND lower(email) = lower($2)',
      [org.organization_id, email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe um ator com este email' });
    }

    const rawToken = genToken();
    const result = await query(
      `INSERT INTO com_actors
         (organization_id, name, email, phone, profile, status, invite_token_hash, invite_token_expires_at,
          invite_token_purpose, invited_by, invited_at, created_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW() + INTERVAL '${INVITE_TOKEN_TTL_HOURS} hours', 'invite', $7, NOW(), $7)
       RETURNING id, name, email, phone, profile, status, invited_at, created_at`,
      [org.organization_id, name, email, phone || null, profile || 'parceiro', hashToken(rawToken), req.userId]
    );

    const actor = result.rows[0];

    try {
      const link = `${appBaseUrl(req)}/comercial/ativar-conta?token=${rawToken}`;
      await sendSystemEmail({
        to: actor.email,
        subject: 'Você foi convidado para o Portal Comercial Enerlight',
        html: inviteEmailHtml({ name: actor.name, link }),
      });
    } catch (emailError) {
      console.error('[comercial] invite email error:', emailError);
    }

    res.status(201).json({ actor });
  } catch (error) {
    console.error('[comercial] invite-external error:', error);
    res.status(500).json({ error: 'Erro ao convidar ator' });
  }
});

adminRouter.put('/actors/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { profile, team_id, default_price_list_id, max_discount_percent,
      can_view_costs, can_view_margin, can_edit_price_manually } = req.body;

    if (profile && !ACTOR_PROFILES.includes(profile)) {
      return res.status(400).json({ error: 'Perfil inválido' });
    }

    const result = await query(
      `UPDATE com_actors
       SET profile = COALESCE($1, profile),
           team_id = $2,
           default_price_list_id = $3,
           max_discount_percent = $4,
           can_view_costs = COALESCE($5, can_view_costs),
           can_view_margin = COALESCE($6, can_view_margin),
           can_edit_price_manually = COALESCE($7, can_edit_price_manually),
           updated_at = NOW()
       WHERE id = $8 AND organization_id = $9
       RETURNING id, name, email, profile, status, team_id, default_price_list_id, max_discount_percent`,
      [profile || null, team_id || null, default_price_list_id || null, max_discount_percent ?? null,
        typeof can_view_costs === 'boolean' ? can_view_costs : null,
        typeof can_view_margin === 'boolean' ? can_view_margin : null,
        typeof can_edit_price_manually === 'boolean' ? can_edit_price_manually : null,
        req.params.id, org.organization_id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Ator não encontrado' });
    res.json({ actor: result.rows[0] });
  } catch (error) {
    console.error('[comercial] update actor error:', error);
    res.status(500).json({ error: 'Erro ao atualizar ator' });
  }
});

adminRouter.post('/actors/:id/resend-invite', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const actorResult = await query(
      'SELECT id, name, email, status, user_id FROM com_actors WHERE id = $1 AND organization_id = $2',
      [req.params.id, org.organization_id]
    );
    const actor = actorResult.rows[0];
    if (!actor) return res.status(404).json({ error: 'Ator não encontrado' });
    if (actor.user_id) return res.status(400).json({ error: 'Ator interno não usa convite por e-mail' });
    if (actor.status === 'blocked') {
      return res.status(400).json({ error: 'Desbloqueie o ator antes de reenviar o convite' });
    }

    const rawToken = genToken();
    await query(
      `UPDATE com_actors
       SET invite_token_hash = $1, invite_token_expires_at = NOW() + INTERVAL '${INVITE_TOKEN_TTL_HOURS} hours',
           invite_token_purpose = 'invite', invited_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [hashToken(rawToken), actor.id]
    );

    const link = `${appBaseUrl(req)}/comercial/ativar-conta?token=${rawToken}`;
    await sendSystemEmail({
      to: actor.email,
      subject: 'Você foi convidado para o Portal Comercial Enerlight',
      html: inviteEmailHtml({ name: actor.name, link }),
    });

    res.json({ message: 'Convite reenviado' });
  } catch (error) {
    console.error('[comercial] resend-invite error:', error);
    res.status(500).json({ error: 'Erro ao reenviar convite' });
  }
});

adminRouter.post('/actors/:id/block', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `UPDATE com_actors SET status = 'blocked', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING id, status`,
    [req.params.id, org.organization_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Ator não encontrado' });
  res.json({ actor: result.rows[0] });
});

adminRouter.post('/actors/:id/unblock', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const actorResult = await query(
    'SELECT id, user_id, activated_at FROM com_actors WHERE id = $1 AND organization_id = $2',
    [req.params.id, org.organization_id]
  );
  const actor = actorResult.rows[0];
  if (!actor) return res.status(404).json({ error: 'Ator não encontrado' });
  if (!actor.user_id && !actor.activated_at) {
    return res.status(400).json({ error: 'Este ator ainda não ativou a conta. Reenvie o convite.' });
  }

  const result = await query(
    `UPDATE com_actors SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING id, status`,
    [actor.id]
  );
  res.json({ actor: result.rows[0] });
});

// --- Equipes ---

adminRouter.get('/teams', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT t.id, t.name, t.manager_actor_id, m.name as manager_name,
            (SELECT COUNT(*) FROM com_actors a WHERE a.team_id = t.id) as members_count
     FROM com_teams t LEFT JOIN com_actors m ON m.id = t.manager_actor_id
     WHERE t.organization_id = $1 ORDER BY t.name ASC`,
    [org.organization_id]
  );
  res.json({ teams: result.rows });
});

adminRouter.post('/teams', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const { name, manager_actor_id } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `INSERT INTO com_teams (organization_id, name, manager_actor_id, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [org.organization_id, name.trim(), manager_actor_id || null, req.userId]
    );
    res.status(201).json({ team: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Já existe uma equipe com este nome' });
    console.error('[comercial] create team error:', error);
    res.status(500).json({ error: 'Erro ao criar equipe' });
  }
});

adminRouter.put('/teams/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { name, manager_actor_id } = req.body;
    const result = await query(
      `UPDATE com_teams SET name = COALESCE($1, name), manager_actor_id = $2, updated_at = NOW()
       WHERE id = $3 AND organization_id = $4 RETURNING *`,
      [name?.trim() || null, manager_actor_id || null, req.params.id, org.organization_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });
    res.json({ team: result.rows[0] });
  } catch (error) {
    console.error('[comercial] update team error:', error);
    res.status(500).json({ error: 'Erro ao atualizar equipe' });
  }
});

adminRouter.delete('/teams/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    'DELETE FROM com_teams WHERE id = $1 AND organization_id = $2 RETURNING id',
    [req.params.id, org.organization_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Equipe não encontrada' });
  res.json({ message: 'Equipe removida' });
});

router.use('/admin', adminRouter);

export default router;
