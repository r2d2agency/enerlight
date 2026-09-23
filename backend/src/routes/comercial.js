import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, pool } from '../db.js';
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

function generateTemporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.randomBytes(14);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
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
  // Mesmo formato de `req.actor` que internalActorGate expõe, para que as
  // rotas de negócio (clientes/produtos/tabelas) sejam escritas uma única vez.
  const result = await query('SELECT * FROM com_actors WHERE id = $1', [decoded.actorId]);
  const actor = result.rows[0];
  if (!actor || actor.status !== 'active') {
    return res.status(401).json({ error: 'Acesso não autorizado' });
  }
  if (actor.must_change_password) {
    return res.status(403).json({ error: 'Altere sua senha temporária para continuar.', code: 'PASSWORD_CHANGE_REQUIRED' });
  }

  req.actor = actor;
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

// Auditoria (item 20) — nunca deixa uma falha de log quebrar a ação principal.
async function logAudit(req, { action, entityType, entityId, oldValue, newValue }) {
  try {
    const organizationId = req.actor?.organization_id || (await getUserOrg(req.userId))?.organization_id;
    if (!organizationId) return;
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;
    await query(
      `INSERT INTO com_audit_logs (organization_id, actor_id, user_id, action, entity_type, entity_id, old_value, new_value, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [organizationId, req.actor?.id || null, req.userId || null, action, entityType, entityId || null,
        oldValue !== undefined ? JSON.stringify(oldValue) : null, newValue !== undefined ? JSON.stringify(newValue) : null, ip]
    );
  } catch (error) {
    console.error('[comercial] audit log error:', error);
  }
}

// Rate limit do login externo (item 21) — em memória, por email+IP, mesmo
// padrão leve já usado no cooldown de esqueci-senha deste arquivo.
const loginAttempts = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function isLoginRateLimited(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function registerLoginFailure(key) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: Date.now() });
  } else {
    entry.count += 1;
  }
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
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

// ---------------------------------------------------------------------------
// Escopo de visibilidade por ator (item 21 — sempre resolvido a partir de
// req.actor, nunca de um id vindo do cliente) e handlers de negócio
// compartilhados entre a porta interna e a externa.
// ---------------------------------------------------------------------------

const CUSTOMER_TYPES = ['pj', 'pf'];

// admin: todos os clientes da organização; gerente com equipe: os seus + os
// da equipe; vendedor/parceiro/gerente sem equipe: só os próprios.
function customerScope(actor, paramsArr) {
  paramsArr.push(actor.organization_id);
  const orgIdx = paramsArr.length;
  if (actor.profile === 'admin') {
    return { where: `c.organization_id = $${orgIdx}`, params: paramsArr };
  }
  if (actor.profile === 'gerente' && actor.team_id) {
    paramsArr.push(actor.id);
    const selfIdx = paramsArr.length;
    paramsArr.push(actor.team_id);
    const teamIdx = paramsArr.length;
    return {
      where: `c.organization_id = $${orgIdx} AND c.owner_actor_id IN (SELECT id FROM com_actors WHERE id = $${selfIdx} OR team_id = $${teamIdx})`,
      params: paramsArr,
    };
  }
  paramsArr.push(actor.id);
  return { where: `c.organization_id = $${orgIdx} AND c.owner_actor_id = $${orgIdx + 1}`, params: paramsArr };
}

async function listCustomersHandler(req, res) {
  try {
    const params = [];
    const scope = customerScope(req.actor, params);
    const result = await query(
      `SELECT c.*, oa.name as owner_actor_name
       FROM com_customers c
       LEFT JOIN com_actors oa ON oa.id = c.owner_actor_id
       WHERE ${scope.where}
       ORDER BY c.created_at DESC`,
      scope.params
    );
    res.json({ customers: result.rows });
  } catch (error) {
    console.error('[comercial] list customers error:', error);
    res.status(500).json({ error: 'Erro ao carregar clientes' });
  }
}

async function getCustomerHandler(req, res) {
  try {
    const params = [];
    const scope = customerScope(req.actor, params);
    params.push(req.params.id);
    const result = await query(
      `SELECT c.*, oa.name as owner_actor_name
       FROM com_customers c
       LEFT JOIN com_actors oa ON oa.id = c.owner_actor_id
       WHERE ${scope.where} AND c.id = $${params.length}`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json({ customer: result.rows[0] });
  } catch (error) {
    console.error('[comercial] get customer error:', error);
    res.status(500).json({ error: 'Erro ao carregar cliente' });
  }
}

async function createCustomerHandler(req, res) {
  try {
    const b = req.body || {};
    const type = CUSTOMER_TYPES.includes(b.type) ? b.type : 'pj';
    if (!b.company_name?.trim()) {
      return res.status(400).json({ error: type === 'pf' ? 'Nome é obrigatório' : 'Razão social é obrigatória' });
    }
    const cnpj = type === 'pj' ? (b.cnpj || '').trim() || null : null;
    const cpf = type === 'pf' ? (b.cpf || '').trim() || null : null;

    if (cnpj || cpf) {
      const dupe = await query(
        `SELECT id, company_name FROM com_customers WHERE organization_id = $1 AND ${cnpj ? 'cnpj = $2' : 'cpf = $2'}`,
        [req.actor.organization_id, cnpj || cpf]
      );
      if (dupe.rows.length > 0) {
        return res.status(409).json({
          error: 'Este cliente já existe no sistema.',
          existing_customer: dupe.rows[0],
        });
      }
    }

    const result = await query(
      `INSERT INTO com_customers
         (organization_id, owner_actor_id, type, company_name, trade_name, cnpj, cpf, state_registration,
          phone, whatsapp, email, contact_name, contact_role, zip_code, address, address_number,
          address_complement, neighborhood, city, state, origin, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
       RETURNING *`,
      [req.actor.organization_id, req.actor.id, type, b.company_name.trim(), b.trade_name || null, cnpj, cpf,
        b.state_registration || null, b.phone || null, b.whatsapp || null, b.email || null, b.contact_name || null,
        b.contact_role || null, b.zip_code || null, b.address || null, b.address_number || null,
        b.address_complement || null, b.neighborhood || null, b.city || null, b.state || null,
        b.origin || null, b.notes || null, req.actor.id]
    );

    res.status(201).json({ customer: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Este cliente já existe no sistema.' });
    }
    console.error('[comercial] create customer error:', error);
    res.status(500).json({ error: 'Erro ao cadastrar cliente' });
  }
}

async function updateCustomerHandler(req, res) {
  try {
    const existing = await query(
      'SELECT id, owner_actor_id FROM com_customers WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

    const canEdit = req.actor.profile === 'admin' || existing.rows[0].owner_actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Você só pode editar seus próprios clientes' });

    const b = req.body || {};
    const fields = ['trade_name', 'state_registration', 'phone', 'whatsapp', 'email', 'contact_name',
      'contact_role', 'zip_code', 'address', 'address_number', 'address_complement', 'neighborhood',
      'city', 'state', 'origin', 'notes', 'status'];
    const sets = [];
    const params = [];
    let idx = 1;
    if (b.company_name?.trim()) { sets.push(`company_name = $${idx++}`); params.push(b.company_name.trim()); }
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(b[f] || null); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push(`updated_by = $${idx++}`); params.push(req.actor.id);
    sets.push('updated_at = NOW()');
    params.push(req.params.id);

    const result = await query(
      `UPDATE com_customers SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    res.json({ customer: result.rows[0] });
  } catch (error) {
    console.error('[comercial] update customer error:', error);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
}

async function requestCustomerTransferHandler(req, res) {
  try {
    const { target_actor_id, note } = req.body || {};
    const existing = await query(
      'SELECT id FROM com_customers WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Cliente não encontrado' });

    const result = await query(
      `INSERT INTO com_customer_transfer_requests (customer_id, requested_by_actor_id, target_actor_id, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.id, req.actor.id, target_actor_id || null, note || null]
    );
    res.status(201).json({ transfer_request: result.rows[0] });
  } catch (error) {
    console.error('[comercial] request transfer error:', error);
    res.status(500).json({ error: 'Erro ao solicitar transferência' });
  }
}

// Catálogo visível ao ator = itens das tabelas de preço às quais ele tem
// acesso (não a tabela `products`, que é só um cadastro auxiliar do admin —
// o que realmente é vendável é o que está numa tabela de preço).
async function getAccessiblePriceListIds(actor) {
  if (actor.profile === 'admin') {
    const all = await query('SELECT id FROM price_lists WHERE organization_id = $1 AND is_active = true', [actor.organization_id]);
    return all.rows.map((r) => r.id);
  }
  const access = await query(
    `SELECT apl.price_list_id FROM com_actor_price_lists apl
     JOIN price_lists pl ON pl.id = apl.price_list_id
     WHERE apl.actor_id = $1 AND pl.is_active = true`,
    [actor.id]
  );
  return access.rows.map((r) => r.price_list_id);
}

async function listCatalogHandler(req, res) {
  try {
    const listIds = await getAccessiblePriceListIds(req.actor);
    if (listIds.length === 0) return res.json({ products: [] });

    const result = await query(
      `SELECT pli.id, pli.product_code as sku, pli.product_name as name, pli.description, pli.category,
              pli.subcategory, pli.unit, pli.image_url, pli.sale_price as base_price,
              pli.price_list_id, pl.name as price_list_name
       FROM price_list_items pli
       JOIN price_lists pl ON pl.id = pli.price_list_id
       WHERE pli.price_list_id = ANY($1)
       ORDER BY pli.product_name ASC`,
      [listIds]
    );
    res.json({ products: result.rows });
  } catch (error) {
    console.error('[comercial] list catalog error:', error);
    res.status(500).json({ error: 'Erro ao carregar catálogo' });
  }
}

// Produtos disponíveis para adicionar a UM orçamento específico — vêm da
// tabela de preço que o orçamento está usando (preço já é o daquela tabela).
async function listQuoteAvailableProductsHandler(req, res) {
  try {
    const params = [];
    const scope = quoteScope(req.actor, params);
    params.push(req.params.id);
    const quoteResult = await query(
      `SELECT q.price_list_id FROM online_quotes q WHERE ${scope.where} AND q.id = $${params.length}`,
      params
    );
    if (quoteResult.rows.length === 0) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const priceListId = quoteResult.rows[0].price_list_id;
    if (!priceListId) return res.json({ products: [] });

    const result = await query(
      `SELECT id, id as price_list_item_id, product_code as sku, product_name as name, description, category, subcategory, unit, image_url, sale_price as base_price
       FROM price_list_items WHERE price_list_id = $1 ORDER BY product_name ASC`,
      [priceListId]
    );
    res.json({ products: result.rows });
  } catch (error) {
    console.error('[comercial] list quote products error:', error);
    res.status(500).json({ error: 'Erro ao carregar produtos da tabela de preço' });
  }
}

async function listMyPriceListsHandler(req, res) {
  try {
    const result = await query(
      `SELECT pl.id, pl.name, pl.description, apl.is_default
       FROM com_actor_price_lists apl
       JOIN price_lists pl ON pl.id = apl.price_list_id
       WHERE apl.actor_id = $1 AND pl.is_active = true
       ORDER BY apl.is_default DESC, pl.name ASC`,
      [req.actor.id]
    );
    res.json({ price_lists: result.rows });
  } catch (error) {
    console.error('[comercial] list my price lists error:', error);
    res.status(500).json({ error: 'Erro ao carregar tabelas de preço' });
  }
}

// ---------------------------------------------------------------------------
// Orçamentos — reaproveita/estende online_quotes/online_quote_items (schema
// já existia órfão, sem nenhuma rota usando-o). Preço e desconto são
// congelados no item no momento em que ele é adicionado (snapshot) — alterar
// a tabela de preço depois não muda orçamentos já criados (item 32).
// ---------------------------------------------------------------------------

const QUOTE_LOCKED_STATUSES = ['convertido', 'cancelado'];

function quoteScope(actor, paramsArr) {
  paramsArr.push(actor.organization_id);
  const orgIdx = paramsArr.length;
  if (actor.profile === 'admin') {
    return { where: `q.organization_id = $${orgIdx}`, params: paramsArr };
  }
  if (actor.profile === 'gerente' && actor.team_id) {
    paramsArr.push(actor.id);
    const selfIdx = paramsArr.length;
    paramsArr.push(actor.team_id);
    const teamIdx = paramsArr.length;
    return {
      where: `q.organization_id = $${orgIdx} AND q.actor_id IN (SELECT id FROM com_actors WHERE id = $${selfIdx} OR team_id = $${teamIdx})`,
      params: paramsArr,
    };
  }
  paramsArr.push(actor.id);
  return { where: `q.organization_id = $${orgIdx} AND q.actor_id = $${orgIdx + 1}`, params: paramsArr };
}

async function recalculateQuoteTotals(quoteId) {
  const items = await query(
    'SELECT quantity, unit_price, total_price, cost_price FROM online_quote_items WHERE quote_id = $1',
    [quoteId]
  );
  const subtotal = items.rows.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
  const itemsTotal = items.rows.reduce((s, i) => s + Number(i.total_price), 0);
  const totalCost = items.rows.reduce((s, i) => s + Number(i.quantity) * Number(i.cost_price || 0), 0);
  const quote = await query('SELECT freight_value FROM online_quotes WHERE id = $1', [quoteId]);
  const freight = Number(quote.rows[0]?.freight_value || 0);
  const total = itemsTotal + freight;
  const marginPercent = total > 0 ? ((total - totalCost) / total) * 100 : 0;
  await query(
    `UPDATE online_quotes
     SET subtotal_value = $1, discount_value = $2, total_value = $3, total_cost = $4, margin_percent = $5, updated_at = NOW()
     WHERE id = $6`,
    [subtotal, subtotal - itemsTotal, total, totalCost, marginPercent, quoteId]
  );
}

async function listQuotesHandler(req, res) {
  try {
    const params = [];
    const scope = quoteScope(req.actor, params);
    const result = await query(
      `SELECT q.id, q.quote_number, q.status, q.total_value, q.valid_until, q.created_at, q.customer_id,
              c.company_name as customer_name, a.name as actor_name
       FROM online_quotes q
       LEFT JOIN com_customers c ON c.id = q.customer_id
       LEFT JOIN com_actors a ON a.id = q.actor_id
       WHERE ${scope.where}
       ORDER BY q.created_at DESC`,
      scope.params
    );
    res.json({ quotes: result.rows });
  } catch (error) {
    console.error('[comercial] list quotes error:', error);
    res.status(500).json({ error: 'Erro ao carregar orçamentos' });
  }
}

async function createQuoteHandler(req, res) {
  try {
    const { customer_id, price_list_id: bodyPriceListId, opportunity_id: bodyOpportunityId } = req.body || {};
    if (!customer_id) return res.status(400).json({ error: 'Cliente é obrigatório' });

    let opportunityId = null;
    if (bodyOpportunityId) {
      const oppResult = await query(
        'SELECT id FROM com_opportunities WHERE id = $1 AND organization_id = $2',
        [bodyOpportunityId, req.actor.organization_id]
      );
      if (oppResult.rows.length === 0) return res.status(404).json({ error: 'Oportunidade não encontrada' });
      opportunityId = bodyOpportunityId;
    }

    const custResult = await query(
      'SELECT * FROM com_customers WHERE id = $1 AND organization_id = $2',
      [customer_id, req.actor.organization_id]
    );
    const customer = custResult.rows[0];
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    if (req.actor.profile !== 'admin') {
      if (req.actor.profile === 'gerente' && req.actor.team_id) {
        const ok = customer.owner_actor_id && await query(
          'SELECT 1 FROM com_actors WHERE id = $1 AND (id = $2 OR team_id = $3)',
          [customer.owner_actor_id, req.actor.id, req.actor.team_id]
        );
        if (!ok || ok.rows.length === 0) return res.status(403).json({ error: 'Cliente fora do seu escopo' });
      } else if (customer.owner_actor_id !== req.actor.id) {
        return res.status(403).json({ error: 'Cliente fora do seu escopo' });
      }
    }

    // Prioridade da tabela de preço (item 9): cliente > escolhida no orçamento (se autorizada) > padrão do vendedor
    let priceListId = customer.price_list_id;
    if (!priceListId && bodyPriceListId) {
      if (req.actor.profile !== 'admin') {
        const access = await query(
          'SELECT 1 FROM com_actor_price_lists WHERE actor_id = $1 AND price_list_id = $2',
          [req.actor.id, bodyPriceListId]
        );
        if (access.rows.length === 0) return res.status(403).json({ error: 'Tabela de preço não autorizada' });
      }
      priceListId = bodyPriceListId;
    }
    if (!priceListId) priceListId = req.actor.default_price_list_id;
    if (!priceListId) {
      return res.status(400).json({ error: 'Nenhuma tabela de preço disponível. Peça ao administrador para vincular uma tabela ao seu usuário.' });
    }

    const insert = await query(
      `INSERT INTO online_quotes
         (organization_id, actor_id, customer_id, opportunity_id, price_list_id, status, client_name, client_document, client_email, client_phone)
       VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$9) RETURNING *`,
      [req.actor.organization_id, req.actor.id, customer.id, opportunityId, priceListId, customer.company_name,
        customer.cnpj || customer.cpf, customer.email, customer.phone || customer.whatsapp]
    );
    const numbered = await query(
      `UPDATE online_quotes
       SET quote_number = 'ORC-' || to_char(created_at, 'YYYY') || '-' || LPAD(sequence_number::text, 5, '0')
       WHERE id = $1 RETURNING *`,
      [insert.rows[0].id]
    );
    await query(
      `INSERT INTO com_quote_history (quote_id, actor_id, action, to_status) VALUES ($1, $2, 'created', 'draft')`,
      [insert.rows[0].id, req.actor.id]
    );

    res.status(201).json({ quote: numbered.rows[0] });
  } catch (error) {
    console.error('[comercial] create quote error:', error);
    res.status(500).json({ error: 'Erro ao criar orçamento' });
  }
}

async function getQuoteHandler(req, res) {
  try {
    const params = [];
    const scope = quoteScope(req.actor, params);
    params.push(req.params.id);
    const result = await query(
      `SELECT q.*, c.company_name as customer_name, c.email as customer_email, a.name as actor_name,
              o.name as organization_name, o.logo_url as organization_logo_url
       FROM online_quotes q
       LEFT JOIN com_customers c ON c.id = q.customer_id
       LEFT JOIN com_actors a ON a.id = q.actor_id
       LEFT JOIN organizations o ON o.id = q.organization_id
       WHERE ${scope.where} AND q.id = $${params.length}`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const quote = result.rows[0];

    const [items, history] = await Promise.all([
      query('SELECT * FROM online_quote_items WHERE quote_id = $1 ORDER BY created_at ASC', [quote.id]),
      query(
        `SELECT h.*, a.name as actor_name FROM com_quote_history h
         LEFT JOIN com_actors a ON a.id = h.actor_id
         WHERE h.quote_id = $1 ORDER BY h.created_at ASC`,
        [quote.id]
      ),
    ]);

    res.json({ quote, items: items.rows, history: history.rows });
  } catch (error) {
    console.error('[comercial] get quote error:', error);
    res.status(500).json({ error: 'Erro ao carregar orçamento' });
  }
}

async function updateQuoteHandler(req, res) {
  try {
    const quoteResult = await query(
      'SELECT * FROM online_quotes WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const canEdit = req.actor.profile === 'admin' || quote.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Você só pode editar seus próprios orçamentos' });
    if (QUOTE_LOCKED_STATUSES.includes(quote.status)) return res.status(400).json({ error: 'Este orçamento não pode mais ser editado' });

    const b = req.body || {};
    const fields = ['payment_terms', 'delivery_time', 'shipping_type', 'valid_until', 'freight_value', 'notes', 'internal_notes'];
    if (b.shipping_type !== undefined && !['fob', 'cif'].includes(b.shipping_type)) return res.status(400).json({ error: 'Modalidade de frete inválida', code: 'INVALID_SHIPPING_TYPE' });
    if (b.freight_value !== undefined && (!Number.isFinite(Number(b.freight_value)) || Number(b.freight_value) < 0)) return res.status(400).json({ error: 'Valor de frete inválido', code: 'INVALID_FREIGHT' });
    const sets = [];
    const params = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(b[f] === '' ? null : b[f]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push('updated_at = NOW()');
    params.push(quote.id);

    await query(`UPDATE online_quotes SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    if (b.freight_value !== undefined) await recalculateQuoteTotals(quote.id);

    const updated = await query('SELECT * FROM online_quotes WHERE id = $1', [quote.id]);
    res.json({ quote: updated.rows[0] });
  } catch (error) {
    console.error('[comercial] update quote error:', error);
    res.status(500).json({ error: 'Erro ao atualizar orçamento' });
  }
}

async function addQuoteItemHandler(req, res) {
  try {
    const quoteResult = await query(
      'SELECT * FROM online_quotes WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const canEdit = req.actor.profile === 'admin' || quote.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Você só pode editar seus próprios orçamentos' });
    if (QUOTE_LOCKED_STATUSES.includes(quote.status)) return res.status(400).json({ error: 'Este orçamento não pode mais ser editado' });

    const { price_list_item_id, quantity, discount_percent } = req.body || {};
    if (!price_list_item_id || !quantity || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'Produto e quantidade são obrigatórios', code: 'INVALID_QUOTE_ITEM' });
    }
    if (!quote.price_list_id) return res.status(400).json({ error: 'Este orçamento não possui tabela de preço', code: 'QUOTE_WITHOUT_PRICE_LIST' });
    const rawDiscount = Number(discount_percent);
    if (!Number.isFinite(rawDiscount) || rawDiscount < 0) return res.status(400).json({ error: 'Desconto inválido', code: 'INVALID_DISCOUNT' });
    const discount = Math.min(rawDiscount || 0, 100);

    // O preço é sempre o da própria tabela de preço do orçamento — o item
    // escolhido precisa pertencer a ela.
    const pli = await query(
      'SELECT * FROM price_list_items WHERE id = $1 AND price_list_id = $2',
      [price_list_item_id, quote.price_list_id]
    );
    if (pli.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado nesta tabela de preço' });
    const r = pli.rows[0];
    const productId = r.product_id;
    // Bases antigas podem não ter recebido as colunas adicionadas ao snapshot.
    await query(`ALTER TABLE online_quote_items ADD COLUMN IF NOT EXISTS product_id UUID; ALTER TABLE online_quote_items ADD COLUMN IF NOT EXISTS description TEXT; ALTER TABLE online_quote_items ADD COLUMN IF NOT EXISTS image_url TEXT`);

    const name = r.product_name, code = r.product_code, description = r.description;
    const unitPrice = Number(r.sale_price), costPrice = Number(r.cost_price) || 0, imageUrl = r.image_url;

    const totalPrice = Math.round(Number(quantity) * unitPrice * (1 - discount / 100) * 100) / 100;
    const insert = await query(
      `INSERT INTO online_quote_items
         (quote_id, product_id, product_code, product_name, description, quantity, unit_price, cost_price, total_price, discount_percent, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [quote.id, productId, code, name, description, quantity, unitPrice, costPrice, totalPrice, discount, imageUrl]
    );
    await recalculateQuoteTotals(quote.id);
    const updatedQuote = await query('SELECT * FROM online_quotes WHERE id = $1', [quote.id]);

    res.status(201).json({ item: insert.rows[0], quote: updatedQuote.rows[0] });
  } catch (error) {
    console.error('[comercial] add quote item error:', error);
    res.status(500).json({ error: 'Erro ao adicionar item' });
  }
}

async function updateQuoteItemHandler(req, res) {
  try {
    const itemResult = await query(
      `SELECT qi.*, q.actor_id, q.status, q.organization_id FROM online_quote_items qi
       JOIN online_quotes q ON q.id = qi.quote_id WHERE qi.id = $1 AND qi.quote_id = $2`,
      [req.params.itemId, req.params.id]
    );
    const item = itemResult.rows[0];
    if (!item || item.organization_id !== req.actor.organization_id) return res.status(404).json({ error: 'Item não encontrado' });
    const canEdit = req.actor.profile === 'admin' || item.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Sem permissão' });
    if (QUOTE_LOCKED_STATUSES.includes(item.status)) return res.status(400).json({ error: 'Este orçamento não pode mais ser editado' });

    const quantity = req.body?.quantity !== undefined ? Number(req.body.quantity) : Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'Quantidade deve ser maior que zero', code: 'INVALID_QUANTITY' });
    const discount = req.body?.discount_percent !== undefined
      ? Number(req.body.discount_percent)
      : Number(item.discount_percent);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) return res.status(400).json({ error: 'Desconto inválido', code: 'INVALID_DISCOUNT' });
    if (req.actor.profile !== 'admin' && req.actor.max_discount_percent != null && discount > Number(req.actor.max_discount_percent)) {
      return res.status(400).json({ error: `Desconto máximo permitido: ${req.actor.max_discount_percent}%`, code: 'DISCOUNT_LIMIT_EXCEEDED' });
    }
    let unitPrice = Number(item.unit_price);
    if (req.body?.unit_price !== undefined) {
      unitPrice = Number(req.body.unit_price);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return res.status(400).json({ error: 'Preço deve ser maior que zero', code: 'INVALID_PRICE' });
      if (unitPrice < Number(item.unit_price)) return res.status(400).json({ error: 'O preço não pode ser menor que o valor atual da tabela', code: 'PRICE_BELOW_TABLE' });
    }
    const totalPrice = Math.round(quantity * unitPrice * (1 - discount / 100) * 100) / 100;

    const updated = await query(
      `UPDATE online_quote_items SET quantity = $1, unit_price = $2, discount_percent = $3, total_price = $4 WHERE id = $5 RETURNING *`,
      [quantity, unitPrice, discount, totalPrice, item.id]
    );
    await recalculateQuoteTotals(item.quote_id);
    const updatedQuote = await query('SELECT * FROM online_quotes WHERE id = $1', [item.quote_id]);

    res.json({ item: updated.rows[0], quote: updatedQuote.rows[0] });
  } catch (error) {
    console.error('[comercial] update quote item error:', error);
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
}

async function deleteQuoteItemHandler(req, res) {
  try {
    const itemResult = await query(
      `SELECT qi.id, qi.quote_id, q.actor_id, q.status, q.organization_id FROM online_quote_items qi
       JOIN online_quotes q ON q.id = qi.quote_id WHERE qi.id = $1 AND qi.quote_id = $2`,
      [req.params.itemId, req.params.id]
    );
    const item = itemResult.rows[0];
    if (!item || item.organization_id !== req.actor.organization_id) return res.status(404).json({ error: 'Item não encontrado' });
    const canEdit = req.actor.profile === 'admin' || item.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Sem permissão' });
    if (QUOTE_LOCKED_STATUSES.includes(item.status)) return res.status(400).json({ error: 'Este orçamento não pode mais ser editado' });

    await query('DELETE FROM online_quote_items WHERE id = $1', [item.id]);
    await recalculateQuoteTotals(item.quote_id);
    res.json({ message: 'Item removido' });
  } catch (error) {
    console.error('[comercial] delete quote item error:', error);
    res.status(500).json({ error: 'Erro ao remover item' });
  }
}

async function sendQuoteHandler(req, res) {
  try {
    const quoteResult = await query(
      'SELECT * FROM online_quotes WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const canEdit = req.actor.profile === 'admin' || quote.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Você só pode enviar seus próprios orçamentos' });

    const items = await query('SELECT discount_percent FROM online_quote_items WHERE quote_id = $1', [quote.id]);
    if (items.rows.length === 0) return res.status(400).json({ error: 'Adicione ao menos um item antes de enviar' });
    const maxDiscount = Math.max(...items.rows.map((i) => Number(i.discount_percent) || 0));

    const needsApproval = req.actor.profile !== 'admin'
      && req.actor.max_discount_percent != null
      && maxDiscount > Number(req.actor.max_discount_percent);

    if (needsApproval) {
      await query(`UPDATE online_quotes SET status = 'aguardando_aprovacao', updated_at = NOW() WHERE id = $1`, [quote.id]);
      await query(
        `INSERT INTO com_quote_approvals (quote_id, requested_discount_percent, max_allowed_percent) VALUES ($1, $2, $3)`,
        [quote.id, maxDiscount, req.actor.max_discount_percent]
      );
      await query(
        `INSERT INTO com_quote_history (quote_id, actor_id, action, from_status, to_status, note)
         VALUES ($1, $2, 'send_requested', $3, 'aguardando_aprovacao', $4)`,
        [quote.id, req.actor.id, quote.status, `Desconto de ${maxDiscount}% acima do limite de ${req.actor.max_discount_percent}%`]
      );
      return res.json({ message: 'Orçamento enviado para aprovação por desconto acima do permitido.', status: 'aguardando_aprovacao' });
    }

    const publicToken = quote.public_token || genToken();
    await query(`UPDATE online_quotes SET status = 'enviado', public_token = $1, updated_at = NOW() WHERE id = $2`, [publicToken, quote.id]);
    await query(
      `INSERT INTO com_quote_history (quote_id, actor_id, action, from_status, to_status) VALUES ($1, $2, 'sent', $3, 'enviado')`,
      [quote.id, req.actor.id, quote.status]
    );

    res.json({ message: 'Orçamento enviado', status: 'enviado', public_token: publicToken });
  } catch (error) {
    console.error('[comercial] send quote error:', error);
    res.status(500).json({ error: 'Erro ao enviar orçamento' });
  }
}

// Calcula a comissão prevista da venda com a primeira regra que casar, por
// prioridade: regra específica do vendedor+tabela > regra do vendedor
// (qualquer tabela) > regra da tabela (qualquer vendedor) > regra padrão da
// organização (sem vendedor nem tabela).
async function calculateSaleCommission(sale, priceListId) {
  if (!sale.actor_id) return;
  const rules = await query(
    `SELECT * FROM com_commission_rules
     WHERE organization_id = $1 AND is_active = true
       AND (actor_id = $2 OR actor_id IS NULL)
       AND (price_list_id = $3 OR price_list_id IS NULL)
     ORDER BY (actor_id IS NOT NULL) DESC, (price_list_id IS NOT NULL) DESC
     LIMIT 1`,
    [sale.organization_id, sale.actor_id, priceListId || null]
  );
  const rule = rules.rows[0];
  if (!rule) return;

  const amount = Math.round(Number(sale.total_value) * (Number(rule.percent) / 100) * 100) / 100;
  await query(
    `INSERT INTO com_commissions (organization_id, sale_id, actor_id, rule_id, base_value, percent_applied, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (sale_id) DO NOTHING`,
    [sale.organization_id, sale.id, sale.actor_id, rule.id, sale.total_value, rule.percent, amount]
  );
}

async function convertQuoteToSaleHandler(req, res) {
  try {
    const quoteResult = await query(
      'SELECT * FROM online_quotes WHERE id = $1 AND organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    const quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    const canEdit = req.actor.profile === 'admin' || quote.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Você só pode converter seus próprios orçamentos' });
    if (!['enviado', 'visualizado', 'em_negociacao'].includes(quote.status)) {
      return res.status(400).json({ error: 'Este orçamento não pode ser convertido em venda no status atual' });
    }
    const existingSale = await query('SELECT id FROM com_sales WHERE quote_id = $1', [quote.id]);
    if (existingSale.rows.length > 0) return res.status(400).json({ error: 'Este orçamento já foi convertido em venda' });

    const items = await query('SELECT * FROM online_quote_items WHERE quote_id = $1', [quote.id]);
    if (items.rows.length === 0) return res.status(400).json({ error: 'Orçamento sem itens' });

    const insertSale = await query(
      `INSERT INTO com_sales
         (organization_id, quote_id, opportunity_id, customer_id, actor_id, price_list_id, status, client_name, client_document,
          subtotal_value, discount_value, freight_value, total_value, payment_terms, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'confirmed',$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.actor.organization_id, quote.id, quote.opportunity_id, quote.customer_id, quote.actor_id, quote.price_list_id,
        quote.client_name, quote.client_document, quote.subtotal_value, quote.discount_value, quote.freight_value,
        quote.total_value, quote.payment_terms, quote.notes, req.actor.id]
    );
    const numbered = await query(
      `UPDATE com_sales SET sale_number = 'VND-' || to_char(created_at, 'YYYY') || '-' || LPAD(sequence_number::text, 5, '0')
       WHERE id = $1 RETURNING *`,
      [insertSale.rows[0].id]
    );
    const sale = numbered.rows[0];

    // Snapshot dos itens — cópia própria, nunca um JOIN vivo com o orçamento (item 15)
    for (const item of items.rows) {
      await query(
        `INSERT INTO com_sale_items (sale_id, product_id, product_code, product_name, description, quantity, unit_price, total_price, discount_percent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [sale.id, item.product_id, item.product_code, item.product_name, item.description,
          item.quantity, item.unit_price, item.total_price, item.discount_percent]
      );
    }

    await query(`UPDATE online_quotes SET status = 'convertido', updated_at = NOW() WHERE id = $1`, [quote.id]);
    await query(
      `INSERT INTO com_quote_history (quote_id, actor_id, action, from_status, to_status) VALUES ($1, $2, 'converted_to_sale', $3, 'convertido')`,
      [quote.id, req.actor.id, quote.status]
    );

    if (quote.opportunity_id) {
      const wonStage = await query(
        `SELECT id FROM com_opportunity_stages WHERE organization_id = $1 AND is_won = true ORDER BY position ASC LIMIT 1`,
        [req.actor.organization_id]
      );
      await query(
        `UPDATE com_opportunities SET status = 'won', stage_id = COALESCE($1, stage_id), updated_at = NOW() WHERE id = $2`,
        [wonStage.rows[0]?.id || null, quote.opportunity_id]
      );
      await query(
        `INSERT INTO com_opportunity_history (opportunity_id, actor_id, field, new_value, note) VALUES ($1, $2, 'status', 'won', 'Convertido em venda')`,
        [quote.opportunity_id, req.actor.id]
      );
    }

    await calculateSaleCommission(sale, sale.price_list_id);
    await logAudit(req, { action: 'sale_created', entityType: 'com_sale', entityId: sale.id, newValue: { quote_id: quote.id, total_value: sale.total_value } });

    res.status(201).json({ sale });
  } catch (error) {
    console.error('[comercial] convert quote to sale error:', error);
    res.status(500).json({ error: 'Erro ao converter em venda' });
  }
}

function salesScope(actor, paramsArr) {
  paramsArr.push(actor.organization_id);
  const orgIdx = paramsArr.length;
  if (actor.profile === 'admin') {
    return { where: `s.organization_id = $${orgIdx}`, params: paramsArr };
  }
  if (actor.profile === 'gerente' && actor.team_id) {
    paramsArr.push(actor.id);
    const selfIdx = paramsArr.length;
    paramsArr.push(actor.team_id);
    const teamIdx = paramsArr.length;
    return {
      where: `s.organization_id = $${orgIdx} AND s.actor_id IN (SELECT id FROM com_actors WHERE id = $${selfIdx} OR team_id = $${teamIdx})`,
      params: paramsArr,
    };
  }
  paramsArr.push(actor.id);
  return { where: `s.organization_id = $${orgIdx} AND s.actor_id = $${orgIdx + 1}`, params: paramsArr };
}

async function listSalesHandler(req, res) {
  try {
    const params = [];
    const scope = salesScope(req.actor, params);
    const result = await query(
      `SELECT s.id, s.sale_number, s.status, s.total_value, s.sale_date, s.created_at,
              c.company_name as customer_name, a.name as actor_name
       FROM com_sales s
       LEFT JOIN com_customers c ON c.id = s.customer_id
       LEFT JOIN com_actors a ON a.id = s.actor_id
       WHERE ${scope.where}
       ORDER BY s.created_at DESC`,
      scope.params
    );
    res.json({ sales: result.rows });
  } catch (error) {
    console.error('[comercial] list sales error:', error);
    res.status(500).json({ error: 'Erro ao carregar vendas' });
  }
}

async function getSaleHandler(req, res) {
  try {
    const params = [];
    const scope = salesScope(req.actor, params);
    params.push(req.params.id);
    const result = await query(
      `SELECT s.*, c.company_name as customer_name, a.name as actor_name
       FROM com_sales s
       LEFT JOIN com_customers c ON c.id = s.customer_id
       LEFT JOIN com_actors a ON a.id = s.actor_id
       WHERE ${scope.where} AND s.id = $${params.length}`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Venda não encontrada' });
    const items = await query('SELECT * FROM com_sale_items WHERE sale_id = $1 ORDER BY created_at ASC', [result.rows[0].id]);
    res.json({ sale: result.rows[0], items: items.rows });
  } catch (error) {
    console.error('[comercial] get sale error:', error);
    res.status(500).json({ error: 'Erro ao carregar venda' });
  }
}

// ---------------------------------------------------------------------------
// Oportunidades / Kanban comercial (item 14)
// ---------------------------------------------------------------------------

const DEFAULT_OPPORTUNITY_STAGES = [
  ['Lead', 0, false, false], ['Contato', 1, false, false], ['Levantamento', 2, false, false],
  ['Orçamento', 3, false, false], ['Negociação', 4, false, false], ['Fechamento', 5, false, false],
  ['Ganho', 6, true, false], ['Perdido', 7, false, true],
];

async function ensureDefaultStages(organizationId) {
  const existing = await query('SELECT id FROM com_opportunity_stages WHERE organization_id = $1 LIMIT 1', [organizationId]);
  if (existing.rows.length > 0) return;
  for (const [name, position, isWon, isLost] of DEFAULT_OPPORTUNITY_STAGES) {
    await query(
      `INSERT INTO com_opportunity_stages (organization_id, name, position, is_won, is_lost)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (organization_id, name) DO NOTHING`,
      [organizationId, name, position, isWon, isLost]
    );
  }
}

async function listStagesHandler(req, res) {
  try {
    await ensureDefaultStages(req.actor.organization_id);
    const result = await query(
      'SELECT * FROM com_opportunity_stages WHERE organization_id = $1 ORDER BY position ASC',
      [req.actor.organization_id]
    );
    res.json({ stages: result.rows });
  } catch (error) {
    console.error('[comercial] list stages error:', error);
    res.status(500).json({ error: 'Erro ao carregar etapas' });
  }
}

function opportunityScope(actor, paramsArr) {
  paramsArr.push(actor.organization_id);
  const orgIdx = paramsArr.length;
  if (actor.profile === 'admin') {
    return { where: `o.organization_id = $${orgIdx}`, params: paramsArr };
  }
  if (actor.profile === 'gerente' && actor.team_id) {
    paramsArr.push(actor.id);
    const selfIdx = paramsArr.length;
    paramsArr.push(actor.team_id);
    const teamIdx = paramsArr.length;
    return {
      where: `o.organization_id = $${orgIdx} AND o.actor_id IN (SELECT id FROM com_actors WHERE id = $${selfIdx} OR team_id = $${teamIdx})`,
      params: paramsArr,
    };
  }
  paramsArr.push(actor.id);
  return { where: `o.organization_id = $${orgIdx} AND o.actor_id = $${orgIdx + 1}`, params: paramsArr };
}

async function listOpportunitiesHandler(req, res) {
  try {
    await ensureDefaultStages(req.actor.organization_id);
    const params = [];
    const scope = opportunityScope(req.actor, params);
    const result = await query(
      `SELECT o.*, c.company_name as customer_name, a.name as actor_name, st.name as stage_name, st.is_won, st.is_lost
       FROM com_opportunities o
       LEFT JOIN com_customers c ON c.id = o.customer_id
       LEFT JOIN com_actors a ON a.id = o.actor_id
       LEFT JOIN com_opportunity_stages st ON st.id = o.stage_id
       WHERE ${scope.where}
       ORDER BY o.created_at DESC`,
      scope.params
    );
    res.json({ opportunities: result.rows });
  } catch (error) {
    console.error('[comercial] list opportunities error:', error);
    res.status(500).json({ error: 'Erro ao carregar oportunidades' });
  }
}

async function createOpportunityHandler(req, res) {
  try {
    const b = req.body || {};
    if (!b.title?.trim()) return res.status(400).json({ error: 'Título é obrigatório' });
    if (!b.customer_id) return res.status(400).json({ error: 'Cliente é obrigatório' });

    const custResult = await query(
      'SELECT id, owner_actor_id FROM com_customers WHERE id = $1 AND organization_id = $2',
      [b.customer_id, req.actor.organization_id]
    );
    const customer = custResult.rows[0];
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    if (req.actor.profile !== 'admin') {
      if (req.actor.profile === 'gerente' && req.actor.team_id) {
        const ok = customer.owner_actor_id && await query(
          'SELECT 1 FROM com_actors WHERE id = $1 AND (id = $2 OR team_id = $3)',
          [customer.owner_actor_id, req.actor.id, req.actor.team_id]
        );
        if (!ok || ok.rows.length === 0) return res.status(403).json({ error: 'Cliente fora do seu escopo' });
      } else if (customer.owner_actor_id !== req.actor.id) {
        return res.status(403).json({ error: 'Cliente fora do seu escopo' });
      }
    }

    await ensureDefaultStages(req.actor.organization_id);
    let stageId = b.stage_id;
    if (!stageId) {
      const firstStage = await query(
        'SELECT id FROM com_opportunity_stages WHERE organization_id = $1 ORDER BY position ASC LIMIT 1',
        [req.actor.organization_id]
      );
      stageId = firstStage.rows[0]?.id || null;
    }

    const result = await query(
      `INSERT INTO com_opportunities
         (organization_id, actor_id, customer_id, stage_id, title, estimated_value, probability_percent,
          expected_close_date, origin, notes, next_action, next_action_date, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *`,
      [req.actor.organization_id, req.actor.id, b.customer_id, stageId, b.title.trim(),
        b.estimated_value || 0, b.probability_percent || null, b.expected_close_date || null,
        b.origin || null, b.notes || null, b.next_action || null, b.next_action_date || null, req.actor.id]
    );
    res.status(201).json({ opportunity: result.rows[0] });
  } catch (error) {
    console.error('[comercial] create opportunity error:', error);
    res.status(500).json({ error: 'Erro ao criar oportunidade' });
  }
}

async function getOpportunityHandler(req, res) {
  try {
    const params = [];
    const scope = opportunityScope(req.actor, params);
    params.push(req.params.id);
    const result = await query(
      `SELECT o.*, c.company_name as customer_name, a.name as actor_name, st.name as stage_name
       FROM com_opportunities o
       LEFT JOIN com_customers c ON c.id = o.customer_id
       LEFT JOIN com_actors a ON a.id = o.actor_id
       LEFT JOIN com_opportunity_stages st ON st.id = o.stage_id
       WHERE ${scope.where} AND o.id = $${params.length}`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Oportunidade não encontrada' });

    const [history, quotes] = await Promise.all([
      query(
        `SELECT h.*, a.name as actor_name FROM com_opportunity_history h
         LEFT JOIN com_actors a ON a.id = h.actor_id
         WHERE h.opportunity_id = $1 ORDER BY h.created_at ASC`,
        [req.params.id]
      ),
      query(
        `SELECT id, quote_number, status, total_value FROM online_quotes WHERE opportunity_id = $1 ORDER BY created_at DESC`,
        [req.params.id]
      ),
    ]);

    res.json({ opportunity: result.rows[0], history: history.rows, quotes: quotes.rows });
  } catch (error) {
    console.error('[comercial] get opportunity error:', error);
    res.status(500).json({ error: 'Erro ao carregar oportunidade' });
  }
}

async function updateOpportunityHandler(req, res) {
  try {
    const oppResult = await query(
      'SELECT o.*, st.name as stage_name FROM com_opportunities o LEFT JOIN com_opportunity_stages st ON st.id = o.stage_id WHERE o.id = $1 AND o.organization_id = $2',
      [req.params.id, req.actor.organization_id]
    );
    const opp = oppResult.rows[0];
    if (!opp) return res.status(404).json({ error: 'Oportunidade não encontrada' });
    const canEdit = req.actor.profile === 'admin' || opp.actor_id === req.actor.id;
    if (!canEdit) return res.status(403).json({ error: 'Você só pode editar suas próprias oportunidades' });

    const b = req.body || {};

    if (b.stage_id && b.stage_id !== opp.stage_id) {
      const newStage = await query('SELECT * FROM com_opportunity_stages WHERE id = $1 AND organization_id = $2', [b.stage_id, req.actor.organization_id]);
      if (newStage.rows.length === 0) return res.status(400).json({ error: 'Etapa inválida' });
      const stage = newStage.rows[0];
      const newStatus = stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open';
      await query(
        `UPDATE com_opportunities SET stage_id = $1, status = $2, updated_by = $3, updated_at = NOW() WHERE id = $4`,
        [stage.id, newStatus, req.actor.id, opp.id]
      );
      await query(
        `INSERT INTO com_opportunity_history (opportunity_id, actor_id, field, old_value, new_value) VALUES ($1, $2, 'stage', $3, $4)`,
        [opp.id, req.actor.id, opp.stage_name || null, stage.name]
      );
    }

    const fields = ['title', 'estimated_value', 'probability_percent', 'expected_close_date', 'origin', 'notes', 'next_action', 'next_action_date', 'lost_reason'];
    const sets = [];
    const params = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(b[f] === '' ? null : b[f]); }
    }
    if (sets.length > 0) {
      sets.push(`updated_by = $${idx++}`); params.push(req.actor.id);
      sets.push('updated_at = NOW()');
      params.push(opp.id);
      await query(`UPDATE com_opportunities SET ${sets.join(', ')} WHERE id = $${idx}`, params);
    }

    const updated = await query('SELECT * FROM com_opportunities WHERE id = $1', [opp.id]);
    res.json({ opportunity: updated.rows[0] });
  } catch (error) {
    console.error('[comercial] update opportunity error:', error);
    res.status(500).json({ error: 'Erro ao atualizar oportunidade' });
  }
}

// ---------------------------------------------------------------------------
// Dashboard do ator (item 4) — sempre escopado pelo mesmo critério
// próprio/equipe/todos usado em clientes/orçamentos/oportunidades/vendas.
// ---------------------------------------------------------------------------

async function dashboardHandler(req, res) {
  try {
    const actor = req.actor;
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);

    const salesParams = [];
    const salesScopeRes = salesScope(actor, salesParams);
    salesParams.push(monthStart);
    const salesThisMonth = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_value), 0) as total
       FROM com_sales s WHERE ${salesScopeRes.where} AND s.status = 'confirmed' AND s.sale_date >= $${salesParams.length}`,
      salesParams
    );

    const qParams = [];
    const qScope = quoteScope(actor, qParams);
    const quotesStats = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status != 'draft') as sent_count,
         COUNT(*) FILTER (WHERE status IN ('enviado', 'visualizado', 'em_negociacao')) as awaiting_count,
         COUNT(*) FILTER (WHERE status = 'convertido') as converted_count
       FROM online_quotes q WHERE ${qScope.where}`,
      qParams
    );

    const cParams = [];
    const cScope = customerScope(actor, cParams);
    cParams.push(monthStart);
    const customersStats = await query(
      `SELECT COUNT(*) as active_count, COUNT(*) FILTER (WHERE created_at >= $${cParams.length}) as new_this_month
       FROM com_customers c WHERE ${cScope.where} AND c.status = 'active'`,
      cParams
    );

    const oParams = [];
    const oScope = opportunityScope(actor, oParams);
    const oppsOpen = await query(`SELECT COUNT(*) as count FROM com_opportunities o WHERE ${oScope.where} AND o.status = 'open'`, oParams);

    const eParams = [];
    const eScope = quoteScope(actor, eParams);
    const nearExpiry = await query(
      `SELECT q.id, q.quote_number, q.client_name, q.valid_until, q.total_value FROM online_quotes q
       WHERE ${eScope.where} AND q.status IN ('enviado', 'visualizado', 'em_negociacao')
         AND q.valid_until IS NOT NULL AND q.valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       ORDER BY q.valid_until ASC LIMIT 5`,
      eParams
    );

    await ensureDefaultStages(actor.organization_id);
    const stages = await query('SELECT id, name, position FROM com_opportunity_stages WHERE organization_id = $1 ORDER BY position ASC', [actor.organization_id]);
    const fParams = [];
    const fScope = opportunityScope(actor, fParams);
    const oppByStage = await query(
      `SELECT stage_id, COUNT(*) as count, COALESCE(SUM(estimated_value), 0) as value FROM com_opportunities o WHERE ${fScope.where} GROUP BY stage_id`,
      fParams
    );
    const funnel = stages.rows.map((s) => {
      const match = oppByStage.rows.find((r) => r.stage_id === s.id);
      return { id: s.id, name: s.name, count: Number(match?.count || 0), value: Number(match?.value || 0) };
    });

    const acParams = [];
    const acScope = customerScope(actor, acParams);
    const recentCustomers = await query(
      `SELECT id, company_name as label, 'cliente_cadastrado' as type, created_at FROM com_customers c WHERE ${acScope.where} ORDER BY created_at DESC LIMIT 5`,
      acParams
    );
    const aqParams = [];
    const aqScope = quoteScope(actor, aqParams);
    const recentQuotes = await query(
      `SELECT id, quote_number as label, 'orcamento_criado' as type, created_at FROM online_quotes q WHERE ${aqScope.where} ORDER BY created_at DESC LIMIT 5`,
      aqParams
    );
    const asParams = [];
    const asScope = salesScope(actor, asParams);
    const recentSales = await query(
      `SELECT id, sale_number as label, 'venda_registrada' as type, created_at FROM com_sales s WHERE ${asScope.where} ORDER BY created_at DESC LIMIT 5`,
      asParams
    );
    const recentActivity = [...recentCustomers.rows, ...recentQuotes.rows, ...recentSales.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    const sentCount = Number(quotesStats.rows[0].sent_count) || 0;
    const convertedCount = Number(quotesStats.rows[0].converted_count) || 0;

    res.json({
      sales_this_month: { count: Number(salesThisMonth.rows[0].count), total: Number(salesThisMonth.rows[0].total) },
      quotes: {
        sent_count: sentCount,
        awaiting_count: Number(quotesStats.rows[0].awaiting_count) || 0,
        converted_count: convertedCount,
        conversion_rate: sentCount > 0 ? Math.round((convertedCount / sentCount) * 1000) / 10 : 0,
      },
      customers: {
        active_count: Number(customersStats.rows[0].active_count) || 0,
        new_this_month: Number(customersStats.rows[0].new_this_month) || 0,
      },
      opportunities_open: Number(oppsOpen.rows[0].count) || 0,
      quotes_near_expiry: nearExpiry.rows,
      funnel,
      recent_activity: recentActivity,
    });
  } catch (error) {
    console.error('[comercial] dashboard error:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
}

async function myCommissionsHandler(req, res) {
  try {
    const result = await query(
      `SELECT c.*, s.sale_number, s.sale_date, s.client_name
       FROM com_commissions c JOIN com_sales s ON s.id = c.sale_id
       WHERE c.actor_id = $1 ORDER BY c.created_at DESC`,
      [req.actor.id]
    );
    res.json({ commissions: result.rows });
  } catch (error) {
    console.error('[comercial] my commissions error:', error);
    res.status(500).json({ error: 'Erro ao carregar comissões' });
  }
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

    const rateLimitKey = `${email.toLowerCase()}|${req.ip || ''}`;
    if (isLoginRateLimited(rateLimitKey)) {
      return res.status(429).json({ error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' });
    }

    const result = await query(
      'SELECT id, email, name, password_hash, status, must_change_password, temp_password_expires_at FROM com_actors WHERE lower(email) = lower(trim($1)) LIMIT 1',
      [email]
    );

    const actor = result.rows[0];
    if (!actor || !actor.password_hash) {
      registerLoginFailure(rateLimitKey);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const validPassword = await bcrypt.compare(password, actor.password_hash);
    if (!validPassword || actor.status !== 'active') {
      registerLoginFailure(rateLimitKey);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    if (actor.must_change_password && actor.temp_password_expires_at && new Date(actor.temp_password_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Senha temporária expirada. Solicite uma nova ao administrador.' });
    }
    clearLoginAttempts(rateLimitKey);

    await query('UPDATE com_actors SET last_login_at = NOW() WHERE id = $1', [actor.id]);

    res.json({
      actor: { id: actor.id, email: actor.email, name: actor.name },
      token: signExternalActor(actor),
      must_change_password: actor.must_change_password === true,
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

router.post('/me/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido' });
    const decoded = jwt.verify(authHeader.slice(7), SECRET());
    if (decoded.type !== 'com_actor_external') return res.status(401).json({ error: 'Token inválido' });
    const newPassword = typeof req.body.new_password === 'string' ? req.body.new_password : '';
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    const hash = await bcrypt.hash(newPassword, 10);
    const result = await query(`UPDATE com_actors SET password_hash=$1, must_change_password=false, temp_password_expires_at=NULL, password_changed_at=NOW(), updated_at=NOW() WHERE id=$2 AND status='active' RETURNING id`, [hash, decoded.actorId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Ator não encontrado' });
    res.json({ message: 'Senha atualizada com sucesso' });
  } catch (error) {
    res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
});

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

// Clientes, catálogo e tabelas de preço — mesmos handlers usados pela porta interna
router.get('/clientes', externalActorAuth, listCustomersHandler);
router.post('/clientes', externalActorAuth, createCustomerHandler);
router.get('/clientes/:id', externalActorAuth, getCustomerHandler);
router.put('/clientes/:id', externalActorAuth, updateCustomerHandler);
router.post('/clientes/:id/solicitar-transferencia', externalActorAuth, requestCustomerTransferHandler);
router.get('/catalogo', externalActorAuth, listCatalogHandler);
router.get('/tabelas-preco', externalActorAuth, listMyPriceListsHandler);

// Orçamentos
router.get('/orcamentos', externalActorAuth, listQuotesHandler);
router.post('/orcamentos', externalActorAuth, createQuoteHandler);
router.get('/orcamentos/:id', externalActorAuth, getQuoteHandler);
router.put('/orcamentos/:id', externalActorAuth, updateQuoteHandler);
router.get('/orcamentos/:id/produtos-disponiveis', externalActorAuth, listQuoteAvailableProductsHandler);
router.post('/orcamentos/:id/itens', externalActorAuth, addQuoteItemHandler);
router.put('/orcamentos/:id/itens/:itemId', externalActorAuth, updateQuoteItemHandler);
router.delete('/orcamentos/:id/itens/:itemId', externalActorAuth, deleteQuoteItemHandler);
router.post('/orcamentos/:id/enviar', externalActorAuth, sendQuoteHandler);
router.post('/orcamentos/:id/converter-venda', externalActorAuth, convertQuoteToSaleHandler);

// Oportunidades (kanban)
router.get('/oportunidades/etapas', externalActorAuth, listStagesHandler);
router.get('/oportunidades', externalActorAuth, listOpportunitiesHandler);
router.post('/oportunidades', externalActorAuth, createOpportunityHandler);
router.get('/oportunidades/:id', externalActorAuth, getOpportunityHandler);
router.put('/oportunidades/:id', externalActorAuth, updateOpportunityHandler);

// Vendas
router.get('/vendas', externalActorAuth, listSalesHandler);
router.get('/vendas/:id', externalActorAuth, getSaleHandler);

// Dashboard e comissão
router.get('/dashboard', externalActorAuth, dashboardHandler);
router.get('/comissoes/minhas', externalActorAuth, myCommissionsHandler);

// Proposta pública (link enviado ao cliente, sem autenticação — item 13)
router.get('/proposta/:token', async (req, res) => {
  try {
    const result = await query(
      `SELECT q.*, o.name as organization_name, o.logo_url as organization_logo_url
       FROM online_quotes q LEFT JOIN organizations o ON o.id = q.organization_id
       WHERE q.public_token = $1`,
      [req.params.token]
    );
    const quote = result.rows[0];
    if (!quote) return res.status(404).json({ error: 'Proposta não encontrada' });

    if (!quote.viewed_at) {
      await query('UPDATE online_quotes SET viewed_at = NOW() WHERE id = $1', [quote.id]);
      quote.viewed_at = new Date().toISOString();
    }
    if (quote.status === 'enviado') {
      await query(`UPDATE online_quotes SET status = 'visualizado', updated_at = NOW() WHERE id = $1`, [quote.id]);
      quote.status = 'visualizado';
    }

    const items = await query(
      `SELECT id, product_name, description, quantity, unit_price, total_price, discount_percent, image_url
       FROM online_quote_items WHERE quote_id = $1 ORDER BY created_at ASC`,
      [quote.id]
    );

    delete quote.internal_notes;
    delete quote.total_cost;
    delete quote.margin_percent;
    delete quote.organization_id;

    res.json({ quote, items: items.rows });
  } catch (error) {
    console.error('[comercial] public proposal error:', error);
    res.status(500).json({ error: 'Erro ao carregar proposta' });
  }
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

internalRouter.get('/clientes', listCustomersHandler);
internalRouter.post('/clientes', createCustomerHandler);
internalRouter.get('/clientes/:id', getCustomerHandler);
internalRouter.put('/clientes/:id', updateCustomerHandler);
internalRouter.post('/clientes/:id/solicitar-transferencia', requestCustomerTransferHandler);
internalRouter.get('/catalogo', listCatalogHandler);
internalRouter.get('/tabelas-preco', listMyPriceListsHandler);

internalRouter.get('/orcamentos', listQuotesHandler);
internalRouter.post('/orcamentos', createQuoteHandler);
internalRouter.get('/orcamentos/:id', getQuoteHandler);
internalRouter.put('/orcamentos/:id', updateQuoteHandler);
internalRouter.get('/orcamentos/:id/produtos-disponiveis', listQuoteAvailableProductsHandler);
internalRouter.post('/orcamentos/:id/itens', addQuoteItemHandler);
internalRouter.put('/orcamentos/:id/itens/:itemId', updateQuoteItemHandler);
internalRouter.delete('/orcamentos/:id/itens/:itemId', deleteQuoteItemHandler);
internalRouter.post('/orcamentos/:id/enviar', sendQuoteHandler);
internalRouter.post('/orcamentos/:id/converter-venda', convertQuoteToSaleHandler);

internalRouter.get('/oportunidades/etapas', listStagesHandler);
internalRouter.get('/oportunidades', listOpportunitiesHandler);
internalRouter.post('/oportunidades', createOpportunityHandler);
internalRouter.get('/oportunidades/:id', getOpportunityHandler);
internalRouter.put('/oportunidades/:id', updateOpportunityHandler);

internalRouter.get('/vendas', listSalesHandler);
internalRouter.get('/vendas/:id', getSaleHandler);

internalRouter.get('/dashboard', dashboardHandler);
internalRouter.get('/comissoes/minhas', myCommissionsHandler);

router.use('/interno', internalRouter);

// ---------------------------------------------------------------------------
// Administração do módulo (mesmo login do CRM interno, gate por permissão)
// ---------------------------------------------------------------------------

adminRouter.use(authenticate);

adminRouter.get('/settings', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const result = await query('SELECT * FROM online_quotes_config WHERE organization_id = $1', [org.organization_id]);
  const settings = result.rows[0] || { delivery_terms: [], payment_terms_options: [], default_shipping_type: 'cif' };
  res.json({ settings });
});

adminRouter.put('/settings', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const deliveryTerms = Array.isArray(req.body?.delivery_terms) ? req.body.delivery_terms.filter((v) => typeof v === 'string' && v.trim()) : [];
  const paymentTerms = Array.isArray(req.body?.payment_terms_options) ? req.body.payment_terms_options.filter((v) => typeof v === 'string' && v.trim()) : [];
  const shippingType = ['fob', 'cif'].includes(req.body?.default_shipping_type) ? req.body.default_shipping_type : 'cif';
  const result = await query(`INSERT INTO online_quotes_config (organization_id, delivery_terms, payment_terms_options, default_shipping_type)
    VALUES ($1, $2::jsonb, $3::jsonb, $4) ON CONFLICT (organization_id) DO UPDATE SET delivery_terms = EXCLUDED.delivery_terms, payment_terms_options = EXCLUDED.payment_terms_options, default_shipping_type = EXCLUDED.default_shipping_type, updated_at = NOW() RETURNING *`,
    [org.organization_id, JSON.stringify(deliveryTerms), JSON.stringify(paymentTerms), shippingType]);
  res.json({ settings: result.rows[0] });
});

adminRouter.get('/quote-templates', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const result = await query('SELECT * FROM online_quote_templates WHERE organization_id = $1 ORDER BY is_default DESC, name ASC', [org.organization_id]);
  res.json({ templates: result.rows });
});

adminRouter.post('/quote-templates', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const { name, description, cover_url, header_text, footer_text, footer_config, is_default } = req.body || {};
  if (!String(name || '').trim()) return res.status(400).json({ error: 'Nome do template é obrigatório' });
  if (is_default) await query('UPDATE online_quote_templates SET is_default = false WHERE organization_id = $1', [org.organization_id]);
  const result = await query(`INSERT INTO online_quote_templates (organization_id, name, description, cover_url, header_text, footer_text, footer_config, is_default) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`, [org.organization_id, name.trim(), description || null, cover_url || null, header_text || null, footer_text || null, JSON.stringify(footer_config || {}), !!is_default]);
  res.status(201).json({ template: result.rows[0] });
});

adminRouter.put('/quote-templates/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const current = await query('SELECT * FROM online_quote_templates WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
  if (!current.rows[0]) return res.status(404).json({ error: 'Template não encontrado' });
  const b = req.body || {};
  if (b.is_default) await query('UPDATE online_quote_templates SET is_default = false WHERE organization_id = $1', [org.organization_id]);
  const result = await query(`UPDATE online_quote_templates SET name = COALESCE($1,name), description=$2, cover_url=$3, header_text=$4, footer_text=$5, footer_config=$6::jsonb, is_default=COALESCE($7,is_default), updated_at=NOW() WHERE id=$8 AND organization_id=$9 RETURNING *`, [b.name?.trim() || null, b.description || null, b.cover_url || null, b.header_text || null, b.footer_text || null, JSON.stringify(b.footer_config || {}), b.is_default === undefined ? null : !!b.is_default, req.params.id, org.organization_id]);
  res.json({ template: result.rows[0] });
});

adminRouter.delete('/quote-templates/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const used = await query('SELECT 1 FROM online_quotes WHERE template_id = $1 LIMIT 1', [req.params.id]);
  if (used.rows[0]) return res.status(409).json({ error: 'Template usado por orçamento; edite ou desative em vez de excluir' });
  const result = await query('DELETE FROM online_quote_templates WHERE id = $1 AND organization_id = $2 RETURNING id', [req.params.id, org.organization_id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Template não encontrado' });
  res.json({ message: 'Template excluído' });
});

adminRouter.put('/price-lists/:id/templates', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });
  const ids = Array.isArray(req.body?.template_ids) ? req.body.template_ids : [];
  const valid = (await query('SELECT id FROM online_quote_templates WHERE organization_id = $1 AND id = ANY($2)', [org.organization_id, ids])).rows.map((r) => r.id);
  const defaultId = valid.includes(req.body?.default_template_id) ? req.body.default_template_id : null;
  const result = await query('UPDATE price_lists SET allowed_templates=$1::jsonb, default_template_id=$2, updated_at=NOW() WHERE id=$3 AND organization_id=$4 RETURNING *', [JSON.stringify(valid), defaultId, req.params.id, org.organization_id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Tabela não encontrada' });
  res.json({ price_list: result.rows[0] });
});

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

    await logAudit(req, { action: 'actor_linked', entityType: 'com_actor', entityId: result.rows[0].id, newValue: result.rows[0] });
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

    await logAudit(req, { action: 'actor_invited', entityType: 'com_actor', entityId: actor.id, newValue: actor });
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

adminRouter.post('/actors/:id/generate-temporary-password', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const actor = (await query('SELECT id, name, email, user_id, status FROM com_actors WHERE id=$1 AND organization_id=$2', [req.params.id, org.organization_id])).rows[0];
    if (!actor) return res.status(404).json({ error: 'Ator não encontrado' });
    if (actor.user_id) return res.status(400).json({ error: 'Usuário interno deve usar a senha temporária do CRM' });
    if (actor.status === 'blocked') return res.status(400).json({ error: 'Desbloqueie o usuário antes de gerar a senha' });
    const temporaryPassword = generateTemporaryPassword();
    const hash = await bcrypt.hash(temporaryPassword, 10);
    // Compatibilidade com instalações que ainda não executaram a migração do portal.
    await query(`ALTER TABLE com_actors ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false; ALTER TABLE com_actors ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ; ALTER TABLE com_actors ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`);
    await query(`UPDATE com_actors SET password_hash=$1, must_change_password=true, temp_password_expires_at=NOW()+INTERVAL '1 hour', password_changed_at=NOW(), status='active', invite_token_hash=NULL, invite_token_expires_at=NULL, invite_token_purpose=NULL, activated_at=COALESCE(activated_at,NOW()), updated_at=NOW() WHERE id=$2 AND organization_id=$3`, [hash, actor.id, org.organization_id]);
    await logAudit(req, { action: 'actor_temporary_password_generated', entityType: 'com_actor', entityId: actor.id });
    res.json({ actor: { id: actor.id, name: actor.name, email: actor.email }, temporary_password: temporaryPassword });
  } catch (error) {
    console.error('[comercial] generate temporary password error:', error);
    res.status(500).json({ error: 'Erro ao gerar senha temporária' });
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
  await logAudit(req, { action: 'actor_blocked', entityType: 'com_actor', entityId: result.rows[0].id });
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
  await logAudit(req, { action: 'actor_unblocked', entityType: 'com_actor', entityId: actor.id });
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

    if (manager_actor_id) {
      const mgr = await query('SELECT id FROM com_actors WHERE id = $1 AND organization_id = $2', [manager_actor_id, org.organization_id]);
      if (mgr.rows.length === 0) return res.status(400).json({ error: 'Gerente inválido' });
    }

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
    if (manager_actor_id) {
      const mgr = await query('SELECT id FROM com_actors WHERE id = $1 AND organization_id = $2', [manager_actor_id, org.organization_id]);
      if (mgr.rows.length === 0) return res.status(400).json({ error: 'Gerente inválido' });
    }
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

// --- Catálogo de produtos ---

adminRouter.get('/products', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT * FROM products WHERE organization_id = $1 ORDER BY name ASC`,
    [org.organization_id]
  );
  res.json({ products: result.rows });
});

const catalogConfig = {
  categories: { table: 'com_product_categories', parent: true },
  channels: { table: 'com_product_channels', parent: false },
  regions: { table: 'com_product_regions', parent: false },
};
for (const [resource, config] of Object.entries(catalogConfig)) {
  adminRouter.get(`/${resource}`, gate('can_manage_comercial_portal'), async (req, res) => {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(`SELECT * FROM ${config.table} WHERE organization_id = $1 ORDER BY name`, [org.organization_id]);
    res.json({ [resource]: result.rows });
  });
  adminRouter.post(`/${resource}`, gate('can_manage_comercial_portal'), async (req, res) => {
    try {
      const org = await getUserOrg(req.userId);
      if (!org) return res.status(403).json({ error: 'Sem organização' });
      const name = String(req.body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
      const parent = config.parent ? (req.body?.parent_id || null) : null;
      const columns = config.parent ? 'organization_id, name, parent_id' : 'organization_id, name';
      const values = config.parent ? '($1,$2,$3)' : '($1,$2)';
      const result = await query(`INSERT INTO ${config.table} (${columns}) VALUES ${values} RETURNING *`, config.parent ? [org.organization_id, name, parent] : [org.organization_id, name]);
      res.status(201).json({ [resource.slice(0, -1)]: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe um cadastro com este nome' });
      res.status(500).json({ error: 'Erro ao cadastrar classificação' });
    }
  });
  adminRouter.put(`/${resource}/:id`, gate('can_manage_comercial_portal'), async (req, res) => {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
    const result = await query(`UPDATE ${config.table} SET name = $1, is_active = COALESCE($2, is_active), updated_at = NOW() WHERE id = $3 AND organization_id = $4 RETURNING *`, [name, req.body?.is_active, req.params.id, org.organization_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Cadastro não encontrado' });
    res.json({ [resource.slice(0, -1)]: result.rows[0] });
  });
}

adminRouter.post('/products', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const b = req.body || {};
    if (!b.name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = await query(
      `INSERT INTO products
         (organization_id, sku, name, description, category, subcategory, unit, image_url,
          cost_price, base_price, specs, created_by, category_id, subcategory_id, channel_id, region_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [org.organization_id, b.sku || null, b.name.trim(), b.description || null, b.category || null,
        b.subcategory || null, b.unit || 'un', b.image_url || null, b.cost_price || 0, b.base_price || 0,
        JSON.stringify(b.specs || {}), req.userId, b.category_id || null, b.subcategory_id || null,
        b.channel_id || null, b.region_id || null]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um produto com este SKU' });
    console.error('[comercial] create product error:', error);
    res.status(500).json({ error: 'Erro ao cadastrar produto' });
  }
});

adminRouter.put('/products/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const b = req.body || {};
    const fields = ['sku', 'name', 'description', 'category', 'subcategory', 'category_id', 'subcategory_id', 'channel_id', 'region_id', 'unit', 'image_url',
      'cost_price', 'base_price', 'status'];
    const sets = [];
    const params = [];
    let idx = 1;
    for (const f of fields) {
      if (b[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(b[f] === '' ? null : b[f]); }
    }
    if (b.specs !== undefined) { sets.push(`specs = $${idx++}`); params.push(JSON.stringify(b.specs || {})); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push('updated_at = NOW()');
    params.push(req.params.id, org.organization_id);

    const result = await query(
      `UPDATE products SET ${sets.join(', ')} WHERE id = $${idx} AND organization_id = $${idx + 1} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ product: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe um produto com este SKU' });
    console.error('[comercial] update product error:', error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// Excluir é seguro mesmo que o produto já tenha sido usado em tabelas de
// preço ou orçamentos: as FKs (price_list_items.product_id,
// online_quote_items.product_id) são ON DELETE SET NULL — o histórico e o
// preço/nome já salvos no item continuam intactos, só perde o vínculo com
// o cadastro mestre.
adminRouter.delete('/products/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query('DELETE FROM products WHERE id = $1 AND organization_id = $2 RETURNING id', [req.params.id, org.organization_id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json({ message: 'Produto removido' });
  } catch (error) {
    console.error('[comercial] delete product error:', error);
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

// --- Tabelas de preço: cada tabela pode ter o mesmo produto com preço
// diferente (item 7) — gerido aqui, reaproveitando price_lists/price_list_items
// já existentes (online-quotes.js), agora ligados ao catálogo (products).

adminRouter.get('/price-lists', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT pl.id, pl.name, pl.description, pl.is_active,
            (SELECT COUNT(*) FROM price_list_items pli WHERE pli.price_list_id = pl.id) as items_count,
            pl.default_template_id, pl.allowed_templates
     FROM price_lists pl WHERE pl.organization_id = $1 ORDER BY pl.name ASC`,
    [org.organization_id]
  );
  res.json({ price_lists: result.rows });
});

adminRouter.post('/price-lists', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { name, description } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = await query(
      `INSERT INTO price_lists (organization_id, name, description) VALUES ($1, $2, $3) RETURNING id, name, description, is_active`,
      [org.organization_id, name.trim(), description || null]
    );
    res.status(201).json({ price_list: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma tabela com este nome' });
    console.error('[comercial] create price list error:', error);
    res.status(500).json({ error: 'Erro ao criar tabela de preço' });
  }
});

adminRouter.put('/price-lists/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const fields = [];
    const values = [];
    if (req.body?.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
      fields.push(`name = $${values.length + 1}`); values.push(String(req.body.name).trim());
    }
    if (req.body?.description !== undefined) { fields.push(`description = $${values.length + 1}`); values.push(req.body.description || null); }
    if (req.body?.is_active !== undefined) { fields.push(`is_active = $${values.length + 1}`); values.push(Boolean(req.body.is_active)); }
    if (!fields.length) return res.status(400).json({ error: 'Nada para atualizar' });
    values.push(req.params.id, org.organization_id);
    const result = await query(`UPDATE price_lists SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND organization_id = $${values.length} RETURNING id, name, description, is_active`, values);
    if (!result.rows.length) return res.status(404).json({ error: 'Tabela de preço não encontrada' });
    res.json({ price_list: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe uma tabela com este nome' });
    console.error('[comercial] update price list error:', error);
    res.status(500).json({ error: 'Erro ao atualizar tabela de preço' });
  }
});

adminRouter.get('/price-lists/:id/items', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const pl = await query('SELECT id FROM price_lists WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
  if (pl.rows.length === 0) return res.status(404).json({ error: 'Tabela de preço não encontrada' });

  const result = await query(
    `SELECT pli.id, pli.product_id, pli.product_code, pli.product_name, pli.sale_price, pli.cost_price, pli.min_price, pli.unit
     FROM price_list_items pli WHERE pli.price_list_id = $1 ORDER BY pli.product_name ASC`,
    [req.params.id]
  );
  res.json({ items: result.rows });
});

// Vincula um produto do catálogo a esta tabela com um preço próprio — o
// mesmo produto pode estar em várias tabelas com preços diferentes.
adminRouter.post('/price-lists/:id/items', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const pl = await query('SELECT id FROM price_lists WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (pl.rows.length === 0) return res.status(404).json({ error: 'Tabela de preço não encontrada' });

    const { product_id, sale_price, cost_price, min_price } = req.body || {};
    if (!product_id) return res.status(400).json({ error: 'Produto é obrigatório' });
    const product = await query('SELECT * FROM products WHERE id = $1 AND organization_id = $2', [product_id, org.organization_id]);
    if (product.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    if (!product.rows[0].sku) return res.status(400).json({ error: 'Este produto precisa de um SKU para ser adicionado a uma tabela de preço' });

    const p = product.rows[0];
    const effectiveSalePrice = sale_price === undefined || sale_price === null || sale_price === '' ? Number(p.base_price) || 0 : Number(sale_price);
    if (!Number.isFinite(effectiveSalePrice) || effectiveSalePrice < 0) return res.status(400).json({ error: 'Preço inválido' });
    const result = await query(
      `INSERT INTO price_list_items (price_list_id, product_id, product_code, product_name, description, unit, category, subcategory, image_url, sale_price, cost_price, min_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (price_list_id, product_code) DO UPDATE SET
         product_id = EXCLUDED.product_id, product_name = EXCLUDED.product_name, sale_price = EXCLUDED.sale_price,
         cost_price = EXCLUDED.cost_price, min_price = EXCLUDED.min_price, updated_at = NOW()
       RETURNING *`,
      [req.params.id, p.id, p.sku, p.name, p.description, p.unit, p.category, p.subcategory, p.image_url,
        effectiveSalePrice, cost_price ?? p.cost_price ?? 0, min_price || null]
    );
    await logAudit(req, { action: 'price_list_item_set', entityType: 'price_list_item', entityId: result.rows[0].id, newValue: { sale_price, price_list_id: req.params.id, product_id } });
    res.status(201).json({ item: result.rows[0] });
  } catch (error) {
    console.error('[comercial] add price list item error:', error);
    res.status(500).json({ error: 'Erro ao adicionar produto à tabela' });
  }
});

adminRouter.put('/price-lists/:id/items/:itemId', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const before = await query('SELECT sale_price, cost_price, min_price FROM price_list_items WHERE id = $1 AND price_list_id = $2', [req.params.itemId, req.params.id]);
    if (before.rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });

    const { sale_price, cost_price, min_price } = req.body || {};
    if (sale_price !== undefined && (!Number.isFinite(Number(sale_price)) || Number(sale_price) < 0)) return res.status(400).json({ error: 'Preço de venda inválido' });
    if (cost_price !== undefined && (!Number.isFinite(Number(cost_price)) || Number(cost_price) < 0)) return res.status(400).json({ error: 'Custo inválido' });
    const sets = [];
    const params = [];
    let idx = 1;
    if (sale_price !== undefined) { sets.push(`sale_price = $${idx++}`); params.push(sale_price); }
    if (cost_price !== undefined) { sets.push(`cost_price = $${idx++}`); params.push(cost_price); }
    if (min_price !== undefined) { sets.push(`min_price = $${idx++}`); params.push(min_price || null); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push('updated_at = NOW()');
    params.push(req.params.itemId, req.params.id);

    const result = await query(
      `UPDATE price_list_items SET ${sets.join(', ')} WHERE id = $${idx} AND price_list_id = $${idx + 1} RETURNING *`,
      params
    );
    await logAudit(req, { action: 'price_list_item_updated', entityType: 'price_list_item', entityId: req.params.itemId, oldValue: before.rows[0], newValue: { sale_price, cost_price, min_price } });
    res.json({ item: result.rows[0] });
  } catch (error) {
    console.error('[comercial] update price list item error:', error);
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});

adminRouter.delete('/price-lists/:id/items/:itemId', gate('can_manage_comercial_portal'), async (req, res) => {
  const result = await query(
    'DELETE FROM price_list_items WHERE id = $1 AND price_list_id = $2 RETURNING id',
    [req.params.itemId, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Item não encontrado' });
  res.json({ message: 'Item removido da tabela' });
});

// Importação em massa: resolve o SKU no catálogo mestre e cria o produto
// quando necessário. O preço da linha é o preço da tabela; sem preço, usa
// o preço base do produto existente ou recém-criado.
adminRouter.post('/price-lists/:id/import-items', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const pl = await query('SELECT id FROM price_lists WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (pl.rows.length === 0) return res.status(404).json({ error: 'Tabela de preço não encontrada' });

    const rows = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rows.length === 0) return res.status(400).json({ error: 'Nenhuma linha para importar' });

    const imported = [];
    const created = [];
    const notFound = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        const sku = String(row.sku || '').trim();
        const name = String(row.name || row.product_name || '').trim();
        const providedSale = row.sale_price === undefined || row.sale_price === '' ? null : Number(row.sale_price);
        if (!sku || (providedSale !== null && (!Number.isFinite(providedSale) || providedSale < 0))) {
          notFound.push({ sku, reason: 'SKU ou preço inválido' }); continue;
        }

        let product = await client.query('SELECT * FROM products WHERE organization_id = $1 AND sku = $2 FOR UPDATE', [org.organization_id, sku]);
        if (product.rows.length === 0) {
          if (!name) { notFound.push({ sku, reason: 'Nome obrigatório para novo produto' }); continue; }
          const basePrice = row.base_price === undefined || row.base_price === '' ? (providedSale || 0) : Number(row.base_price);
          const costPrice = row.cost_price === undefined || row.cost_price === '' ? 0 : Number(row.cost_price);
          if (!Number.isFinite(basePrice) || basePrice < 0 || !Number.isFinite(costPrice) || costPrice < 0) { notFound.push({ sku, reason: 'Preço base ou custo inválido' }); continue; }
          product = await client.query(
            `INSERT INTO products (organization_id, sku, name, description, category, subcategory, unit, cost_price, base_price, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [org.organization_id, sku, name, row.description || null, row.category || null, row.subcategory || null, row.unit || 'un', costPrice, basePrice, req.userId]
          );
          created.push(sku);
        }

        const p = product.rows[0];
        const salePrice = providedSale === null ? Number(p.base_price) || 0 : providedSale;
        const costPrice = row.cost_price !== undefined && row.cost_price !== '' && Number.isFinite(Number(row.cost_price)) ? Number(row.cost_price) : Number(p.cost_price) || 0;
        await client.query(
          `INSERT INTO price_list_items (price_list_id, product_id, product_code, product_name, description, unit, category, subcategory, image_url, sale_price, cost_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT (price_list_id, product_code) DO UPDATE SET
             product_id = EXCLUDED.product_id, product_name = EXCLUDED.product_name, sale_price = EXCLUDED.sale_price,
             cost_price = EXCLUDED.cost_price, updated_at = NOW()`,
          [req.params.id, p.id, p.sku, p.name, p.description, p.unit, p.category, p.subcategory, p.image_url, salePrice, costPrice]
        );
        imported.push(sku);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({ imported_count: imported.length, created_count: created.length, created, not_found: notFound });
  } catch (error) {
    console.error('[comercial] import price list items error:', error);
    res.status(500).json({ error: 'Erro ao importar planilha' });
  }
});

// --- Vínculo ator × tabela de preço (item 8) ---

adminRouter.get('/actors/:id/price-lists', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const actor = await query('SELECT id FROM com_actors WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
  if (actor.rows.length === 0) return res.status(404).json({ error: 'Ator não encontrado' });

  const [allLists, access] = await Promise.all([
    query('SELECT id, name FROM price_lists WHERE organization_id = $1 AND is_active = true ORDER BY name ASC', [org.organization_id]),
    query('SELECT price_list_id, is_default FROM com_actor_price_lists WHERE actor_id = $1', [req.params.id]),
  ]);
  const accessMap = new Map(access.rows.map((r) => [r.price_list_id, r.is_default]));
  res.json({
    price_lists: allLists.rows.map((pl) => ({ ...pl, granted: accessMap.has(pl.id), is_default: accessMap.get(pl.id) || false })),
  });
});

// Substitui o conjunto de tabelas autorizadas para o ator: { price_list_ids: string[], default_price_list_id?: string }
adminRouter.put('/actors/:id/price-lists', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const actor = await query('SELECT id FROM com_actors WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (actor.rows.length === 0) return res.status(404).json({ error: 'Ator não encontrado' });

    const requestedIds = Array.isArray(req.body?.price_list_ids) ? req.body.price_list_ids : [];
    const requestedDefaultId = req.body?.default_price_list_id || null;

    // Nunca confia nos ids vindos do cliente sem checar que pertencem à
    // mesma organização — evita conceder acesso a uma tabela de preço de
    // outra organização.
    const allowedIds = requestedIds.length > 0
      ? (await query('SELECT id FROM price_lists WHERE organization_id = $1 AND id = ANY($2)', [org.organization_id, requestedIds])).rows.map((r) => r.id)
      : [];
    const priceListIds = requestedIds.filter((id) => allowedIds.includes(id));
    const defaultId = requestedDefaultId && priceListIds.includes(requestedDefaultId) ? requestedDefaultId : null;

    await query('DELETE FROM com_actor_price_lists WHERE actor_id = $1', [req.params.id]);
    for (const plId of priceListIds) {
      await query(
        `INSERT INTO com_actor_price_lists (actor_id, price_list_id, is_default) VALUES ($1, $2, $3)
         ON CONFLICT (actor_id, price_list_id) DO UPDATE SET is_default = EXCLUDED.is_default`,
        [req.params.id, plId, plId === defaultId]
      );
    }
    if (defaultId) {
      await query('UPDATE com_actors SET default_price_list_id = $1, updated_at = NOW() WHERE id = $2', [defaultId, req.params.id]);
    }

    await logAudit(req, { action: 'actor_price_lists_updated', entityType: 'com_actor', entityId: req.params.id, newValue: { price_list_ids: priceListIds, default_price_list_id: defaultId } });
    res.json({ message: 'Tabelas de preço atualizadas' });
  } catch (error) {
    console.error('[comercial] update actor price-lists error:', error);
    res.status(500).json({ error: 'Erro ao atualizar tabelas de preço' });
  }
});

// --- Solicitações de transferência de cliente ---

adminRouter.get('/transfer-requests', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT tr.*, c.company_name as customer_name, rq.name as requested_by_name, tg.name as target_actor_name
     FROM com_customer_transfer_requests tr
     JOIN com_customers c ON c.id = tr.customer_id
     JOIN com_actors rq ON rq.id = tr.requested_by_actor_id
     LEFT JOIN com_actors tg ON tg.id = tr.target_actor_id
     WHERE c.organization_id = $1 AND tr.status = 'pending'
     ORDER BY tr.created_at DESC`,
    [org.organization_id]
  );
  res.json({ transfer_requests: result.rows });
});

adminRouter.post('/transfer-requests/:id/approve', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const trResult = await query(
      `SELECT tr.* FROM com_customer_transfer_requests tr
       JOIN com_customers c ON c.id = tr.customer_id
       WHERE tr.id = $1 AND c.organization_id = $2 AND tr.status = 'pending'`,
      [req.params.id, org.organization_id]
    );
    const tr = trResult.rows[0];
    if (!tr) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!tr.target_actor_id) return res.status(400).json({ error: 'Solicitação sem ator de destino definido' });

    const targetActor = await query('SELECT id FROM com_actors WHERE id = $1 AND organization_id = $2', [tr.target_actor_id, org.organization_id]);
    if (targetActor.rows.length === 0) return res.status(400).json({ error: 'Ator de destino inválido' });

    await query('UPDATE com_customers SET owner_actor_id = $1, updated_at = NOW() WHERE id = $2', [tr.target_actor_id, tr.customer_id]);
    await query(
      `UPDATE com_customer_transfer_requests SET status = 'approved', resolved_at = NOW(), resolved_by_user_id = $1 WHERE id = $2`,
      [req.userId, tr.id]
    );
    await logAudit(req, { action: 'customer_transferred', entityType: 'com_customer', entityId: tr.customer_id, oldValue: { owner_actor_id: tr.requested_by_actor_id }, newValue: { owner_actor_id: tr.target_actor_id } });
    res.json({ message: 'Transferência aprovada' });
  } catch (error) {
    console.error('[comercial] approve transfer error:', error);
    res.status(500).json({ error: 'Erro ao aprovar transferência' });
  }
});

adminRouter.post('/transfer-requests/:id/reject', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `UPDATE com_customer_transfer_requests tr SET status = 'rejected', resolved_at = NOW(), resolved_by_user_id = $1
     FROM com_customers c
     WHERE tr.customer_id = c.id AND tr.id = $2 AND c.organization_id = $3 AND tr.status = 'pending'
     RETURNING tr.id`,
    [req.userId, req.params.id, org.organization_id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Solicitação não encontrada' });
  res.json({ message: 'Transferência recusada' });
});

// --- Aprovação de desconto acima do limite (item 31) ---

adminRouter.get('/quote-approvals', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT qa.*, q.quote_number, q.total_value, c.company_name as customer_name, a.name as actor_name
     FROM com_quote_approvals qa
     JOIN online_quotes q ON q.id = qa.quote_id
     LEFT JOIN com_customers c ON c.id = q.customer_id
     LEFT JOIN com_actors a ON a.id = q.actor_id
     WHERE q.organization_id = $1 AND qa.status = 'pending'
     ORDER BY qa.created_at DESC`,
    [org.organization_id]
  );
  res.json({ approvals: result.rows });
});

adminRouter.post('/quote-approvals/:id/approve', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const qaResult = await query(
      `SELECT qa.* FROM com_quote_approvals qa
       JOIN online_quotes q ON q.id = qa.quote_id
       WHERE qa.id = $1 AND q.organization_id = $2 AND qa.status = 'pending'`,
      [req.params.id, org.organization_id]
    );
    const qa = qaResult.rows[0];
    if (!qa) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const publicToken = genToken();
    await query(
      `UPDATE online_quotes SET status = 'enviado', public_token = COALESCE(public_token, $1), approved_at = NOW(), updated_at = NOW() WHERE id = $2`,
      [publicToken, qa.quote_id]
    );
    await query(`UPDATE com_quote_approvals SET status = 'approved', decided_by_user_id = $1, decided_at = NOW() WHERE id = $2`, [req.userId, qa.id]);
    await query(
      `INSERT INTO com_quote_history (quote_id, action, from_status, to_status, note)
       VALUES ($1, 'approval_approved', 'aguardando_aprovacao', 'enviado', $2)`,
      [qa.quote_id, `Aprovado por desconto de ${qa.requested_discount_percent}%`]
    );
    await logAudit(req, { action: 'quote_discount_approved', entityType: 'online_quote', entityId: qa.quote_id, newValue: { requested_discount_percent: qa.requested_discount_percent, max_allowed_percent: qa.max_allowed_percent } });
    res.json({ message: 'Orçamento aprovado e enviado' });
  } catch (error) {
    console.error('[comercial] approve quote error:', error);
    res.status(500).json({ error: 'Erro ao aprovar orçamento' });
  }
});

adminRouter.post('/quote-approvals/:id/reject', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const qaResult = await query(
      `UPDATE com_quote_approvals qa SET status = 'rejected', decided_by_user_id = $1, decided_at = NOW(), note = $2
       FROM online_quotes q
       WHERE qa.quote_id = q.id AND qa.id = $3 AND q.organization_id = $4 AND qa.status = 'pending'
       RETURNING qa.quote_id`,
      [req.userId, req.body?.note || null, req.params.id, org.organization_id]
    );
    if (qaResult.rows.length === 0) return res.status(404).json({ error: 'Solicitação não encontrada' });

    await query(`UPDATE online_quotes SET status = 'em_elaboracao', rejected_at = NOW(), updated_at = NOW() WHERE id = $1`, [qaResult.rows[0].quote_id]);
    await query(
      `INSERT INTO com_quote_history (quote_id, action, from_status, to_status) VALUES ($1, 'approval_rejected', 'aguardando_aprovacao', 'em_elaboracao')`,
      [qaResult.rows[0].quote_id]
    );
    await logAudit(req, { action: 'quote_discount_rejected', entityType: 'online_quote', entityId: qaResult.rows[0].quote_id, newValue: { note: req.body?.note || null } });
    res.json({ message: 'Orçamento recusado, voltou para elaboração' });
  } catch (error) {
    console.error('[comercial] reject quote error:', error);
    res.status(500).json({ error: 'Erro ao recusar orçamento' });
  }
});

// --- Dashboard administrativo (item 25) — filtros de período/vendedor/equipe ---

adminRouter.get('/dashboard', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { date_from, date_to, actor_id, team_id } = req.query;
    const dateFrom = date_from || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
    const dateTo = date_to || new Date().toISOString().slice(0, 10);

    let actorIds = null;
    if (actor_id) {
      actorIds = [actor_id];
    } else if (team_id) {
      const teamActors = await query('SELECT id FROM com_actors WHERE team_id = $1', [team_id]);
      actorIds = teamActors.rows.map((r) => r.id);
    }

    const salesWhereParts = ["s.organization_id = $1", "s.status = 'confirmed'", 's.sale_date >= $2', 's.sale_date <= $3'];
    const salesParams = [org.organization_id, dateFrom, dateTo];
    if (actorIds) { salesParams.push(actorIds); salesWhereParts.push(`s.actor_id = ANY($${salesParams.length})`); }
    const salesWhere = salesWhereParts.join(' AND ');

    const totals = await query(`SELECT COUNT(*) as count, COALESCE(SUM(total_value), 0) as total FROM com_sales s WHERE ${salesWhere}`, salesParams);
    const salesCount = Number(totals.rows[0].count);
    const revenue = Number(totals.rows[0].total);
    const avgTicket = salesCount > 0 ? Math.round((revenue / salesCount) * 100) / 100 : 0;

    const quotesWhereParts = ['q.organization_id = $1', 'q.created_at >= $2', 'q.created_at <= $3'];
    const quotesParams = [org.organization_id, dateFrom, dateTo];
    if (actorIds) { quotesParams.push(actorIds); quotesWhereParts.push(`q.actor_id = ANY($${quotesParams.length})`); }
    const quotesEmitted = await query(
      `SELECT COUNT(*) as count, COUNT(*) FILTER (WHERE status != 'draft') as sent_count FROM online_quotes q WHERE ${quotesWhereParts.join(' AND ')}`,
      quotesParams
    );
    const sentCount = Number(quotesEmitted.rows[0].sent_count);
    const conversionRate = sentCount > 0 ? Math.round((salesCount / sentCount) * 1000) / 10 : 0;

    const activeVendors = await query(`SELECT COUNT(DISTINCT actor_id) as count FROM com_sales s WHERE ${salesWhere} AND actor_id IS NOT NULL`, salesParams);

    const custWhereParts = ['c.organization_id = $1', 'c.created_at >= $2', 'c.created_at <= $3'];
    const custParams = [org.organization_id, dateFrom, dateTo];
    if (actorIds) { custParams.push(actorIds); custWhereParts.push(`c.owner_actor_id = ANY($${custParams.length})`); }
    const newCustomers = await query(`SELECT COUNT(*) as count FROM com_customers c WHERE ${custWhereParts.join(' AND ')}`, custParams);

    const byActor = await query(
      `SELECT a.id, a.name, COUNT(s.id) as count, COALESCE(SUM(s.total_value), 0) as total
       FROM com_sales s JOIN com_actors a ON a.id = s.actor_id
       WHERE ${salesWhere} GROUP BY a.id, a.name ORDER BY total DESC`,
      salesParams
    );

    const byPriceList = await query(
      `SELECT pl.id, pl.name, COUNT(s.id) as count, COALESCE(SUM(s.total_value), 0) as total
       FROM com_sales s LEFT JOIN price_lists pl ON pl.id = s.price_list_id
       WHERE ${salesWhere} GROUP BY pl.id, pl.name ORDER BY total DESC`,
      salesParams
    );

    const byRegion = await query(
      `SELECT COALESCE(c.state, 'Não informado') as state, COUNT(s.id) as count, COALESCE(SUM(s.total_value), 0) as total
       FROM com_sales s LEFT JOIN com_customers c ON c.id = s.customer_id
       WHERE ${salesWhere} GROUP BY c.state ORDER BY total DESC`,
      salesParams
    );

    const byProduct = await query(
      `SELECT si.product_name, SUM(si.quantity) as quantity, COALESCE(SUM(si.total_price), 0) as total
       FROM com_sale_items si JOIN com_sales s ON s.id = si.sale_id
       WHERE ${salesWhere} GROUP BY si.product_name ORDER BY total DESC LIMIT 10`,
      salesParams
    );

    await ensureDefaultStages(org.organization_id);
    const stages = await query('SELECT id, name, position FROM com_opportunity_stages WHERE organization_id = $1 ORDER BY position ASC', [org.organization_id]);
    const oppWhereParts = ['o.organization_id = $1'];
    const oppParams = [org.organization_id];
    if (actorIds) { oppParams.push(actorIds); oppWhereParts.push(`o.actor_id = ANY($${oppParams.length})`); }
    const oppByStage = await query(
      `SELECT stage_id, COUNT(*) as count, COALESCE(SUM(estimated_value), 0) as value FROM com_opportunities o WHERE ${oppWhereParts.join(' AND ')} GROUP BY stage_id`,
      oppParams
    );
    const funnel = stages.rows.map((s) => {
      const m = oppByStage.rows.find((r) => r.stage_id === s.id);
      return { id: s.id, name: s.name, count: Number(m?.count || 0), value: Number(m?.value || 0) };
    });

    res.json({
      period: { date_from: dateFrom, date_to: dateTo },
      revenue, sales_count: salesCount, avg_ticket: avgTicket,
      quotes_emitted: Number(quotesEmitted.rows[0].count), conversion_rate: conversionRate,
      active_vendors: Number(activeVendors.rows[0].count),
      new_customers: Number(newCustomers.rows[0].count),
      by_actor: byActor.rows, by_price_list: byPriceList.rows, by_region: byRegion.rows, by_product: byProduct.rows,
      funnel,
    });
  } catch (error) {
    console.error('[comercial] admin dashboard error:', error);
    res.status(500).json({ error: 'Erro ao carregar dashboard' });
  }
});

// --- Comissão simplificada (item 16) — não mexe em commission.js/commission_rules (ERP) ---

adminRouter.get('/commission-rules', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT cr.*, a.name as actor_name, pl.name as price_list_name FROM com_commission_rules cr
     LEFT JOIN com_actors a ON a.id = cr.actor_id LEFT JOIN price_lists pl ON pl.id = cr.price_list_id
     WHERE cr.organization_id = $1 ORDER BY cr.created_at DESC`,
    [org.organization_id]
  );
  res.json({ rules: result.rows });
});

adminRouter.post('/commission-rules', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { actor_id, price_list_id, percent } = req.body || {};
    if (percent === undefined || percent === null || percent === '') return res.status(400).json({ error: 'Percentual é obrigatório' });

    if (actor_id) {
      const a = await query('SELECT id FROM com_actors WHERE id = $1 AND organization_id = $2', [actor_id, org.organization_id]);
      if (a.rows.length === 0) return res.status(400).json({ error: 'Vendedor inválido' });
    }
    if (price_list_id) {
      const pl = await query('SELECT id FROM price_lists WHERE id = $1 AND organization_id = $2', [price_list_id, org.organization_id]);
      if (pl.rows.length === 0) return res.status(400).json({ error: 'Tabela de preço inválida' });
    }

    const result = await query(
      `INSERT INTO com_commission_rules (organization_id, actor_id, price_list_id, percent) VALUES ($1,$2,$3,$4) RETURNING *`,
      [org.organization_id, actor_id || null, price_list_id || null, percent]
    );
    res.status(201).json({ rule: result.rows[0] });
  } catch (error) {
    console.error('[comercial] create commission rule error:', error);
    res.status(500).json({ error: 'Erro ao criar regra de comissão' });
  }
});

adminRouter.put('/commission-rules/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  try {
    const { percent, is_active } = req.body || {};
    const sets = [];
    const params = [];
    let idx = 1;
    if (percent !== undefined) { sets.push(`percent = $${idx++}`); params.push(percent); }
    if (typeof is_active === 'boolean') { sets.push(`is_active = $${idx++}`); params.push(is_active); }
    if (sets.length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push('updated_at = NOW()');
    params.push(req.params.id);

    const result = await query(`UPDATE com_commission_rules SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Regra não encontrada' });
    res.json({ rule: result.rows[0] });
  } catch (error) {
    console.error('[comercial] update commission rule error:', error);
    res.status(500).json({ error: 'Erro ao atualizar regra' });
  }
});

adminRouter.delete('/commission-rules/:id', gate('can_manage_comercial_portal'), async (req, res) => {
  const result = await query('DELETE FROM com_commission_rules WHERE id = $1 RETURNING id', [req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Regra não encontrada' });
  res.json({ message: 'Regra removida' });
});

adminRouter.get('/commissions', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT c.*, a.name as actor_name, s.sale_number, s.sale_date FROM com_commissions c
     LEFT JOIN com_actors a ON a.id = c.actor_id LEFT JOIN com_sales s ON s.id = c.sale_id
     WHERE c.organization_id = $1 ORDER BY c.created_at DESC`,
    [org.organization_id]
  );
  res.json({ commissions: result.rows });
});

adminRouter.post('/commissions/:id/status', gate('can_manage_comercial_portal'), async (req, res) => {
  const { status } = req.body || {};
  if (!['previsto', 'liberado', 'pago'].includes(status)) return res.status(400).json({ error: 'Status inválido' });

  const result = await query('UPDATE com_commissions SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [status, req.params.id]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Comissão não encontrada' });
  await logAudit(req, { action: 'commission_status_changed', entityType: 'com_commission', entityId: req.params.id, newValue: { status } });
  res.json({ commission: result.rows[0] });
});

// --- Auditoria (item 20) ---

adminRouter.get('/audit-logs', gate('can_manage_comercial_portal'), async (req, res) => {
  const org = await getUserOrg(req.userId);
  if (!org) return res.status(403).json({ error: 'Sem organização' });

  const result = await query(
    `SELECT al.*, a.name as actor_name, u.name as user_name FROM com_audit_logs al
     LEFT JOIN com_actors a ON a.id = al.actor_id LEFT JOIN users u ON u.id = al.user_id
     WHERE al.organization_id = $1 ORDER BY al.created_at DESC LIMIT 200`,
    [org.organization_id]
  );
  res.json({ logs: result.rows });
});

router.use('/admin', adminRouter);

// --- Catálogos PDF e Marketing (organization-scoped) ---
const catalogList = async (req, res) => {
  const org = await marketingOrg(req); if (!org) return res.status(403).json({ error: 'Sem organização' });
  const actorId = req.actor?.id || null;
  const admin = Boolean(req.isMarketingAdmin);
  const r = await query(`SELECT c.*, EXISTS(SELECT 1 FROM com_comercial_catalog_teams ct JOIN com_actors ta ON ta.team_id=ct.team_id WHERE ct.catalog_id=c.id AND ta.id=$2) AS team_allowed, EXISTS(SELECT 1 FROM com_comercial_catalog_actors ca WHERE ca.catalog_id=c.id AND ca.actor_id=$2) AS actor_allowed FROM com_comercial_catalogs c WHERE c.organization_id=$1 AND c.is_active=true AND ($3=true OR (c.is_published=true AND (c.is_org_wide=true OR EXISTS(SELECT 1 FROM com_comercial_catalog_teams ct JOIN com_actors ta ON ta.team_id=ct.team_id WHERE ct.catalog_id=c.id AND ta.id=$2) OR EXISTS(SELECT 1 FROM com_comercial_catalog_actors ca WHERE ca.catalog_id=c.id AND ca.actor_id=$2))) AND (c.valid_from IS NULL OR c.valid_from<=CURRENT_DATE) AND (c.valid_until IS NULL OR c.valid_until>=CURRENT_DATE)) ORDER BY c.position,c.title`, [org, actorId, admin]);
  res.json({ catalogs: r.rows });
};
const catalogCreate = async (req,res) => { const org=await marketingOrg(req); const b=req.body||{}; if(!org)return res.status(403).json({error:'Sem organização'}); if(!b.title?.trim()||!safeAssetUrl(b.file_url)||b.mime_type!=='application/pdf')return res.status(400).json({error:'Título e PDF válido são obrigatórios'}); const r=await query('INSERT INTO com_comercial_catalogs(organization_id,title,description,file_url,original_name,mime_type,file_size,is_published,is_org_wide,valid_from,valid_until,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',[org,b.title.trim(),b.description||null,b.file_url,b.original_name||null,'application/pdf',b.file_size||null,Boolean(b.is_published),b.is_org_wide!==false,b.valid_from||null,b.valid_until||null,req.userId]); res.status(201).json({catalog:r.rows[0]}); };
const catalogUpdate = async (req,res) => { const org=await marketingOrg(req); const b=req.body||{}; if(b.file_url && !safeAssetUrl(b.file_url))return res.status(400).json({error:'Referência de arquivo inválida'}); const fields=['title','description','file_url','original_name','file_size','is_active','is_published','is_org_wide','valid_from','valid_until']; const vals=[]; const sets=[]; for(const f of fields)if(b[f]!==undefined){sets.push(`${f}=$${vals.length+1}`);vals.push(b[f]);} if(!sets.length)return res.status(400).json({error:'Nenhuma alteração'}); vals.push(req.params.id,org); const r=await query(`UPDATE com_comercial_catalogs SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length-1} AND organization_id=$${vals.length} RETURNING *`,vals); if(!r.rows.length)return res.status(404).json({error:'Catálogo não encontrado'}); res.json({catalog:r.rows[0]}); };
const catalogRecipients = async (req,res) => { const org=await marketingOrg(req); const b=req.body||{}; const client=await pool.connect(); try { await client.query('BEGIN'); const own=await client.query('SELECT id FROM com_comercial_catalogs WHERE id=$1 AND organization_id=$2',[req.params.id,org]); if(!own.rows.length)return res.status(404).json({error:'Catálogo não encontrado'}); await client.query('DELETE FROM com_comercial_catalog_teams WHERE catalog_id=$1',[req.params.id]); await client.query('DELETE FROM com_comercial_catalog_actors WHERE catalog_id=$1',[req.params.id]); for(const id of b.team_ids||[])await client.query('INSERT INTO com_comercial_catalog_teams(catalog_id,team_id) SELECT $1,id FROM com_teams WHERE id=$2 AND organization_id=$3 ON CONFLICT DO NOTHING',[req.params.id,id,org]); for(const id of b.actor_ids||[])await client.query('INSERT INTO com_comercial_catalog_actors(catalog_id,actor_id) SELECT $1,id FROM com_actors WHERE id=$2 AND organization_id=$3 ON CONFLICT DO NOTHING',[req.params.id,id,org]); await client.query('UPDATE com_comercial_catalogs SET is_org_wide=$2,updated_at=NOW() WHERE id=$1',[req.params.id,Boolean(b.is_org_wide)]); await client.query('COMMIT'); res.json({success:true}); } catch(e){await client.query('ROLLBACK');res.status(500).json({error:'Erro ao salvar compartilhamento'});} finally{client.release();} };
const catalogDownload = async (req,res) => { const org=await marketingOrg(req); const r=await query('SELECT file_url,original_name FROM com_comercial_catalogs WHERE id=$1 AND organization_id=$2 AND is_active=true AND is_published=true AND (valid_from IS NULL OR valid_from<=CURRENT_DATE) AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)',[req.params.id,org]); if(!r.rows.length)return res.status(404).json({error:'Catálogo não encontrado'}); const url=safeAssetUrl(r.rows[0].file_url); await query('UPDATE com_comercial_catalogs SET download_count=download_count+1 WHERE id=$1',[req.params.id]); res.json({url,filename:r.rows[0].original_name||'catalogo.pdf'}); };
const marketingCategories = async (req,res) => { const org=await marketingOrg(req); if(!org)return res.status(403).json({error:'Sem organização'}); const r=await query('SELECT * FROM com_marketing_categories WHERE organization_id=$1 ORDER BY position,name',[org]); res.json({categories:r.rows}); };
const marketingMaterials = async (req,res) => { const org=await marketingOrg(req); if(!org)return res.status(403).json({error:'Sem organização'}); const r=await query(`SELECT m.*, ('/api/comercial/marketing/materiais/' || m.id || '/download') AS download_url, row_to_json(c) AS category FROM com_marketing_materials m LEFT JOIN com_marketing_categories c ON c.id=m.category_id WHERE m.organization_id=$1 AND m.is_active=true AND (m.is_published=true OR $2=true) ORDER BY m.position,m.title`,[org,Boolean(req.isMarketingAdmin)]); res.json({materials:r.rows}); };
const categoryCreate = async(req,res)=>{const org=await marketingOrg(req); if(!org)return res.status(403).json({error:'Sem organização'}); if(!req.body?.name?.trim())return res.status(400).json({error:'Nome é obrigatório'}); const r=await query('INSERT INTO com_marketing_categories(organization_id,name,description) VALUES($1,$2,$3) RETURNING *',[org,req.body.name.trim(),req.body.description||null]);res.status(201).json({category:r.rows[0]});};
const categoryUpdate = async(req,res)=>{const org=await marketingOrg(req);const b=req.body||{};const r=await query('UPDATE com_marketing_categories SET name=COALESCE($1,name),description=COALESCE($2,description),is_active=COALESCE($3,is_active) WHERE id=$4 AND organization_id=$5 RETURNING *',[b.name,b.description,b.is_active,req.params.id,org]);if(!r.rows.length)return res.status(404).json({error:'Categoria não encontrada'});res.json({category:r.rows[0]});};
const materialCreate = async(req,res)=>{const org=await marketingOrg(req);const b=req.body||{};if(!org)return res.status(403).json({error:'Sem organização'});if(!b.title?.trim()||!safeAssetUrl(b.file_url))return res.status(400).json({error:'Título e arquivo válido são obrigatórios'});const r=await query('INSERT INTO com_marketing_materials(organization_id,category_id,title,description,file_url,thumbnail_url,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[org,b.category_id||null,b.title.trim(),b.description||null,b.file_url,b.thumbnail_url||null,req.userId]);res.status(201).json({material:r.rows[0]});};
const materialUpdate = async(req,res)=>{const org=await marketingOrg(req);const b=req.body||{};if(b.file_url && !safeAssetUrl(b.file_url))return res.status(400).json({error:'Referência de arquivo inválida'});const r=await query('UPDATE com_marketing_materials SET title=COALESCE($1,title),description=COALESCE($2,description),category_id=COALESCE($3,category_id),file_url=COALESCE($4,file_url),is_active=COALESCE($5,is_active),is_published=COALESCE($6,is_published),updated_at=NOW() WHERE id=$7 AND organization_id=$8 RETURNING *',[b.title,b.description,b.category_id,b.file_url,b.is_active,b.is_published,req.params.id,org]);if(!r.rows.length)return res.status(404).json({error:'Material não encontrado'});res.json({material:r.rows[0]});};
// Retorna JSON {url, filename} em vez de redirect: o frontend autenticado abre
// a URL em nova aba. Apenas referências locais /uploads/ ou http(s) validadas.
const downloadMarketing = async (req,res) => { const org=await marketingOrg(req); if(!org)return res.status(403).json({error:'Sem organização'}); const r=await query('SELECT file_url FROM com_marketing_materials WHERE id=$1 AND organization_id=$2 AND is_active=true AND is_published=true',[req.params.id,org]); if(!r.rows.length)return res.status(404).json({error:'Material não encontrado'}); const url=safeAssetUrl(r.rows[0].file_url); if(!url)return res.status(400).json({error:'Arquivo inválido'}); await query('UPDATE com_marketing_materials SET download_count=download_count+1 WHERE id=$1',[req.params.id]); const filename=String(decodeURIComponent(url.split('/').pop()||'')).replace(/[\r\n"\\]/g,'')||'material'; res.json({url, filename}); };
const orderMarketing = async(req,res)=>{const org=await marketingOrg(req);const table=req.params.kind==='categories'?'com_marketing_categories':'com_marketing_materials';const r=await query(`SELECT id,position FROM ${table} WHERE id=$1 AND organization_id=$2`,[req.params.id,org]);if(!r.rows.length)return res.status(404).json({error:'Item não encontrado'});const d=req.body.direction==='up'?-1:1;await query(`UPDATE ${table} SET position=position+$1 WHERE id=$2 AND organization_id=$3`,[d,req.params.id,org]);res.json({success:true});};
const marketingOrg = async (req) => {
  if (req.actor?.organization_id) return req.actor.organization_id;
  const r = await query('SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1', [req.userId]);
  return r.rows[0]?.organization_id || null;
};
const safeAssetUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const u = new URL(value, 'http://localhost');
    if (u.origin === 'http://localhost') {
      if (!u.pathname.startsWith('/uploads/')) return null;
      const name = u.pathname.slice('/uploads/'.length);
      if (!/^[a-zA-Z0-9._-]+$/.test(name) || name.includes('..')) return null;
    } else if (!['http:', 'https:'].includes(u.protocol)) return null;
    return value;
  } catch { return null; }
};
const marketingList = async (req, res) => {
  const org = await marketingOrg(req); if (!org) return res.status(403).json({ error: 'Sem organização' });
  const r = await query('SELECT * FROM com_marketing_campaigns WHERE organization_id = $1 ORDER BY updated_at DESC', [org]);
  res.json({ campaigns: r.rows });
};
const marketingCreate = async (req, res) => {
  const org = await marketingOrg(req); if (!org) return res.status(403).json({ error: 'Sem organização' });
  const b = req.body || {}; if (!b.name?.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const asset = b.asset_url == null ? null : safeAssetUrl(b.asset_url); if (b.asset_url && !asset) return res.status(400).json({ error: 'Referência de arquivo inválida' });
  const token = crypto.randomBytes(32).toString('hex');
  const r = await query(`INSERT INTO com_marketing_campaigns (organization_id,name,description,status,channel,subject,content,asset_id,public_token,starts_at,ends_at,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`, [org,b.name.trim(),b.description||null,b.status||'draft',b.channel||'email',b.subject||null,b.content||null,b.asset_id||null,token,b.starts_at||null,b.ends_at||null,req.userId]);
  res.status(201).json({ campaign: r.rows[0] });
};
const marketingUpdate = async (req, res) => {
  const org = await marketingOrg(req); if (!org) return res.status(403).json({ error: 'Sem organização' });
  const b=req.body||{}; const fields=['name','description','status','channel','subject','content','starts_at','ends_at']; const vals=[];
  const sets=[]; for (const f of fields) if (b[f] !== undefined) { sets.push(`${f} = $${vals.length+1}`); vals.push(b[f]); } if (!sets.length) return res.status(400).json({error:'Nenhuma alteração'});
  vals.push(req.userId, org, req.params.id); const r=await query(`UPDATE com_marketing_campaigns SET ${sets.join(', ')}, updated_by=$${vals.length-2}, updated_at=NOW() WHERE organization_id=$${vals.length-1} AND id=$${vals.length} RETURNING *`,vals); if(!r.rows.length)return res.status(404).json({error:'Campanha não encontrada'}); res.json({campaign:r.rows[0]});
};
adminRouter.get('/catalogos', gate('can_manage_comercial_portal'), (req,res)=>{req.isMarketingAdmin=true;return catalogList(req,res)}); adminRouter.post('/catalogos', gate('can_manage_comercial_portal'), catalogCreate); adminRouter.put('/catalogos/:id', gate('can_manage_comercial_portal'), catalogUpdate); adminRouter.put('/catalogos/:id/destinatarios', gate('can_manage_comercial_portal'), catalogRecipients); adminRouter.delete('/catalogos/:id', gate('can_manage_comercial_portal'), async(req,res)=>{const org=await marketingOrg(req);await query('DELETE FROM com_comercial_catalogs WHERE id=$1 AND organization_id=$2',[req.params.id,org]);res.json({success:true});});
internalRouter.get('/catalogos', catalogList); internalRouter.get('/catalogos/:id/download', catalogDownload); router.get('/catalogos', externalActorAuth, catalogList); router.get('/catalogos/:id/download', externalActorAuth, catalogDownload);
adminRouter.get('/marketing/categories', gate('can_manage_comercial_portal'), marketingCategories); adminRouter.post('/marketing/categories', gate('can_manage_comercial_portal'), categoryCreate); adminRouter.put('/marketing/categories/:id', gate('can_manage_comercial_portal'), categoryUpdate); adminRouter.delete('/marketing/categories/:id', gate('can_manage_comercial_portal'), async(req,res)=>{const org=await marketingOrg(req);await query('DELETE FROM com_marketing_categories WHERE id=$1 AND organization_id=$2',[req.params.id,org]);res.json({success:true});}); adminRouter.get('/marketing/materials', gate('can_manage_comercial_portal'), (req,res)=>{req.isMarketingAdmin=true;return marketingMaterials(req,res)}); adminRouter.post('/marketing/materials', gate('can_manage_comercial_portal'), materialCreate); adminRouter.put('/marketing/materials/:id', gate('can_manage_comercial_portal'), materialUpdate); adminRouter.post('/marketing/:kind/:id/order', gate('can_manage_comercial_portal'), orderMarketing);
internalRouter.get('/marketing/materiais', marketingMaterials); internalRouter.get('/marketing/materiais/:id/download', downloadMarketing); router.get('/marketing/materiais', externalActorAuth, marketingMaterials); router.get('/marketing/materiais/:id/download', externalActorAuth, downloadMarketing);
adminRouter.get('/marketing/campaigns', gate('can_manage_comercial_portal'), marketingList); adminRouter.post('/marketing/campaigns', gate('can_manage_comercial_portal'), marketingCreate); adminRouter.put('/marketing/campaigns/:id', gate('can_manage_comercial_portal'), marketingUpdate);
internalRouter.get('/marketing/campaigns', marketingList); internalRouter.post('/marketing/campaigns', marketingCreate); internalRouter.put('/marketing/campaigns/:id', marketingUpdate);
router.get('/marketing/public/:token', async (req,res)=>{ const r=await query('SELECT id,name,description,status,channel,subject,content,asset_id,starts_at,ends_at FROM com_marketing_campaigns WHERE public_token=$1 AND status=\'published\'', [req.params.token]); if(!r.rows.length)return res.status(404).json({error:'Campanha não encontrada'}); await query('INSERT INTO com_marketing_events (campaign_id,event_type,visitor_key,metadata) VALUES ($1,$2,$3,$4)',[r.rows[0].id,'view',req.ip,JSON.stringify({})]); res.json({campaign:r.rows[0]}); });

export default router;
