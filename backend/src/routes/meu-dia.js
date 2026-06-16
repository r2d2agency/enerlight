// Meu Dia - Dashboard de ações diárias do vendedor
// Agrega tarefas, reuniões, follow-ups, alertas IA, cards parados e teleatendimento
// Ordenação por prioridade (score) - "IA prioriza"

const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { logError } = require('../lib/logger');

router.use(authenticate);

// Score deterministic - simula priorização IA
// Higher = mais urgente, aparece primeiro
function scoreItem(item) {
  let s = 0;
  const now = Date.now();

  // Atrasado é prioridade máxima
  if (item.is_overdue) s += 200;

  // Severidade vinda do supervisor IA
  if (item.severity === 'critical') s += 180;
  else if (item.severity === 'high') s += 120;
  else if (item.severity === 'medium') s += 60;

  // Reunião acontecendo agora ou em < 1h
  if (item.type === 'meeting' && item.starts_at) {
    const diff = new Date(item.starts_at).getTime() - now;
    if (diff < 0) s += 150;
    else if (diff < 60 * 60 * 1000) s += 140;
    else if (diff < 3 * 60 * 60 * 1000) s += 80;
    else s += 30;
  }

  // Prioridade explícita da tarefa
  if (item.priority === 'urgent' || item.priority === 'high') s += 80;
  else if (item.priority === 'medium') s += 30;

  // Valor da negociação relacionada
  if (item.deal_value) {
    if (item.deal_value > 500000) s += 60;
    else if (item.deal_value > 100000) s += 35;
    else if (item.deal_value > 20000) s += 15;
  }

  // Tempo parado em cards
  if (item.idle_hours) {
    if (item.idle_hours > 240) s += 90;
    else if (item.idle_hours > 120) s += 50;
    else if (item.idle_hours > 72) s += 25;
  }

  return s;
}

router.get('/', async (req, res) => {
  try {
    const userId = req.userId;

    // Descobre organização
    const orgRes = await query(
      `SELECT organization_id, role FROM organization_members WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId]
    );
    if (!orgRes.rows.length) return res.json({ items: [], summary: emptySummary(), generated_at: new Date().toISOString() });
    const orgId = orgRes.rows[0].organization_id;

    const items = [];

    // ============ 1. CRM TASKS (tarefas + follow-ups) ============
    try {
      const tasks = await query(
        `SELECT t.id, t.title, t.description, t.type, t.priority, t.status,
                t.due_date, t.reminder_at, t.deal_id, t.company_id,
                d.title as deal_title, d.value as deal_value,
                c.name as company_name,
                (t.due_date < NOW()) as is_overdue
         FROM crm_tasks t
         LEFT JOIN crm_deals d ON d.id = t.deal_id
         LEFT JOIN crm_companies c ON c.id = t.company_id
         WHERE t.organization_id = $1
           AND t.assigned_to = $2
           AND t.status = 'pending'
           AND (
             DATE(t.due_date) <= CURRENT_DATE
             OR DATE(t.reminder_at) = CURRENT_DATE
           )
         ORDER BY t.due_date ASC NULLS LAST
         LIMIT 100`,
        [orgId, userId]
      );
      for (const t of tasks.rows) {
        const isFollowup = t.type === 'follow_up' || t.type === 'followup' || (t.reminder_at && !t.due_date);
        items.push({
          id: `task-${t.id}`,
          source_id: t.id,
          type: isFollowup ? 'followup' : 'task',
          title: t.title,
          subtitle: t.company_name || t.deal_title || t.description || '',
          due_at: t.due_date,
          starts_at: t.reminder_at || t.due_date,
          is_overdue: t.is_overdue,
          priority: t.priority,
          deal_id: t.deal_id,
          deal_value: t.deal_value ? Number(t.deal_value) : null,
          link: t.deal_id ? `/crm/negociacoes?deal=${t.deal_id}` : '/crm/tarefas',
          tag: isFollowup ? 'Follow-up' : (t.type === 'call' ? 'Ligação' : t.type === 'meeting' ? 'Reunião' : 'Tarefa'),
        });
      }
    } catch (e) { logError('meu-dia.tasks', e); }

    // ============ 2. REUNIÕES (hoje, onde sou participante ou criador) ============
    try {
      const meetings = await query(
        `SELECT m.id, m.title, m.meeting_date, m.start_time, m.end_time, m.location, m.status,
                m.deal_id, d.title as deal_title, d.value as deal_value
         FROM meetings m
         LEFT JOIN crm_deals d ON d.id = m.deal_id
         WHERE m.organization_id = $1
           AND m.meeting_date = CURRENT_DATE
           AND m.status IN ('scheduled', 'in_progress')
           AND (
             m.created_by = $2
             OR EXISTS (SELECT 1 FROM meeting_participants mp WHERE mp.meeting_id = m.id AND mp.user_id = $2)
           )
         ORDER BY m.start_time ASC`,
        [orgId, userId]
      );
      for (const m of meetings.rows) {
        const startsAt = `${m.meeting_date}T${m.start_time || '09:00:00'}`;
        items.push({
          id: `meeting-${m.id}`,
          source_id: m.id,
          type: 'meeting',
          title: m.title,
          subtitle: [m.location, m.deal_title].filter(Boolean).join(' • '),
          starts_at: startsAt,
          ends_at: `${m.meeting_date}T${m.end_time || '10:00:00'}`,
          is_overdue: false,
          deal_id: m.deal_id,
          deal_value: m.deal_value ? Number(m.deal_value) : null,
          link: `/reunioes?meeting=${m.id}`,
          tag: 'Reunião',
        });
      }
    } catch (e) { logError('meu-dia.meetings', e); }

    // ============ 3. ALERTAS / AÇÕES SUGERIDAS SUPERVISOR IA ============
    try {
      const alerts = await query(
        `SELECT id, action_type, severity, title, description, deal_id, payload, created_at
         FROM supervisor_ia_actions
         WHERE organization_id = $1
           AND (user_id = $2 OR (payload->>'owner_id')::text = $2::text)
           AND status = 'suggested'
         ORDER BY created_at DESC
         LIMIT 30`,
        [orgId, userId]
      );
      for (const a of alerts.rows) {
        items.push({
          id: `alert-${a.id}`,
          source_id: a.id,
          type: 'alert',
          title: a.title || 'Sugestão do Supervisor IA',
          subtitle: a.description || '',
          severity: a.severity,
          starts_at: a.created_at,
          is_overdue: false,
          deal_id: a.deal_id,
          link: '/supervisor-ia',
          tag: 'Alerta IA',
        });
      }
    } catch (e) { /* supervisor_ia_actions pode não existir ainda */ }

    // ============ 4. CARDS PARADOS (deals do vendedor sem mexer > 72h) ============
    try {
      const stale = await query(
        `SELECT d.id, d.title, d.value, d.updated_at,
                c.name as company_name, s.name as stage_name,
                EXTRACT(EPOCH FROM (NOW() - d.updated_at))/3600 as idle_hours
         FROM crm_deals d
         LEFT JOIN crm_companies c ON c.id = d.company_id
         LEFT JOIN crm_stages s ON s.id = d.stage_id
         WHERE d.organization_id = $1
           AND d.owner_id = $2
           AND COALESCE(d.status, 'open') = 'open'
           AND d.updated_at < NOW() - INTERVAL '72 hours'
         ORDER BY d.updated_at ASC
         LIMIT 15`,
        [orgId, userId]
      );
      for (const d of stale.rows) {
        items.push({
          id: `deal-${d.id}`,
          source_id: d.id,
          type: 'stale_deal',
          title: d.title,
          subtitle: `${d.company_name || 'Sem empresa'} • ${d.stage_name || ''} • parado ${Math.round(d.idle_hours)}h`,
          starts_at: d.updated_at,
          is_overdue: d.idle_hours > 168,
          idle_hours: Number(d.idle_hours),
          deal_id: d.id,
          deal_value: d.value ? Number(d.value) : null,
          link: `/crm/negociacoes?deal=${d.id}`,
          tag: 'Card parado',
        });
      }
    } catch (e) { logError('meu-dia.stale', e); }

    // ============ 5. TELEATENDIMENTO (mensagens agendadas pendentes) ============
    try {
      const sched = await query(
        `SELECT sm.id, sm.content, sm.scheduled_at, sm.conversation_id,
                cc.name as contact_name, cc.phone as contact_phone
         FROM scheduled_messages sm
         LEFT JOIN conversations cv ON cv.id = sm.conversation_id
         LEFT JOIN chat_contacts cc ON cc.id = cv.contact_id
         WHERE sm.sender_id = $1
           AND sm.status = 'pending'
           AND DATE(sm.scheduled_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
         ORDER BY sm.scheduled_at ASC
         LIMIT 50`,
        [userId]
      );
      for (const s of sched.rows) {
        items.push({
          id: `sched-${s.id}`,
          source_id: s.id,
          type: 'scheduled_message',
          title: s.contact_name || s.contact_phone || 'Mensagem agendada',
          subtitle: (s.content || '').slice(0, 120),
          starts_at: s.scheduled_at,
          is_overdue: new Date(s.scheduled_at) < new Date(),
          link: `/chat?conversation=${s.conversation_id}`,
          tag: 'Teleatendimento',
        });
      }
    } catch (e) { /* tabela pode não existir */ }

    // ============ 6. TASK BOARDS (cards atribuídos hoje/atrasados) ============
    try {
      const cards = await query(
        `SELECT tc.id, tc.title, tc.description, tc.due_date, tc.priority, tc.board_id,
                tb.name as board_name,
                (tc.due_date < NOW()) as is_overdue
         FROM task_cards tc
         JOIN task_boards tb ON tb.id = tc.board_id
         WHERE tc.assigned_to = $1
           AND COALESCE(tc.is_archived, false) = false
           AND tc.due_date IS NOT NULL
           AND DATE(tc.due_date) <= CURRENT_DATE
         ORDER BY tc.due_date ASC
         LIMIT 50`,
        [userId]
      );
      for (const c of cards.rows) {
        items.push({
          id: `card-${c.id}`,
          source_id: c.id,
          type: 'kanban_card',
          title: c.title,
          subtitle: c.board_name,
          starts_at: c.due_date,
          due_at: c.due_date,
          is_overdue: c.is_overdue,
          priority: c.priority,
          link: `/tarefas?board=${c.board_id}&card=${c.id}`,
          tag: 'Kanban',
        });
      }
    } catch (e) { /* opcional */ }

    // Score + sort
    for (const it of items) it.score = scoreItem(it);
    items.sort((a, b) => b.score - a.score);

    // Summary
    const summary = {
      total: items.length,
      overdue: items.filter(i => i.is_overdue).length,
      tasks: items.filter(i => i.type === 'task').length,
      followups: items.filter(i => i.type === 'followup').length,
      meetings: items.filter(i => i.type === 'meeting').length,
      alerts: items.filter(i => i.type === 'alert').length,
      stale_deals: items.filter(i => i.type === 'stale_deal').length,
      scheduled: items.filter(i => i.type === 'scheduled_message').length,
      kanban: items.filter(i => i.type === 'kanban_card').length,
    };

    res.json({
      items,
      summary,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    logError('meu-dia.get', e);
    res.status(500).json({ error: e.message });
  }
});

function emptySummary() {
  return { total: 0, overdue: 0, tasks: 0, followups: 0, meetings: 0, alerts: 0, stale_deals: 0, scheduled: 0, kanban: 0 };
}

module.exports = router;
