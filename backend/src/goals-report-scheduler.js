import { query } from './db.js';
import { sendMessage } from './lib/whatsapp-provider.js';
import { checkStatus as checkConnectionStatus } from './lib/whatsapp-provider.js';
import { logInfo, logError } from './logger.js';
import {
  ensureReportTables,
  generateReportText,
  buildRecipientMessage,
} from './lib/goals-report.js';

async function getConnection(connectionId) {
  const result = await query('SELECT * FROM connections WHERE id = $1', [connectionId]);
  const conn = result.rows[0];
  if (!conn) return null;

  let liveStatus = String(conn.status || '').toLowerCase();
  try {
    const live = await checkConnectionStatus(conn);
    if (live?.status) liveStatus = String(live.status).toLowerCase();
    if (liveStatus === 'connected' && conn.status !== 'connected') {
      await query('UPDATE connections SET status = $1, updated_at = NOW() WHERE id = $2', ['connected', conn.id]);
      conn.status = 'connected';
    }
  } catch (_) {}

  if (liveStatus !== 'connected') return null;
  return conn;
}

export async function executeGoalsReport() {
  try {
    await ensureReportTables();

    // Use São Paulo timezone for time comparison
    const now = new Date();
    const spFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false });
    const currentTime = spFormatter.format(now);

    // Find configs that should fire now (within 1 minute window)
    const configs = await query(
      `SELECT * FROM crm_goals_report_config WHERE is_active = true AND send_time::text LIKE $1`,
      [currentTime + '%']
    );

    for (const config of configs.rows) {
      try {
        const connection = await getConnection(config.connection_id);
        if (!connection) {
          logError('goals_report.no_connection', null, { config_id: config.id });
          continue;
        }

        const recipients = await query(
          'SELECT * FROM crm_goals_report_recipients WHERE config_id = $1 AND is_active = true',
          [config.id]
        );

        for (const recipient of recipients.rows) {
          try {
            const fullText = await buildRecipientMessage({
              orgId: config.organization_id,
              userId: recipient.user_id,
              reportType: recipient.report_type,
              includeChannels: config.include_channel_breakdown,
              includeEnerlight: config.include_enerlight,
              greetingTemplate: config.greeting_template,
              recipientName: recipient.name,
            });

            const result = await sendMessage(connection, recipient.phone, fullText, 'text', null);
            if (result && result.success === false) {
              logError('goals_report.send_error', new Error(result.error || 'Falha ao enviar'), {
                recipient_id: recipient.id,
                phone: recipient.phone,
                error: result.error || null,
              });
              continue;
            }
            logInfo('goals_report.sent', { recipient: recipient.name, phone: recipient.phone, type: recipient.report_type });
          } catch (err) {
            logError('goals_report.send_error', err, { recipient_id: recipient.id });
          }
        }
      } catch (err) {
        logError('goals_report.config_error', err, { config_id: config.id });
      }
    }
  } catch (err) {
    logError('goals_report.scheduler_error', err);
  }
}

export { generateReportText, ensureReportTables };
