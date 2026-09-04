import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sendSystemEmail } from '../lib/systemEmail.js';

const router = Router();
const admin = Router();

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

// ---------------------------------------------------------------------------
// Helpers (deliberately local/duplicated — same style as ead.js/auth.js in
// this codebase: small helpers are copied per route file instead of shared)
// ---------------------------------------------------------------------------

function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signRepresentative(rep) {
  return jwt.sign(
    { repId: rep.id, email: rep.email, type: 'rp_representative' },
    SECRET(),
    { expiresIn: '30d' }
  );
}

async function representativeAuth(req, res, next) {
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

  if (decoded.type !== 'rp_representative') {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Re-read status on every request (no cache) so a block by the admin takes
  // effect immediately on the representative's next call, without waiting
  // for the 30-day JWT to expire. Volume of this module is low, so the extra
  // query per request is a fine trade-off for that guarantee.
  const result = await query('SELECT status FROM rp_representatives WHERE id = $1', [decoded.repId]);
  if (result.rows.length === 0 || result.rows[0].status !== 'active') {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }

  req.repId = decoded.repId;
  req.repEmail = decoded.email;
  next();
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

async function hasPerm(userId, key) {
  const u = await query('SELECT is_superadmin FROM users WHERE id = $1', [userId]);
  if (u.rows[0]?.is_superadmin) return true;
  const m = await query(
    `SELECT om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
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

async function getCallerOrganizationId(userId) {
  const result = await query(
    `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.organization_id || null;
}

const INVITE_TOKEN_TTL_HOURS = 48;
const RESET_TOKEN_TTL_HOURS = 1;
const forgotPasswordCooldown = new Map();
const FORGOT_PASSWORD_COOLDOWN_MS = 60 * 1000;

function inviteEmailHtml({ name, link }) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
    <h2 style="color:#0ea5e9">Você foi convidado como representante</h2>
    <p>Olá${name ? `, <b>${name}</b>` : ''}!</p>
    <p>Você foi cadastrado como representante. Para ativar seu acesso, defina sua senha clicando no link abaixo:</p>
    <p><a href="${link}" style="color:#0ea5e9">Ativar minha conta</a></p>
    <p style="color:#666;font-size:13px;margin-top:16px">Este link é válido por ${INVITE_TOKEN_TTL_HOURS} horas.</p>
  </div>`;
}

function resetEmailHtml({ name, link }) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
    <h2 style="color:#0ea5e9">Recuperação de senha</h2>
    <p>Olá${name ? `, <b>${name}</b>` : ''}!</p>
    <p>Recebemos uma solicitação para redefinir sua senha de representante. Clique no link abaixo para definir uma nova senha:</p>
    <p><a href="${link}" style="color:#0ea5e9">Redefinir senha</a></p>
    <p style="color:#666;font-size:13px;margin-top:16px">Este link é válido por ${RESET_TOKEN_TTL_HOURS} hora. Se você não solicitou, ignore este email.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Public routes
// ---------------------------------------------------------------------------

router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;
    email = typeof email === 'string' ? email.trim() : email;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const result = await query(
      'SELECT id, email, name, password_hash, status FROM rp_representatives WHERE lower(email) = lower(trim($1)) LIMIT 1',
      [email]
    );

    const rep = result.rows[0];
    if (!rep || !rep.password_hash) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(password, rep.password_hash);
    if (!validPassword || rep.status !== 'active') {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    await query('UPDATE rp_representatives SET last_login_at = NOW() WHERE id = $1', [rep.id]);

    res.json({
      representative: { id: rep.id, email: rep.email, name: rep.name },
      token: signRepresentative(rep),
    });
  } catch (error) {
    console.error('[representantes] login error:', error);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

router.get('/validar-token', async (req, res) => {
  try {
    const token = String(req.query.token || '');
    if (!token) return res.status(400).json({ valid: false });

    const result = await query(
      `SELECT name, invite_token_expires_at, invite_token_purpose
       FROM rp_representatives WHERE invite_token_hash = $1 LIMIT 1`,
      [hashToken(token)]
    );

    const rep = result.rows[0];
    if (!rep || !rep.invite_token_expires_at || new Date(rep.invite_token_expires_at) < new Date()) {
      return res.json({ valid: false });
    }

    res.json({ valid: true, purpose: rep.invite_token_purpose, name: rep.name });
  } catch (error) {
    console.error('[representantes] validar-token error:', error);
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
      `SELECT id, invite_token_expires_at FROM rp_representatives WHERE invite_token_hash = $1 LIMIT 1`,
      [hashToken(token)]
    );

    const rep = result.rows[0];
    if (!rep || !rep.invite_token_expires_at || new Date(rep.invite_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE rp_representatives
       SET password_hash = $1, status = 'active', activated_at = COALESCE(activated_at, NOW()),
           invite_token_hash = NULL, invite_token_expires_at = NULL, invite_token_purpose = NULL,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, rep.id]
    );

    res.json({ message: 'Senha definida com sucesso' });
  } catch (error) {
    console.error('[representantes] ativar-conta error:', error);
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
      `SELECT id, name, email, status FROM rp_representatives WHERE lower(email) = lower(trim($1)) LIMIT 1`,
      [email]
    );

    const rep = result.rows[0];
    if (!rep || rep.status === 'pending') {
      // pending accounts have no password yet — resend-invite (admin) is the right path, not reset
      return res.json(genericResponse);
    }

    const rawToken = genToken();
    await query(
      `UPDATE rp_representatives
       SET invite_token_hash = $1, invite_token_expires_at = NOW() + INTERVAL '${RESET_TOKEN_TTL_HOURS} hours',
           invite_token_purpose = 'reset', updated_at = NOW()
       WHERE id = $2`,
      [hashToken(rawToken), rep.id]
    );

    try {
      const link = `${appBaseUrl(req)}/representantes/definir-senha?token=${rawToken}`;
      await sendSystemEmail({
        to: rep.email,
        subject: 'Recuperação de senha — Portal de Representantes',
        html: resetEmailHtml({ name: rep.name, link }),
      });
    } catch (emailError) {
      console.error('[representantes] esqueci-senha email error:', emailError);
    }

    res.json(genericResponse);
  } catch (error) {
    console.error('[representantes] esqueci-senha error:', error);
    res.status(500).json({ error: 'Erro ao processar solicitação' });
  }
});

// ---------------------------------------------------------------------------
// Representative-authenticated routes
// ---------------------------------------------------------------------------

router.get('/me', representativeAuth, async (req, res) => {
  const result = await query('SELECT id, email, name, phone FROM rp_representatives WHERE id = $1', [req.repId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Representante não encontrado' });
  res.json({ representative: result.rows[0] });
});

router.get('/dashboard', representativeAuth, async (req, res) => {
  try {
    const companiesResult = await query(
      `SELECT COUNT(*) FILTER (WHERE is_active) as active_companies, COUNT(*) as total_companies
       FROM rp_companies WHERE representative_id = $1`,
      [req.repId]
    );

    const ordersResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE date_trunc('month', order_date) = date_trunc('month', CURRENT_DATE)) as orders_this_month,
         COALESCE(SUM(total_amount) FILTER (WHERE date_trunc('year', order_date) = date_trunc('year', CURRENT_DATE)), 0) as total_this_year,
         COUNT(*) as total_orders
       FROM rp_orders WHERE representative_id = $1`,
      [req.repId]
    );

    const recentOrders = await query(
      `SELECT o.id, o.order_number, o.status, o.total_amount, o.order_date, c.name as company_name
       FROM rp_orders o JOIN rp_companies c ON c.id = o.company_id
       WHERE o.representative_id = $1
       ORDER BY o.created_at DESC LIMIT 5`,
      [req.repId]
    );

    res.json({
      companies: companiesResult.rows[0],
      orders: ordersResult.rows[0],
      recent_orders: recentOrders.rows,
    });
  } catch (error) {
    console.error('[representantes] dashboard error:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

router.get('/empresas', representativeAuth, async (req, res) => {
  const result = await query(
    'SELECT * FROM rp_companies WHERE representative_id = $1 ORDER BY name ASC',
    [req.repId]
  );
  res.json({ companies: result.rows });
});

router.post('/empresas', representativeAuth, async (req, res) => {
  try {
    const { name, document, email, phone, city, state, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = await query(
      `INSERT INTO rp_companies (representative_id, name, document, email, phone, city, state, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.repId, name, document || null, email || null, phone || null, city || null, state || null, notes || null]
    );

    res.status(201).json({ company: result.rows[0] });
  } catch (error) {
    console.error('[representantes] create empresa error:', error);
    res.status(500).json({ error: 'Erro ao criar empresa' });
  }
});

router.put('/empresas/:id', representativeAuth, async (req, res) => {
  try {
    const { name, document, email, phone, city, state, notes, is_active } = req.body;

    const result = await query(
      `UPDATE rp_companies
       SET name = COALESCE($1, name), document = $2, email = $3, phone = $4, city = $5, state = $6,
           notes = $7, is_active = COALESCE($8, is_active), updated_at = NOW()
       WHERE id = $9 AND representative_id = $10
       RETURNING *`,
      [name, document || null, email || null, phone || null, city || null, state || null, notes || null,
        typeof is_active === 'boolean' ? is_active : null, req.params.id, req.repId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json({ company: result.rows[0] });
  } catch (error) {
    console.error('[representantes] update empresa error:', error);
    res.status(500).json({ error: 'Erro ao atualizar empresa' });
  }
});

router.delete('/empresas/:id', representativeAuth, async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM rp_companies WHERE id = $1 AND representative_id = $2 RETURNING id',
      [req.params.id, req.repId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Empresa não encontrada' });
    res.json({ message: 'Empresa removida' });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(409).json({ error: 'Esta empresa possui pedidos vinculados. Inative-a em vez de excluir.' });
    }
    console.error('[representantes] delete empresa error:', error);
    res.status(500).json({ error: 'Erro ao remover empresa' });
  }
});

router.get('/pedidos', representativeAuth, async (req, res) => {
  const result = await query(
    `SELECT o.*, c.name as company_name
     FROM rp_orders o JOIN rp_companies c ON c.id = o.company_id
     WHERE o.representative_id = $1
     ORDER BY o.order_date DESC, o.created_at DESC`,
    [req.repId]
  );
  res.json({ orders: result.rows });
});

router.post('/pedidos', representativeAuth, async (req, res) => {
  try {
    const { company_id, order_number, status, total_amount, order_date, notes, items } = req.body;
    if (!company_id) return res.status(400).json({ error: 'Empresa é obrigatória' });

    const companyCheck = await query(
      'SELECT id FROM rp_companies WHERE id = $1 AND representative_id = $2',
      [company_id, req.repId]
    );
    if (companyCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Empresa inválida' });
    }

    const result = await query(
      `INSERT INTO rp_orders (representative_id, company_id, order_number, status, total_amount, order_date, notes, items)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7, $8)
       RETURNING *`,
      [req.repId, company_id, order_number || null, status || 'draft', total_amount || 0,
        order_date || null, notes || null, JSON.stringify(items || [])]
    );

    res.status(201).json({ order: result.rows[0] });
  } catch (error) {
    console.error('[representantes] create pedido error:', error);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

router.put('/pedidos/:id', representativeAuth, async (req, res) => {
  try {
    const { company_id, order_number, status, total_amount, order_date, notes, items } = req.body;

    if (company_id) {
      const companyCheck = await query(
        'SELECT id FROM rp_companies WHERE id = $1 AND representative_id = $2',
        [company_id, req.repId]
      );
      if (companyCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Empresa inválida' });
      }
    }

    const result = await query(
      `UPDATE rp_orders
       SET company_id = COALESCE($1, company_id), order_number = $2, status = COALESCE($3, status),
           total_amount = COALESCE($4, total_amount), order_date = COALESCE($5, order_date),
           notes = $6, items = COALESCE($7, items), updated_at = NOW()
       WHERE id = $8 AND representative_id = $9
       RETURNING *`,
      [company_id || null, order_number || null, status || null, total_amount ?? null, order_date || null,
        notes || null, items ? JSON.stringify(items) : null, req.params.id, req.repId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json({ order: result.rows[0] });
  } catch (error) {
    console.error('[representantes] update pedido error:', error);
    res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }
});

router.delete('/pedidos/:id', representativeAuth, async (req, res) => {
  const result = await query(
    'DELETE FROM rp_orders WHERE id = $1 AND representative_id = $2 RETURNING id',
    [req.params.id, req.repId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json({ message: 'Pedido removido' });
});

// ---------------------------------------------------------------------------
// Admin routes (same CRM login as today — owner/admin/superadmin)
// ---------------------------------------------------------------------------

admin.use(authenticate);

admin.get('/representatives', gate('can_manage_representatives_portal'), async (req, res) => {
  const organizationId = await getCallerOrganizationId(req.userId);
  if (!organizationId) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT id, name, email, phone, status, invited_at, activated_at, last_login_at, created_at
     FROM rp_representatives WHERE organization_id = $1 ORDER BY created_at DESC`,
    [organizationId]
  );
  res.json({ representatives: result.rows });
});

admin.get('/representatives/:id', gate('can_manage_representatives_portal'), async (req, res) => {
  const organizationId = await getCallerOrganizationId(req.userId);
  if (!organizationId) return res.status(403).json({ error: 'Sem organização' });

  const repResult = await query(
    'SELECT * FROM rp_representatives WHERE id = $1 AND organization_id = $2',
    [req.params.id, organizationId]
  );
  const rep = repResult.rows[0];
  if (!rep) return res.status(404).json({ error: 'Representante não encontrado' });
  delete rep.password_hash;
  delete rep.invite_token_hash;

  const stats = await query(
    `SELECT
       (SELECT COUNT(*) FROM rp_companies WHERE representative_id = $1) as companies_count,
       (SELECT COUNT(*) FROM rp_orders WHERE representative_id = $1) as orders_count,
       (SELECT COALESCE(SUM(total_amount), 0) FROM rp_orders WHERE representative_id = $1) as total_sales`,
    [req.params.id]
  );

  res.json({ representative: rep, stats: stats.rows[0] });
});

admin.post('/representatives', gate('can_manage_representatives_portal'), async (req, res) => {
  try {
    let { name, email, phone } = req.body;
    name = typeof name === 'string' ? name.trim() : name;
    email = typeof email === 'string' ? email.trim() : email;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e email são obrigatórios' });
    }

    const organizationId = await getCallerOrganizationId(req.userId);
    if (!organizationId) return res.status(403).json({ error: 'Sem organização' });

    const existing = await query(
      'SELECT id FROM rp_representatives WHERE organization_id = $1 AND lower(email) = lower($2)',
      [organizationId, email]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Já existe um representante com este email' });
    }

    const rawToken = genToken();
    const result = await query(
      `INSERT INTO rp_representatives
         (organization_id, name, email, phone, status, invite_token_hash, invite_token_expires_at,
          invite_token_purpose, invited_by, invited_at, created_by)
       VALUES ($1, $2, $3, $4, 'pending', $5, NOW() + INTERVAL '${INVITE_TOKEN_TTL_HOURS} hours', 'invite', $6, NOW(), $6)
       RETURNING id, name, email, phone, status, invited_at, created_at`,
      [organizationId, name, email, phone || null, hashToken(rawToken), req.userId]
    );

    const rep = result.rows[0];

    try {
      const link = `${appBaseUrl(req)}/representantes/ativar-conta?token=${rawToken}`;
      await sendSystemEmail({
        to: rep.email,
        subject: 'Você foi convidado como representante',
        html: inviteEmailHtml({ name: rep.name, link }),
      });
    } catch (emailError) {
      console.error('[representantes] invite email error:', emailError);
    }

    res.status(201).json({ representative: rep });
  } catch (error) {
    console.error('[representantes] admin create error:', error);
    res.status(500).json({ error: 'Erro ao cadastrar representante' });
  }
});

admin.post('/representatives/:id/resend-invite', gate('can_manage_representatives_portal'), async (req, res) => {
  try {
    const organizationId = await getCallerOrganizationId(req.userId);
    if (!organizationId) return res.status(403).json({ error: 'Sem organização' });

    const repResult = await query(
      'SELECT id, name, email, status FROM rp_representatives WHERE id = $1 AND organization_id = $2',
      [req.params.id, organizationId]
    );
    const rep = repResult.rows[0];
    if (!rep) return res.status(404).json({ error: 'Representante não encontrado' });
    if (rep.status === 'blocked') {
      return res.status(400).json({ error: 'Desbloqueie o representante antes de reenviar o convite' });
    }

    const rawToken = genToken();
    await query(
      `UPDATE rp_representatives
       SET invite_token_hash = $1, invite_token_expires_at = NOW() + INTERVAL '${INVITE_TOKEN_TTL_HOURS} hours',
           invite_token_purpose = 'invite', invited_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [hashToken(rawToken), rep.id]
    );

    const link = `${appBaseUrl(req)}/representantes/ativar-conta?token=${rawToken}`;
    await sendSystemEmail({
      to: rep.email,
      subject: 'Você foi convidado como representante',
      html: inviteEmailHtml({ name: rep.name, link }),
    });

    res.json({ message: 'Convite reenviado' });
  } catch (error) {
    console.error('[representantes] resend-invite error:', error);
    res.status(500).json({ error: 'Erro ao reenviar convite' });
  }
});

admin.post('/representatives/:id/block', gate('can_manage_representatives_portal'), async (req, res) => {
  const organizationId = await getCallerOrganizationId(req.userId);
  if (!organizationId) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `UPDATE rp_representatives SET status = 'blocked', updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 RETURNING id, status`,
    [req.params.id, organizationId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Representante não encontrado' });
  res.json({ representative: result.rows[0] });
});

admin.post('/representatives/:id/unblock', gate('can_manage_representatives_portal'), async (req, res) => {
  const organizationId = await getCallerOrganizationId(req.userId);
  if (!organizationId) return res.status(403).json({ error: 'Sem organização' });

  const repResult = await query(
    'SELECT id, activated_at FROM rp_representatives WHERE id = $1 AND organization_id = $2',
    [req.params.id, organizationId]
  );
  const rep = repResult.rows[0];
  if (!rep) return res.status(404).json({ error: 'Representante não encontrado' });
  if (!rep.activated_at) {
    return res.status(400).json({ error: 'Este representante ainda não ativou a conta. Reenvie o convite.' });
  }

  const result = await query(
    `UPDATE rp_representatives SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING id, status`,
    [rep.id]
  );
  res.json({ representative: result.rows[0] });
});

router.use('/admin', admin);

export default router;
