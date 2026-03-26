import { query } from './db.js';
import { sendMessage } from './lib/whatsapp-provider.js';
import { logInfo, logError } from './logger.js';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(v);
}

async function ensureReportTables() {
  await query(`CREATE TABLE IF NOT EXISTS crm_goals_report_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL,
    send_time TIME NOT NULL DEFAULT '18:00',
    is_active BOOLEAN DEFAULT true,
    include_channel_breakdown BOOLEAN DEFAULT true,
    include_enerlight BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await query(`CREATE TABLE IF NOT EXISTS crm_goals_report_recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES crm_goals_report_config(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    phone VARCHAR(30) NOT NULL,
    name VARCHAR(255),
    report_type VARCHAR(20) NOT NULL DEFAULT 'full',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

function getDateExpr() {
  return `COALESCE(CASE WHEN data_type = 'faturamento' THEN billing_date WHEN data_type = 'pedido' THEN COALESCE(emission_date, delivery_date) ELSE emission_date END, emission_date, delivery_date, created_at::date)`;
}

function countBusinessDays(startDate, endDate) {
  let count = 0;
  const d = new Date(startDate);
  const end = new Date(endDate);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

async function generateReportText(orgId, userId, reportType, includeChannels, includeEnerlight) {
  const now = new Date();
  const sd = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const ed = now.toISOString().split('T')[0];
  const dateExpr = getDateExpr();
  const baseWhere = `organization_id = $1 AND ${dateExpr} >= $2::date AND ${dateExpr} <= $3::date`;

  let userFilter = '';
  const params = [orgId, sd, ed];
  if (reportType === 'individual' && userId) {
    params.push(userId);
    userFilter = ` AND user_id = $${params.length}`;
  }

  // Summary
  const summary = await query(
    `SELECT data_type, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
     FROM crm_goals_data WHERE ${baseWhere}${userFilter} GROUP BY data_type`, params
  );
  const gd = { orcamento: { count: 0, value: 0 }, pedido: { count: 0, value: 0 }, faturamento: { count: 0, value: 0 } };
  for (const row of summary.rows) {
    gd[row.data_type] = { count: parseInt(row.count), value: parseFloat(row.total_value) };
  }

  // Goals (geral)
  const goalsResult = await query(
    `SELECT metric, target_value FROM crm_goals WHERE organization_id = $1 AND is_active = true AND type = 'geral'`,
    [orgId]
  );
  const goalMap = {};
  for (const g of goalsResult.rows) {
    goalMap[g.metric] = (goalMap[g.metric] || 0) + parseFloat(g.target_value);
  }

  // MTD calc
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const totalBizDays = countBusinessDays(monthStart, monthEnd);
  const elapsedBizDays = countBusinessDays(monthStart, today);

  // Enerlight
  let enerlightByType = {};
  if (includeEnerlight && reportType === 'full') {
    const enerlightResult = await query(
      `SELECT data_type, COALESCE(SUM(value),0) as total_value
       FROM crm_goals_data WHERE ${baseWhere} AND LOWER(seller_name) SIMILAR TO '%(gustavo|fabio)%'
       GROUP BY data_type`, [orgId, sd, ed]
    );
    for (const r of enerlightResult.rows) {
      enerlightByType[r.data_type] = parseFloat(r.total_value);
    }
  }

  const dateStr = now.toLocaleDateString('pt-BR');
  let text = `📊 *RELATÓRIO DE METAS — ${dateStr}*\n`;
  
  if (reportType === 'individual' && userId) {
    // Get user name
    const userResult = await query('SELECT name FROM users WHERE id = $1', [userId]);
    const userName = userResult.rows[0]?.name || 'Vendedor';
    text += `👤 *${userName}*\n`;
  }
  text += '\n';

  const sections = [
    { label: '📄 Orçamentos', type: 'orcamento', metricValue: 'quotes_value', data: gd.orcamento },
    { label: '🛒 Pedidos', type: 'pedido', metricValue: 'orders_value', data: gd.pedido },
    { label: '💰 Faturamento', type: 'faturamento', metricValue: 'billing_value', data: gd.faturamento },
  ];

  for (const s of sections) {
    const planned = goalMap[s.metricValue] || 0;
    const mtd = totalBizDays > 0 ? (planned / totalBizDays) * elapsedBizDays : 0;
    const saldoMtd = s.data.value - mtd;
    const pct = planned > 0 ? ((s.data.value / planned) * 100).toFixed(1) : '—';
    const ticket = s.data.count > 0 ? s.data.value / s.data.count : 0;

    text += `${s.label}\n`;
    text += `  Qtd: ${s.data.count} | TM: ${fmt(ticket)}\n`;
    if (planned > 0) {
      text += `  Planejado: ${fmt(planned)}\n`;
    }
    text += `  Realizado: ${fmt(s.data.value)}`;
    if (planned > 0) text += ` (${pct}%)`;
    text += '\n';
    if (planned > 0) {
      text += `  MTD: ${fmt(mtd)}\n`;
      text += `  Saldo: ${saldoMtd >= 0 ? '✅' : '❌'} ${fmt(saldoMtd)}\n`;
    }

    const enerlightVal = enerlightByType[s.type] || 0;
    if (enerlightVal > 0 && reportType === 'full') {
      const realSemEnerlight = s.data.value - enerlightVal;
      const saldoSemEnerlight = realSemEnerlight - mtd;
      text += `  ⚡ Enerlight: ${fmt(enerlightVal)}\n`;
      text += `  Saldo s/ Enerlight: ${saldoSemEnerlight >= 0 ? '✅' : '❌'} ${fmt(saldoSemEnerlight)}\n`;
    }
    text += '\n';
  }

  // Channel breakdown
  if (includeChannels && reportType === 'full') {
    const channelResult = await query(
      `SELECT data_type, COALESCE(channel, 'Sem Canal') as channel, COUNT(*) as count, COALESCE(SUM(value),0) as total_value
       FROM crm_goals_data WHERE ${baseWhere}
       GROUP BY data_type, channel ORDER BY data_type, total_value DESC`,
      [orgId, sd, ed]
    );

    if (channelResult.rows.length > 0) {
      text += `📡 *POR CANAL*\n\n`;
      const channelsByType = {};
      for (const r of channelResult.rows) {
        if (!channelsByType[r.data_type]) channelsByType[r.data_type] = [];
        channelsByType[r.data_type].push(r);
      }

      const typeLabels = { orcamento: '📄 Orçamentos', pedido: '🛒 Pedidos', faturamento: '💰 Faturamento' };
      for (const [type, rows] of Object.entries(channelsByType)) {
        text += `${typeLabels[type] || type}\n`;
        for (const r of rows) {
          text += `  • ${r.channel}: ${fmt(parseFloat(r.total_value))} (${r.count})\n`;
        }
        text += '\n';
      }
    }
  }

  // Remaining business days
  const remaining = countBusinessDays(new Date(today.getTime() + 86400000), monthEnd);
  text += `📅 _${remaining} dias úteis restantes no mês_`;

  return text;
}

async function getConnection(connectionId) {
  const result = await query('SELECT * FROM connections WHERE id = $1 AND status = $2', [connectionId, 'connected']);
  return result.rows[0];
}

export async function executeGoalsReport() {
  try {
    await ensureReportTables();

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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
            const text = await generateReportText(
              config.organization_id,
              recipient.user_id,
              recipient.report_type,
              config.include_channel_breakdown,
              config.include_enerlight
            );

            await sendMessage(connection, recipient.phone, text, 'text', null);
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
