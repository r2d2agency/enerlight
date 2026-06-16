// ============================================================
// Supervisor IA — Organizador Automático de Kanban
// Aplica regras determinísticas + hibrido por severidade.
// Ações de baixo risco: executadas automaticamente (auto_applied).
// Ações de alto risco: registradas como SUGESTÃO (suggested) p/ aprovação manual.
// ============================================================
import { query } from '../db.js';
import { logError, logInfo } from '../logger.js';
import { sendMessage as sendWhatsapp } from './whatsapp-provider.js';

function safeArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

// Garante a tabela de ações/sugestões
export async function ensureOrganizerSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS supervisor_ia_actions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id UUID NOT NULL,
      user_id UUID NOT NULL,
      run_id UUID,
      rule TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'low',
      status TEXT NOT NULL DEFAULT 'suggested', -- suggested | auto_applied | applied | rejected | failed
      deal_id UUID,
      deal_title TEXT,
      funnel_id UUID,
      funnel_name TEXT,
      from_stage_id UUID,
      from_stage_name TEXT,
      to_stage_id UUID,
      to_stage_name TEXT,
      from_owner_id UUID,
      to_owner_id UUID,
      to_owner_name TEXT,
      reason TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      error TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      applied_at TIMESTAMP WITH TIME ZONE,
      reviewed_by UUID
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_supervisor_ia_actions_org_status ON supervisor_ia_actions(organization_id, status, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_supervisor_ia_actions_user ON supervisor_ia_actions(user_id, created_at DESC)`);
  // Colunas extras de config (idempotente — também aplicadas em routes/supervisor-ia ensureSchema)
  for (const col of [
    `organizer_enabled BOOLEAN DEFAULT false`,
    `organizer_stale_to_next_enabled BOOLEAN DEFAULT true`,
    `organizer_stale_to_next_hours INTEGER DEFAULT 72`,
    `organizer_dead_to_lost_enabled BOOLEAN DEFAULT true`,
    `organizer_dead_to_lost_hours INTEGER DEFAULT 720`,
    `organizer_round_robin_enabled BOOLEAN DEFAULT true`,
    `organizer_notify_missing_enabled BOOLEAN DEFAULT true`,
    `organizer_auto_value_threshold NUMERIC DEFAULT 50000`,
    `organizer_initial_stage_only BOOLEAN DEFAULT true`,
    `organizer_last_run_at TIMESTAMP WITH TIME ZONE`,
  ]) {
    const colName = col.split(' ')[0];
    await query(`ALTER TABLE supervisor_ia_configs ADD COLUMN IF NOT EXISTS ${col}`).catch((e) => {
      logError('supervisor_ia.organizer.alter', e, { col: colName });
    });
  }
}

// ------- Helpers de classificação de severidade -------
function classifySeverity({ rule, value, hoursIdle, threshold }) {
  // alto risco => fica como sugestão
  // baixo risco => auto
  if (rule === 'dead_to_lost') return 'high';
  if (rule === 'stale_to_next') {
    if (Number(value || 0) >= Number(threshold || 50000)) return 'high';
    return 'low';
  }
  if (rule === 'unassigned_round_robin') return 'low';
  if (rule === 'notify_missing_data') return 'low';
  return 'low';
}

// ------- Round-robin pool: usuários do escopo (grupos + user_ids), ativos -------
async function resolveRoundRobinPool(orgId, cfg) {
  const pool = new Set(safeArray(cfg.user_ids));
  const groupIds = safeArray(cfg.group_ids);
  if (groupIds.length) {
    const { rows } = await query(
      `SELECT DISTINCT user_id FROM crm_user_group_members WHERE group_id = ANY($1::uuid[])`,
      [groupIds]
    ).catch(() => ({ rows: [] }));
    rows.forEach(r => pool.add(r.user_id));
  }
  if (pool.size === 0) {
    // fallback: vendedores ativos da organização
    const { rows } = await query(
      `SELECT om.user_id
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
         AND COALESCE(u.is_active, true) = true
         AND om.role IN ('seller', 'manager', 'admin', 'owner')`,
      [orgId]
    ).catch(() => ({ rows: [] }));
    rows.forEach(r => pool.add(r.user_id));
  }
  // filtra inativos
  if (pool.size === 0) return [];
  const { rows: actives } = await query(
    `SELECT id, name FROM users WHERE id = ANY($1::uuid[]) AND COALESCE(is_active, true) = true ORDER BY name`,
    [Array.from(pool)]
  ).catch(() => ({ rows: [] }));
  return actives;
}

// ------- Inserir ação (suggested ou auto_applied) -------
async function recordAction(client, base, severity, status, error = null) {
  const r = await query(`
    INSERT INTO supervisor_ia_actions
      (organization_id, user_id, run_id, rule, severity, status, deal_id, deal_title,
       funnel_id, funnel_name, from_stage_id, from_stage_name, to_stage_id, to_stage_name,
       from_owner_id, to_owner_id, to_owner_name, reason, payload, error, applied_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, CASE WHEN $6 IN ('auto_applied','applied') THEN NOW() ELSE NULL END)
    RETURNING id
  `, [
    base.organization_id, base.user_id, base.run_id, base.rule, severity, status,
    base.deal_id || null, base.deal_title || null,
    base.funnel_id || null, base.funnel_name || null,
    base.from_stage_id || null, base.from_stage_name || null,
    base.to_stage_id || null, base.to_stage_name || null,
    base.from_owner_id || null, base.to_owner_id || null, base.to_owner_name || null,
    base.reason || null, JSON.stringify(base.payload || {}), error,
  ]);
  return r.rows[0].id;
}

// ------- Executar regra "stale_to_next": mover card parado para próxima etapa -------
async function ruleStaleToNext({ orgId, userId, runId, cfg, stages, stageNextMap, actions }) {
  if (!cfg.organizer_stale_to_next_enabled) return;
  const funnelIds = safeArray(cfg.funnel_ids);
  if (!funnelIds.length) return;
  const hours = Number(cfg.organizer_stale_to_next_hours) || 72;

  const { rows } = await query(`
    SELECT d.id, d.title, d.value, d.owner_id, d.stage_id, d.funnel_id,
           f.name AS funnel_name, s.name AS stage_name, s.position AS stage_position,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(d.last_activity_at, d.created_at))) / 3600.0 AS hours_idle
    FROM crm_deals d
    JOIN crm_funnels f ON f.id = d.funnel_id
    JOIN crm_stages s ON s.id = d.stage_id
    WHERE d.organization_id = $1
      AND d.funnel_id = ANY($2::uuid[])
      AND d.status = 'open'
      AND (NOW() - COALESCE(d.last_activity_at, d.created_at)) >= ($3 || ' hours')::interval
  `, [orgId, funnelIds, String(hours)]).catch((e) => { logError('organizer.stale_to_next.query', e); return { rows: [] }; });

  for (const d of rows) {
    const next = stageNextMap.get(d.stage_id);
    if (!next) continue; // já está na última etapa

    // Opcional: aplicar apenas se ainda na etapa inicial do funil
    if (cfg.organizer_initial_stage_only && d.stage_position > 0) {
      // ainda registra como sugestão de baixa severidade
    }

    const severity = classifySeverity({
      rule: 'stale_to_next',
      value: d.value,
      hoursIdle: d.hours_idle,
      threshold: cfg.organizer_auto_value_threshold,
    });

    const base = {
      organization_id: orgId, user_id: userId, run_id: runId, rule: 'stale_to_next',
      deal_id: d.id, deal_title: d.title,
      funnel_id: d.funnel_id, funnel_name: d.funnel_name,
      from_stage_id: d.stage_id, from_stage_name: d.stage_name,
      to_stage_id: next.id, to_stage_name: next.name,
      reason: `Card sem movimentação há ${Math.round(d.hours_idle)}h. Avançar de "${d.stage_name}" para "${next.name}".`,
      payload: { value: Number(d.value || 0), hours_idle: Math.round(d.hours_idle) },
    };

    if (severity === 'low') {
      // executa
      try {
        await query(
          `UPDATE crm_deals SET stage_id = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2`,
          [next.id, d.id]
        );
        await query(
          `INSERT INTO crm_deal_history (deal_id, user_id, user_name_snapshot, action, from_value, to_value, notes)
           VALUES ($1, NULL, 'Supervisor IA', 'stage_changed', $2, $3, $4)`,
          [d.id, d.stage_name, next.name, `Movido automaticamente pelo Supervisor IA — parado há ${Math.round(d.hours_idle)}h`]
        ).catch(() => {});
        const id = await recordAction(null, base, severity, 'auto_applied');
        actions.applied++;
        actions.items.push({ id, ...base, severity, status: 'auto_applied' });
      } catch (e) {
        logError('organizer.stale_to_next.apply', e, { deal_id: d.id });
        const id = await recordAction(null, base, severity, 'failed', String(e?.message || e));
        actions.failed++;
        actions.items.push({ id, ...base, severity, status: 'failed' });
      }
    } else {
      const id = await recordAction(null, base, severity, 'suggested');
      actions.suggested++;
      actions.items.push({ id, ...base, severity, status: 'suggested' });
    }
  }
}

// ------- Regra dead_to_lost (sugestão) -------
async function ruleDeadToLost({ orgId, userId, runId, cfg, actions }) {
  if (!cfg.organizer_dead_to_lost_enabled) return;
  const funnelIds = safeArray(cfg.funnel_ids);
  if (!funnelIds.length) return;
  const hours = Number(cfg.organizer_dead_to_lost_hours) || 720;

  const { rows } = await query(`
    SELECT d.id, d.title, d.value, d.stage_id, d.funnel_id, f.name AS funnel_name, s.name AS stage_name,
           EXTRACT(EPOCH FROM (NOW() - COALESCE(d.last_activity_at, d.created_at))) / 3600.0 AS hours_idle
    FROM crm_deals d
    JOIN crm_funnels f ON f.id = d.funnel_id
    LEFT JOIN crm_stages s ON s.id = d.stage_id
    WHERE d.organization_id = $1
      AND d.funnel_id = ANY($2::uuid[])
      AND d.status = 'open'
      AND (NOW() - COALESCE(d.last_activity_at, d.created_at)) >= ($3 || ' hours')::interval
  `, [orgId, funnelIds, String(hours)]).catch((e) => { logError('organizer.dead_to_lost.query', e); return { rows: [] }; });

  for (const d of rows) {
    const base = {
      organization_id: orgId, user_id: userId, run_id: runId, rule: 'dead_to_lost',
      deal_id: d.id, deal_title: d.title,
      funnel_id: d.funnel_id, funnel_name: d.funnel_name,
      from_stage_id: d.stage_id, from_stage_name: d.stage_name,
      reason: `Sem contato/movimento há ${Math.round(d.hours_idle / 24)} dias. Sugerido marcar como perdido.`,
      payload: { value: Number(d.value || 0), hours_idle: Math.round(d.hours_idle) },
    };
    const id = await recordAction(null, base, 'high', 'suggested');
    actions.suggested++;
    actions.items.push({ id, ...base, severity: 'high', status: 'suggested' });
  }
}

// ------- Regra round_robin (auto) -------
async function ruleRoundRobin({ orgId, userId, runId, cfg, actions }) {
  if (!cfg.organizer_round_robin_enabled) return;
  const funnelIds = safeArray(cfg.funnel_ids);
  if (!funnelIds.length) return;

  const pool = await resolveRoundRobinPool(orgId, cfg);
  if (!pool.length) return;

  const { rows } = await query(`
    SELECT d.id, d.title, d.funnel_id, f.name AS funnel_name, d.stage_id, s.name AS stage_name
    FROM crm_deals d
    JOIN crm_funnels f ON f.id = d.funnel_id
    LEFT JOIN crm_stages s ON s.id = d.stage_id
    WHERE d.organization_id = $1
      AND d.funnel_id = ANY($2::uuid[])
      AND d.status = 'open'
      AND d.owner_id IS NULL
    ORDER BY d.created_at ASC
    LIMIT 200
  `, [orgId, funnelIds]).catch((e) => { logError('organizer.round_robin.query', e); return { rows: [] }; });

  // contar deals atuais por user para distribuir mais justo
  const { rows: loadRows } = await query(`
    SELECT owner_id, COUNT(*)::int AS cnt
    FROM crm_deals
    WHERE organization_id = $1 AND status = 'open' AND owner_id = ANY($2::uuid[])
    GROUP BY owner_id
  `, [orgId, pool.map(p => p.id)]).catch(() => ({ rows: [] }));
  const load = new Map(pool.map(p => [p.id, 0]));
  loadRows.forEach(r => load.set(r.owner_id, Number(r.cnt)));

  for (const d of rows) {
    // escolhe o user com menor carga
    let chosen = pool[0];
    let min = Infinity;
    for (const u of pool) {
      const c = load.get(u.id) ?? 0;
      if (c < min) { min = c; chosen = u; }
    }
    load.set(chosen.id, (load.get(chosen.id) ?? 0) + 1);

    const base = {
      organization_id: orgId, user_id: userId, run_id: runId, rule: 'unassigned_round_robin',
      deal_id: d.id, deal_title: d.title,
      funnel_id: d.funnel_id, funnel_name: d.funnel_name,
      from_stage_id: d.stage_id, from_stage_name: d.stage_name,
      from_owner_id: null, to_owner_id: chosen.id, to_owner_name: chosen.name,
      reason: `Card sem responsável atribuído automaticamente a ${chosen.name} (round-robin por carga).`,
      payload: {},
    };
    try {
      await query(
        `UPDATE crm_deals SET owner_id = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2`,
        [chosen.id, d.id]
      );
      await query(
        `INSERT INTO crm_deal_history (deal_id, user_id, user_name_snapshot, action, to_value, notes)
         VALUES ($1, NULL, 'Supervisor IA', 'owner_assigned', $2, $3)`,
        [d.id, chosen.name, `Atribuído via round-robin pelo Supervisor IA`]
      ).catch(() => {});
      const id = await recordAction(null, base, 'low', 'auto_applied');
      actions.applied++;
      actions.items.push({ id, ...base, severity: 'low', status: 'auto_applied' });
    } catch (e) {
      logError('organizer.round_robin.apply', e, { deal_id: d.id });
      const id = await recordAction(null, base, 'low', 'failed', String(e?.message || e));
      actions.failed++;
      actions.items.push({ id, ...base, severity: 'low', status: 'failed' });
    }
  }
}

// ------- Regra notify_missing_data: notifica dono por WhatsApp -------
async function ruleNotifyMissing({ orgId, userId, runId, cfg, actions }) {
  if (!cfg.organizer_notify_missing_enabled) return;
  const funnelIds = safeArray(cfg.funnel_ids);
  if (!funnelIds.length) return;
  if (!cfg.alert_whatsapp_connection_id) return; // sem conexão, não tem como notificar

  // Carrega conexão
  const connR = await query(
    `SELECT * FROM connections WHERE id = $1 AND organization_id = $2 AND status = 'connected'`,
    [cfg.alert_whatsapp_connection_id, orgId]
  ).catch(() => ({ rows: [] }));
  const connection = connR.rows[0];
  if (!connection) return;

  const { rows } = await query(`
    SELECT d.id, d.title, d.value, d.company_id, d.owner_id, d.funnel_id,
           f.name AS funnel_name, s.name AS stage_name,
           u.name AS owner_name, u.phone AS owner_phone
    FROM crm_deals d
    JOIN crm_funnels f ON f.id = d.funnel_id
    LEFT JOIN crm_stages s ON s.id = d.stage_id
    JOIN users u ON u.id = d.owner_id
    WHERE d.organization_id = $1
      AND d.funnel_id = ANY($2::uuid[])
      AND d.status = 'open'
      AND d.owner_id IS NOT NULL
      AND (d.company_id IS NULL OR d.value IS NULL OR d.value = 0)
      AND u.phone IS NOT NULL
      AND u.phone <> ''
    LIMIT 100
  `, [orgId, funnelIds]).catch((e) => { logError('organizer.notify_missing.query', e); return { rows: [] }; });

  // Evita spam: agrupa por dono e manda uma única msg
  const byOwner = new Map();
  for (const d of rows) {
    if (!byOwner.has(d.owner_id)) byOwner.set(d.owner_id, { owner_id: d.owner_id, owner_name: d.owner_name, owner_phone: d.owner_phone, deals: [] });
    byOwner.get(d.owner_id).deals.push(d);
  }

  for (const entry of byOwner.values()) {
    const items = entry.deals.slice(0, 10);
    const missingTxt = items.map((d, i) => {
      const miss = [];
      if (!d.company_id) miss.push('empresa');
      if (!d.value || Number(d.value) === 0) miss.push('valor');
      return `${i + 1}. *${d.title}* (${d.funnel_name}/${d.stage_name || '?'}) — falta: ${miss.join(' e ')}`;
    }).join('\n');
    const message = `🧠 *Supervisor IA*\n\nOlá ${entry.owner_name}, identifiquei *${entry.deals.length} card(s)* com dados pendentes:\n\n${missingTxt}\n\n_Por favor preencha os dados faltantes para manter o CRM saudável._`;

    try {
      await sendWhatsapp(connection, entry.owner_phone, message, 'text', null);
      for (const d of items) {
        const base = {
          organization_id: orgId, user_id: userId, run_id: runId, rule: 'notify_missing_data',
          deal_id: d.id, deal_title: d.title,
          funnel_id: d.funnel_id, funnel_name: d.funnel_name,
          from_stage_id: d.stage_id, from_stage_name: d.stage_name,
          from_owner_id: d.owner_id, to_owner_id: d.owner_id, to_owner_name: d.owner_name,
          reason: `Notificação WhatsApp enviada a ${d.owner_name} sobre dados faltantes.`,
          payload: { phone: entry.owner_phone, missing: { company: !d.company_id, value: !d.value || Number(d.value) === 0 } },
        };
        const id = await recordAction(null, base, 'low', 'auto_applied');
        actions.applied++;
        actions.items.push({ id, ...base, severity: 'low', status: 'auto_applied' });
      }
    } catch (e) {
      logError('organizer.notify_missing.send', e, { owner_id: entry.owner_id });
    }
  }
}

// ------- Construir mapa "etapa atual -> próxima etapa" por funil -------
async function buildStageMaps(funnelIds) {
  if (!funnelIds.length) return { stages: [], nextMap: new Map() };
  const { rows } = await query(`
    SELECT id, name, funnel_id, position
    FROM crm_stages
    WHERE funnel_id = ANY($1::uuid[])
    ORDER BY funnel_id, position
  `, [funnelIds]).catch((e) => { logError('organizer.stages.load', e); return { rows: [] }; });

  // agrupar por funil
  const byFunnel = new Map();
  for (const s of rows) {
    if (!byFunnel.has(s.funnel_id)) byFunnel.set(s.funnel_id, []);
    byFunnel.get(s.funnel_id).push(s);
  }
  const nextMap = new Map();
  for (const arr of byFunnel.values()) {
    for (let i = 0; i < arr.length - 1; i++) {
      nextMap.set(arr[i].id, arr[i + 1]);
    }
  }
  return { stages: rows, nextMap };
}

// ------- Entrypoint principal -------
export async function runOrganizer({ orgId, userId, cfg }) {
  await ensureOrganizerSchema();
  const runId = (await query(`SELECT gen_random_uuid() AS id`)).rows[0].id;
  const actions = { applied: 0, suggested: 0, failed: 0, items: [] };

  if (!cfg.organizer_enabled) {
    logInfo('organizer.disabled', { orgId, userId });
    return { run_id: runId, ...actions };
  }

  const funnelIds = safeArray(cfg.funnel_ids);
  const { nextMap: stageNextMap } = await buildStageMaps(funnelIds);

  // Ordem: round-robin → stale_to_next → dead_to_lost → notify
  await ruleRoundRobin({ orgId, userId, runId, cfg, actions });
  await ruleStaleToNext({ orgId, userId, runId, cfg, stages: [], stageNextMap, actions });
  await ruleDeadToLost({ orgId, userId, runId, cfg, actions });
  await ruleNotifyMissing({ orgId, userId, runId, cfg, actions });

  await query(
    `UPDATE supervisor_ia_configs SET organizer_last_run_at = NOW() WHERE organization_id = $1 AND user_id = $2`,
    [orgId, userId]
  );

  logInfo('organizer.run_complete', {
    orgId, userId, run_id: runId,
    applied: actions.applied, suggested: actions.suggested, failed: actions.failed,
  });

  return { run_id: runId, ...actions };
}

// ------- Aplicar uma sugestão manualmente -------
export async function applyAction(actionId, orgId, reviewerId) {
  const { rows } = await query(
    `SELECT * FROM supervisor_ia_actions WHERE id = $1 AND organization_id = $2`,
    [actionId, orgId]
  );
  const a = rows[0];
  if (!a) throw new Error('Ação não encontrada');
  if (a.status !== 'suggested') throw new Error('Ação não está pendente');

  try {
    if (a.rule === 'stale_to_next' && a.deal_id && a.to_stage_id) {
      await query(
        `UPDATE crm_deals SET stage_id = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [a.to_stage_id, a.deal_id, orgId]
      );
      await query(
        `INSERT INTO crm_deal_history (deal_id, user_id, user_name, action, from_stage, to_stage, description)
         VALUES ($1, $2, 'Supervisor IA (aprovado)', 'stage_changed', $3, $4, $5)`,
        [a.deal_id, reviewerId, a.from_stage_name, a.to_stage_name, `Movido após aprovação da sugestão do Supervisor IA`]
      ).catch(() => {});
    } else if (a.rule === 'dead_to_lost' && a.deal_id) {
      await query(
        `UPDATE crm_deals SET status = 'lost', lost_reason = $1, closed_at = NOW(), updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        ['Marcado como perdido pelo Supervisor IA (inatividade prolongada)', a.deal_id, orgId]
      );
      await query(
        `INSERT INTO crm_deal_history (deal_id, user_id, user_name, action, from_status, to_status, description)
         VALUES ($1, $2, 'Supervisor IA (aprovado)', 'status_changed', 'open', 'lost', $3)`,
        [a.deal_id, reviewerId, a.reason]
      ).catch(() => {});
    } else if (a.rule === 'unassigned_round_robin' && a.deal_id && a.to_owner_id) {
      await query(
        `UPDATE crm_deals SET owner_id = $1, last_activity_at = NOW(), updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
        [a.to_owner_id, a.deal_id, orgId]
      );
    }
    await query(
      `UPDATE supervisor_ia_actions SET status = 'applied', applied_at = NOW(), reviewed_by = $1 WHERE id = $2`,
      [reviewerId, actionId]
    );
    return { ok: true };
  } catch (e) {
    await query(
      `UPDATE supervisor_ia_actions SET status = 'failed', error = $1, reviewed_by = $2 WHERE id = $3`,
      [String(e?.message || e), reviewerId, actionId]
    );
    throw e;
  }
}

export async function rejectAction(actionId, orgId, reviewerId) {
  await query(
    `UPDATE supervisor_ia_actions SET status = 'rejected', reviewed_by = $1, applied_at = NOW()
     WHERE id = $2 AND organization_id = $3 AND status = 'suggested'`,
    [reviewerId, actionId, orgId]
  );
  return { ok: true };
}
