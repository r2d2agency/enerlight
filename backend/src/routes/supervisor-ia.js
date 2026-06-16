import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

function isMissingSchemaError(error) {
  return ['42P01', '42703'].includes(error?.code);
}

router.use(async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.email, om.organization_id, om.role
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [req.userId]
    );
    if (!rows[0]) return res.status(403).json({ error: 'Usuário sem organização' });
    req.user = rows[0];
    next();
  } catch (e) {
    logError('supervisor_ia.user_context', e);
    res.status(500).json({ error: 'Erro ao carregar organização do usuário' });
  }
});

// Garante schema (idempotente — útil em deploys parciais)
async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS supervisor_ia_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      funnel_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      homologation_board_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      licitacao_board_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      group_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      representative_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      rule_require_company BOOLEAN DEFAULT true,
      rule_require_value BOOLEAN DEFAULT true,
      rule_require_owner BOOLEAN DEFAULT true,
      rule_require_contact BOOLEAN DEFAULT true,
      rule_require_followup BOOLEAN DEFAULT true,
      rule_require_history BOOLEAN DEFAULT true,
      stale_hours INTEGER DEFAULT 72,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      UNIQUE(organization_id, user_id)
    )
  `);
  await query(`ALTER TABLE supervisor_ia_configs ADD COLUMN IF NOT EXISTS representative_ids JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await query(`CREATE INDEX IF NOT EXISTS idx_supervisor_ia_configs_org ON supervisor_ia_configs(organization_id)`);
}

// ---- Helpers ----
function safeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
  }
  return [];
}

async function loadConfig(orgId, userId) {
  await ensureSchema();
  const { rows } = await query(
    `SELECT * FROM supervisor_ia_configs WHERE organization_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  if (!rows[0]) {
    return {
      funnel_ids: [], homologation_board_ids: [], licitacao_board_ids: [],
      group_ids: [], user_ids: [], representative_ids: [],
      rule_require_company: true, rule_require_value: true, rule_require_owner: true,
      rule_require_contact: true, rule_require_followup: true, rule_require_history: true,
      stale_hours: 72,
    };
  }
  const r = rows[0];
  return {
    ...r,
    funnel_ids: safeArray(r.funnel_ids),
    homologation_board_ids: safeArray(r.homologation_board_ids),
    licitacao_board_ids: safeArray(r.licitacao_board_ids),
    group_ids: safeArray(r.group_ids),
    user_ids: safeArray(r.user_ids),
    representative_ids: safeArray(r.representative_ids),
  };
}

// ---- Listagens de apoio para o dialog de configuração ----
router.get('/scope-options', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const [funnels, groups, users, representatives, homBoards, licBoards] = await Promise.all([
      query(`SELECT id, name, color FROM crm_funnels WHERE organization_id = $1 AND is_active = true ORDER BY name`, [orgId]).catch((e) => { logError('supervisor_ia.scope.funnels', e); return { rows: [] }; }),
      query(`SELECT id, name FROM crm_user_groups WHERE organization_id = $1 ORDER BY name`, [orgId]).catch((e) => { logError('supervisor_ia.scope.groups', e); return { rows: [] }; }),
      query(`
        SELECT u.id, u.name, u.email
        FROM users u
        JOIN organization_members om ON om.user_id = u.id
        WHERE om.organization_id = $1
        ORDER BY u.name
      `, [orgId]).catch((e) => { logError('supervisor_ia.scope.users', e); return { rows: [] }; }),
      query(`SELECT id, name FROM crm_representatives WHERE organization_id = $1 AND COALESCE(is_active, true) = true ORDER BY name`, [orgId]).catch((e) => { logError('supervisor_ia.scope.representatives', e); return { rows: [] }; }),
      query(`SELECT id, name FROM homologation_boards WHERE organization_id = $1 AND COALESCE(is_active, true) = true ORDER BY name`, [orgId]).catch((e) => { logError('supervisor_ia.scope.homologation_boards', e); return { rows: [] }; }),
      query(`SELECT id, name FROM licitacao_boards WHERE organization_id = $1 AND COALESCE(is_active, true) = true ORDER BY name`, [orgId]).catch((e) => { logError('supervisor_ia.scope.licitacao_boards', e); return { rows: [] }; }),
    ]);

    res.json({
      funnels: funnels.rows,
      groups: groups.rows,
      users: users.rows,
      representatives: representatives.rows,
      homologation_boards: homBoards.rows,
      licitacao_boards: licBoards.rows,
    });
  } catch (e) {
    logError('supervisor_ia.scope_options', e);
    res.status(500).json({ error: e.message });
  }
});

// ---- Config CRUD ----
router.get('/config', async (req, res) => {
  try {
    const cfg = await loadConfig(req.user.organization_id, req.user.id);
    res.json(cfg);
  } catch (e) {
    logError('supervisor_ia.config_get', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    await ensureSchema();
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const b = req.body || {};
    const params = [
      orgId, userId,
      JSON.stringify(safeArray(b.funnel_ids)),
      JSON.stringify(safeArray(b.homologation_board_ids)),
      JSON.stringify(safeArray(b.licitacao_board_ids)),
      JSON.stringify(safeArray(b.group_ids)),
      JSON.stringify(safeArray(b.user_ids)),
      JSON.stringify(safeArray(b.representative_ids)),
      b.rule_require_company !== false,
      b.rule_require_value !== false,
      b.rule_require_owner !== false,
      b.rule_require_contact !== false,
      b.rule_require_followup !== false,
      b.rule_require_history !== false,
      Number.isFinite(Number(b.stale_hours)) ? Number(b.stale_hours) : 72,
    ];
    await query(`
      INSERT INTO supervisor_ia_configs
        (organization_id, user_id, funnel_ids, homologation_board_ids, licitacao_board_ids,
         group_ids, user_ids, representative_ids, rule_require_company, rule_require_value, rule_require_owner,
         rule_require_contact, rule_require_followup, rule_require_history, stale_hours)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (organization_id, user_id) DO UPDATE SET
        funnel_ids = EXCLUDED.funnel_ids,
        homologation_board_ids = EXCLUDED.homologation_board_ids,
        licitacao_board_ids = EXCLUDED.licitacao_board_ids,
        group_ids = EXCLUDED.group_ids,
        user_ids = EXCLUDED.user_ids,
        representative_ids = EXCLUDED.representative_ids,
        rule_require_company = EXCLUDED.rule_require_company,
        rule_require_value = EXCLUDED.rule_require_value,
        rule_require_owner = EXCLUDED.rule_require_owner,
        rule_require_contact = EXCLUDED.rule_require_contact,
        rule_require_followup = EXCLUDED.rule_require_followup,
        rule_require_history = EXCLUDED.rule_require_history,
        stale_hours = EXCLUDED.stale_hours,
        updated_at = NOW()
    `, params);
    const cfg = await loadConfig(orgId, userId);
    res.json(cfg);
  } catch (e) {
    logError('supervisor_ia.config_put', e);
    res.status(500).json({ error: e.message });
  }
});

// ---- Análise principal ----
router.get('/analysis', async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const userId = req.user.id;
    const cfg = await loadConfig(orgId, userId);

    const endDate = req.query.end_date || new Date().toISOString().slice(0, 10);
    const startDate = req.query.start_date || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // União dos usuários a checar: explícitos + membros dos grupos selecionados
    let scopedUserIds = new Set(cfg.user_ids);
    if (cfg.group_ids.length > 0) {
      const { rows: gm } = await query(
        `SELECT DISTINCT user_id FROM crm_user_group_members WHERE group_id = ANY($1::uuid[])`,
        [cfg.group_ids]
      );
      gm.forEach(r => scopedUserIds.add(r.user_id));
    }
    const userIdArr = Array.from(scopedUserIds);
    const hasUserFilter = userIdArr.length > 0;

    const hasFunnels = cfg.funnel_ids.length > 0;
    const hasHomBoards = cfg.homologation_board_ids.length > 0;
    const hasLicBoards = cfg.licitacao_board_ids.length > 0;

    // ----- Negociações criadas por vendedor (no período, restrito aos funis selecionados) -----
    const dealsByOwner = hasFunnels ? await query(`
      SELECT
        COALESCE(d.owner_id::text, 'unassigned') AS owner_id,
        COALESCE(u.name, 'Sem responsável') AS owner_name,
        COUNT(*)::int AS deals_created,
        COALESCE(SUM(d.value), 0)::float AS total_value
      FROM crm_deals d
      LEFT JOIN users u ON u.id = d.owner_id
      WHERE d.organization_id = $1
        AND d.funnel_id = ANY($2::uuid[])
        AND d.created_at >= $3::date
        AND d.created_at < ($4::date + INTERVAL '1 day')
        ${hasUserFilter ? 'AND (d.owner_id = ANY($5::uuid[]) OR d.created_by = ANY($5::uuid[]))' : ''}
      GROUP BY d.owner_id, u.name
      ORDER BY deals_created DESC
    `, hasUserFilter
      ? [orgId, cfg.funnel_ids, startDate, endDate, userIdArr]
      : [orgId, cfg.funnel_ids, startDate, endDate]
    ).then(r => r.rows) : [];

    // ----- Empresas novas no período -----
    const newCompanies = await query(`
      SELECT
        COALESCE(c.created_by::text, 'unknown') AS created_by,
        COALESCE(u.name, 'Desconhecido') AS created_by_name,
        COUNT(*)::int AS companies_created
      FROM crm_companies c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.organization_id = $1
        AND c.created_at >= $2::date
        AND c.created_at < ($3::date + INTERVAL '1 day')
        ${hasUserFilter ? 'AND c.created_by = ANY($4::uuid[])' : ''}
      GROUP BY c.created_by, u.name
      ORDER BY companies_created DESC
    `, hasUserFilter ? [orgId, startDate, endDate, userIdArr] : [orgId, startDate, endDate])
      .then(r => r.rows);

    const newCompaniesTotal = newCompanies.reduce((s, r) => s + r.companies_created, 0);

    // ----- Diagnóstico por funil (cards incompletos / sem follow-up / sem histórico / parados) -----
    const staleHours = cfg.stale_hours || 72;
    const funnelDiagnostics = [];
    if (hasFunnels) {
      const { rows } = await query(`
        WITH base AS (
          SELECT
            d.id, d.title, d.value, d.owner_id, d.company_id, d.funnel_id, d.stage_id,
            d.last_activity_at, d.created_at, d.status,
            f.name AS funnel_name, f.color AS funnel_color,
            s.name AS stage_name,
            u.name AS owner_name,
            c.name AS company_name,
            (SELECT COUNT(*)::int FROM crm_deal_contacts dc WHERE dc.deal_id = d.id) AS contact_count,
            (SELECT COUNT(*)::int FROM crm_tasks t WHERE t.deal_id = d.id AND t.status = 'pending' AND t.due_date IS NOT NULL) AS open_tasks,
            (SELECT COUNT(*)::int FROM crm_deal_history h WHERE h.deal_id = d.id) AS history_count,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(d.last_activity_at, d.created_at))) / 3600.0 AS hours_idle
          FROM crm_deals d
          JOIN crm_funnels f ON f.id = d.funnel_id
          LEFT JOIN crm_stages s ON s.id = d.stage_id
          LEFT JOIN users u ON u.id = d.owner_id
          LEFT JOIN crm_companies c ON c.id = d.company_id
          WHERE d.organization_id = $1
            AND d.funnel_id = ANY($2::uuid[])
            AND d.status = 'open'
            ${hasUserFilter ? 'AND d.owner_id = ANY($3::uuid[])' : ''}
        )
        SELECT *,
          (CASE WHEN ${cfg.rule_require_company ? 'company_id IS NULL' : 'false'} THEN 1 ELSE 0 END) AS miss_company,
          (CASE WHEN ${cfg.rule_require_value ? '(value IS NULL OR value = 0)' : 'false'} THEN 1 ELSE 0 END) AS miss_value,
          (CASE WHEN ${cfg.rule_require_owner ? 'owner_id IS NULL' : 'false'} THEN 1 ELSE 0 END) AS miss_owner,
          (CASE WHEN ${cfg.rule_require_contact ? 'contact_count = 0' : 'false'} THEN 1 ELSE 0 END) AS miss_contact,
          (CASE WHEN ${cfg.rule_require_followup ? 'open_tasks = 0' : 'false'} THEN 1 ELSE 0 END) AS miss_followup,
          (CASE WHEN ${cfg.rule_require_history ? 'history_count = 0' : 'false'} THEN 1 ELSE 0 END) AS miss_history,
          (CASE WHEN hours_idle >= ${staleHours} THEN 1 ELSE 0 END) AS is_stale
        FROM base
      `, hasUserFilter ? [orgId, cfg.funnel_ids, userIdArr] : [orgId, cfg.funnel_ids]);

      // agrupar por funil
      const byFunnel = new Map();
      for (const r of rows) {
        if (!byFunnel.has(r.funnel_id)) {
          byFunnel.set(r.funnel_id, {
            kind: 'crm_funnel',
            id: r.funnel_id,
            name: r.funnel_name,
            color: r.funnel_color,
            total: 0,
            incomplete: 0,
            without_followup: 0,
            without_history: 0,
            stale: 0,
            problem_cards: [],
          });
        }
        const f = byFunnel.get(r.funnel_id);
        f.total += 1;
        const missAny = r.miss_company || r.miss_value || r.miss_owner || r.miss_contact;
        if (missAny) f.incomplete += 1;
        if (r.miss_followup) f.without_followup += 1;
        if (r.miss_history) f.without_history += 1;
        if (r.is_stale) f.stale += 1;

        if (missAny || r.miss_followup || r.miss_history || r.is_stale) {
          f.problem_cards.push({
            id: r.id,
            title: r.title,
            stage_name: r.stage_name,
            owner_name: r.owner_name,
            company_name: r.company_name,
            value: Number(r.value || 0),
            hours_idle: Math.round(Number(r.hours_idle || 0)),
            issues: [
              r.miss_company && 'Sem empresa',
              r.miss_value && 'Sem valor',
              r.miss_owner && 'Sem responsável',
              r.miss_contact && 'Sem contato',
              r.miss_followup && 'Sem follow-up',
              r.miss_history && 'Sem histórico',
              r.is_stale && `Parado há ${Math.round(Number(r.hours_idle || 0))}h`,
            ].filter(Boolean),
          });
        }
      }
      // ordenar problem_cards por severidade (mais issues primeiro)
      for (const f of byFunnel.values()) {
        f.problem_cards.sort((a, b) => b.issues.length - a.issues.length || b.hours_idle - a.hours_idle);
        f.problem_cards = f.problem_cards.slice(0, 50);
        funnelDiagnostics.push(f);
      }
    }

    // ----- Diagnóstico Homologação -----
    const homologationDiagnostics = [];
    if (hasHomBoards) {
      try {
        const { rows } = await query(`
          SELECT
            b.id AS board_id, b.name AS board_name,
            hc.id, hc.name, hc.cnpj, hc.contact_phone, hc.contact_email,
            hc.assigned_to, hc.created_at, hc.updated_at,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(hc.updated_at, hc.created_at))) / 3600.0 AS hours_idle,
            s.name AS stage_name,
            u.name AS assigned_name
          FROM homologation_companies hc
          JOIN homologation_boards b ON b.id = hc.board_id
          LEFT JOIN homologation_stages s ON s.id = hc.stage_id
          LEFT JOIN users u ON u.id = hc.assigned_to
          WHERE hc.board_id = ANY($1::uuid[])
            AND hc.completed_at IS NULL
            ${hasUserFilter ? 'AND hc.assigned_to = ANY($2::uuid[])' : ''}
        `, hasUserFilter ? [cfg.homologation_board_ids, userIdArr] : [cfg.homologation_board_ids]);

        const byBoard = new Map();
        for (const r of rows) {
          if (!byBoard.has(r.board_id)) {
            byBoard.set(r.board_id, {
              kind: 'homologation_board',
              id: r.board_id, name: r.board_name,
              total: 0, incomplete: 0, without_followup: 0, without_history: 0, stale: 0,
              problem_cards: [],
            });
          }
          const f = byBoard.get(r.board_id);
          f.total += 1;
          const issues = [];
          if (!r.cnpj) issues.push('Sem CNPJ');
          if (!r.contact_phone && !r.contact_email) issues.push('Sem contato');
          if (!r.assigned_to) issues.push('Sem responsável');
          if (r.hours_idle >= staleHours) issues.push(`Parado há ${Math.round(r.hours_idle)}h`);
          if (issues.length) {
            if (issues.some(i => i.startsWith('Sem'))) f.incomplete += 1;
            if (r.hours_idle >= staleHours) f.stale += 1;
            f.problem_cards.push({
              id: r.id, title: r.name, stage_name: r.stage_name,
              owner_name: r.assigned_name, company_name: r.name,
              value: 0, hours_idle: Math.round(r.hours_idle), issues,
            });
          }
        }
        for (const f of byBoard.values()) {
          f.problem_cards.sort((a, b) => b.issues.length - a.issues.length || b.hours_idle - a.hours_idle);
          f.problem_cards = f.problem_cards.slice(0, 50);
          homologationDiagnostics.push(f);
        }
      } catch (e) {
        logError('supervisor_ia.homologation_query', e);
      }
    }

    // ----- Diagnóstico Licitação -----
    const licitacaoDiagnostics = [];
    if (hasLicBoards) {
      try {
        const { rows } = await query(`
          SELECT
            b.id AS board_id, b.name AS board_name,
            l.id, l.title, l.estimated_value, l.entity_name, l.entity_cnpj,
            l.assigned_to, l.created_at, l.updated_at,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(l.updated_at, l.created_at))) / 3600.0 AS hours_idle,
            s.name AS stage_name,
            u.name AS assigned_name
          FROM licitacoes l
          JOIN licitacao_boards b ON b.id = l.board_id
          LEFT JOIN licitacao_stages s ON s.id = l.stage_id
          LEFT JOIN users u ON u.id = l.assigned_to
          WHERE l.board_id = ANY($1::uuid[])
            ${hasUserFilter ? 'AND l.assigned_to = ANY($2::uuid[])' : ''}
        `, hasUserFilter ? [cfg.licitacao_board_ids, userIdArr] : [cfg.licitacao_board_ids]);

        const byBoard = new Map();
        for (const r of rows) {
          if (!byBoard.has(r.board_id)) {
            byBoard.set(r.board_id, {
              kind: 'licitacao_board',
              id: r.board_id, name: r.board_name,
              total: 0, incomplete: 0, without_followup: 0, without_history: 0, stale: 0,
              problem_cards: [],
            });
          }
          const f = byBoard.get(r.board_id);
          f.total += 1;
          const issues = [];
          if (!r.entity_name) issues.push('Sem órgão');
          if (!r.estimated_value || Number(r.estimated_value) === 0) issues.push('Sem valor');
          if (!r.assigned_to) issues.push('Sem responsável');
          if (r.hours_idle >= staleHours) issues.push(`Parado há ${Math.round(r.hours_idle)}h`);
          if (issues.length) {
            if (issues.some(i => i.startsWith('Sem'))) f.incomplete += 1;
            if (r.hours_idle >= staleHours) f.stale += 1;
            f.problem_cards.push({
              id: r.id, title: r.title, stage_name: r.stage_name,
              owner_name: r.assigned_name, company_name: r.entity_name,
              value: Number(r.estimated_value || 0), hours_idle: Math.round(r.hours_idle), issues,
            });
          }
        }
        for (const f of byBoard.values()) {
          f.problem_cards.sort((a, b) => b.issues.length - a.issues.length || b.hours_idle - a.hours_idle);
          f.problem_cards = f.problem_cards.slice(0, 50);
          licitacaoDiagnostics.push(f);
        }
      } catch (e) {
        logError('supervisor_ia.licitacao_query', e);
      }
    }

    res.json({
      period: { start_date: startDate, end_date: endDate, stale_hours: staleHours },
      summary: {
        total_deals_created: dealsByOwner.reduce((s, r) => s + r.deals_created, 0),
        total_companies_created: newCompaniesTotal,
        total_incomplete: [...funnelDiagnostics, ...homologationDiagnostics, ...licitacaoDiagnostics].reduce((s, f) => s + f.incomplete, 0),
        total_stale: [...funnelDiagnostics, ...homologationDiagnostics, ...licitacaoDiagnostics].reduce((s, f) => s + f.stale, 0),
        total_without_followup: funnelDiagnostics.reduce((s, f) => s + f.without_followup, 0),
        total_without_history: funnelDiagnostics.reduce((s, f) => s + f.without_history, 0),
      },
      deals_by_owner: dealsByOwner,
      new_companies_by_user: newCompanies,
      diagnostics: [...funnelDiagnostics, ...homologationDiagnostics, ...licitacaoDiagnostics],
    });
  } catch (e) {
    logError('supervisor_ia.analysis', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
