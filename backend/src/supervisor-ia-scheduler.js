// ============================================================
// Supervisor IA — Scheduler (análise proativa + alertas WhatsApp)
// ============================================================
import { query } from './db.js';
import { logInfo, logError } from './logger.js';
import { computeAnalysis } from './routes/supervisor-ia.js';
import { resolveAIConfig, runBrainAnalysis, formatWhatsappAlert } from './lib/supervisor-ia-brain.js';
import { sendMessage as sendWhatsapp } from './lib/whatsapp-provider.js';
import { runOrganizer, ensureOrganizerSchema } from './lib/supervisor-ia-organizer.js';

export async function executeSupervisorIAOrganizer() {
  try {
    await ensureOrganizerSchema();
    const { rows } = await query(`SELECT * FROM supervisor_ia_configs WHERE organizer_enabled = true`);
    for (const cfg of rows) {
      try {
        await runOrganizer({ orgId: cfg.organization_id, userId: cfg.user_id, cfg });
      } catch (e) {
        logError('supervisor_ia.organizer_scheduler.run', e, { orgId: cfg.organization_id });
      }
    }
  } catch (e) {
    if (e.code !== '42P01' && e.code !== '42703') logError('supervisor_ia.organizer_scheduler', e);
  }
}

function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function processConfig(cfg) {
  const orgId = cfg.organization_id;
  const userId = cfg.user_id;
  const periodDays = cfg.analysis_period_days || 7;

  const analysis = await computeAnalysis(orgId, userId, localDate(-periodDays), localDate(0));
  // Skip if no scope produces data
  const hasAnything = (analysis.diagnostics || []).length > 0;
  if (!hasAnything) {
    logInfo('supervisor_ia.scheduler.skip_empty', { orgId, userId });
    return;
  }

  const aiConfig = await resolveAIConfig(orgId, cfg.ai_agent_id);
  const { insight, tokensUsed, model } = await runBrainAnalysis({ aiConfig, analysis, context: null });

  const ins = await query(`
    INSERT INTO supervisor_ia_insights
      (organization_id, user_id, trigger, period_start, period_end, insight, raw_snapshot_summary, tokens_used, model)
    VALUES ($1,$2,'auto',$3,$4,$5,$6,$7,$8)
    RETURNING id
  `, [
    orgId, userId,
    analysis.period.start_date, analysis.period.end_date,
    JSON.stringify(insight),
    JSON.stringify(analysis.summary),
    tokensUsed, model,
  ]);
  const insightId = ins.rows[0].id;

  await query(
    `UPDATE supervisor_ia_configs SET last_auto_analysis_at = NOW() WHERE organization_id = $1 AND user_id = $2`,
    [orgId, userId]
  );

  // Alerta WhatsApp se houver críticos/altos
  let numbers = [];
  try { numbers = Array.isArray(cfg.alert_whatsapp_numbers) ? cfg.alert_whatsapp_numbers : JSON.parse(cfg.alert_whatsapp_numbers || '[]'); } catch { numbers = []; }
  if (!cfg.alert_whatsapp_connection_id || numbers.length === 0) {
    logInfo('supervisor_ia.scheduler.no_whatsapp_target', { orgId, userId, insightId });
    return;
  }

  const orgR = await query(`SELECT name FROM organizations WHERE id = $1`, [orgId]).catch(() => ({ rows: [] }));
  const orgName = orgR.rows[0]?.name;
  const message = formatWhatsappAlert(insight, orgName);
  if (!message) {
    logInfo('supervisor_ia.scheduler.no_critical', { orgId, userId, insightId });
    return;
  }

  const connR = await query(
    `SELECT * FROM connections WHERE id = $1 AND organization_id = $2 AND status = 'connected'`,
    [cfg.alert_whatsapp_connection_id, orgId]
  );
  const connection = connR.rows[0];
  if (!connection) {
    logError('supervisor_ia.scheduler.connection_unavailable', new Error('connection not found'), { orgId, userId });
    return;
  }

  for (const phone of numbers) {
    try {
      await sendWhatsapp(connection, phone, message, 'text', null);
    } catch (e) {
      logError('supervisor_ia.scheduler.whatsapp_send_failed', e, { orgId, userId, phone });
    }
  }
  await query(
    `UPDATE supervisor_ia_insights SET alerted_at = NOW() WHERE id = $1`,
    [insightId]
  );
  logInfo('supervisor_ia.scheduler.alert_sent', { orgId, userId, insightId, recipients: numbers.length });
}

export async function executeSupervisorIA() {
  let configs = [];
  try {
    const { rows } = await query(`
      SELECT * FROM supervisor_ia_configs
      WHERE auto_analysis_enabled = true
        AND (
          last_auto_analysis_at IS NULL
          OR last_auto_analysis_at <= NOW() - (COALESCE(auto_analysis_interval_hours, 4) || ' hours')::interval
        )
    `);
    configs = rows;
  } catch (e) {
    // table might not exist yet
    if (e.code === '42P01' || e.code === '42703') return;
    logError('supervisor_ia.scheduler.list_configs', e);
    return;
  }

  if (!configs.length) return;
  logInfo('supervisor_ia.scheduler.start', { count: configs.length });

  for (const cfg of configs) {
    try {
      await processConfig(cfg);
    } catch (e) {
      logError('supervisor_ia.scheduler.process_failed', e, { orgId: cfg.organization_id, userId: cfg.user_id });
    }
  }
}
