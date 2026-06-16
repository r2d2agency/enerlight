// ============================================================
// Supervisor IA - Cérebro (LLM analysis + chat)
// ============================================================
import { query } from '../db.js';
import { callAI } from './ai-caller.js';
import { logError, logInfo } from '../logger.js';

/**
 * Resolve AI config (agent-based or org-level fallback)
 */
export async function resolveAIConfig(organizationId, agentId) {
  if (agentId) {
    const r = await query(
      `SELECT id, name, ai_provider, ai_model, ai_api_key, system_prompt, temperature, max_tokens
       FROM ai_agents WHERE id = $1 AND organization_id = $2`,
      [agentId, organizationId]
    );
    const agent = r.rows[0];
    if (agent) {
      if (agent.ai_api_key) {
        return {
          provider: agent.ai_provider,
          model: agent.ai_model || 'gpt-4o-mini',
          apiKey: agent.ai_api_key,
          systemPromptBase: agent.system_prompt || '',
          temperature: parseFloat(agent.temperature) || 0.5,
          maxTokens: agent.max_tokens || 2500,
          agentName: agent.name,
        };
      }
    }
  }
  // Fallback to organization-level keys
  const orgR = await query(
    `SELECT ai_provider, ai_model, ai_api_key FROM organizations WHERE id = $1`,
    [organizationId]
  );
  const org = orgR.rows[0];
  if (!org?.ai_api_key || org.ai_provider === 'none') {
    throw new Error('Nenhuma chave de IA configurada (no agente nem na organização).');
  }
  return {
    provider: org.ai_provider,
    model: org.ai_model || 'gpt-4o-mini',
    apiKey: org.ai_api_key,
    systemPromptBase: '',
    temperature: 0.5,
    maxTokens: 2500,
    agentName: null,
  };
}

/**
 * Build a structured snapshot text from analysis JSON to feed the LLM.
 */
export function buildAnalysisSnapshot(analysis) {
  const lines = [];
  const p = analysis.period || {};
  lines.push(`PERÍODO: ${p.start_date} → ${p.end_date} (cards parados ≥ ${p.stale_hours}h)`);
  lines.push('');
  lines.push('RESUMO GERAL:');
  const s = analysis.summary || {};
  lines.push(`- Negociações criadas: ${s.total_deals_created}`);
  lines.push(`- Empresas novas: ${s.total_companies_created}`);
  lines.push(`- Cards incompletos: ${s.total_incomplete}`);
  lines.push(`- Cards parados: ${s.total_stale}`);
  lines.push(`- Sem follow-up: ${s.total_without_followup}`);
  lines.push(`- Sem histórico: ${s.total_without_history}`);
  lines.push('');

  lines.push('DESEMPENHO POR VENDEDOR (negociações criadas no período):');
  for (const r of (analysis.deals_by_owner || []).slice(0, 30)) {
    lines.push(`- ${r.owner_name}: ${r.deals_created} negociações, R$ ${Math.round(r.total_value).toLocaleString('pt-BR')}`);
  }
  if (!analysis.deals_by_owner?.length) lines.push('- (sem negociações no período)');
  lines.push('');

  lines.push('KANBANS MONITORADOS:');
  for (const d of analysis.diagnostics || []) {
    const tag = d.kind === 'crm_funnel' ? 'CRM' : d.kind === 'homologation_board' ? 'Homologação' : 'Licitação';
    lines.push(`\n▸ ${d.name} [${tag}]`);
    lines.push(`  Total: ${d.total} | Incompletos: ${d.incomplete} | Sem follow-up: ${d.without_followup} | Sem histórico: ${d.without_history} | Parados: ${d.stale}`);
    const cards = (d.problem_cards || []).slice(0, 12);
    if (cards.length) {
      lines.push('  Top cards problemáticos:');
      for (const c of cards) {
        lines.push(`    • "${c.title}" (${c.company_name || 's/empresa'}) — etapa: ${c.stage_name || '?'} | resp: ${c.owner_name || 'sem'} | valor: R$ ${Math.round(c.value || 0).toLocaleString('pt-BR')} | parado: ${c.hours_idle}h | issues: ${c.issues.join(', ')}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Robustly extract a JSON object from raw LLM text. Handles ```json fences,
 * leading/trailing prose, and finds the largest balanced {...} block.
 */
function extractJSON(text) {
  if (!text) return null;
  let raw = String(text).trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{');
  if (first < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = first; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(raw.slice(first, i + 1)); } catch { break; }
      }
    }
  }
  const last = raw.lastIndexOf('}');
  if (last > first) { try { return JSON.parse(raw.slice(first, last + 1)); } catch {} }
  return null;
}


const BRAIN_SYSTEM_PROMPT = `Você é o **Gerente IA da Equipe de Vendas**, atuando como supervisor experiente.

Sua missão: analisar os dados consolidados de kanbans (CRM, Homologação, Licitação), vendedores e cards problemáticos, e produzir um diagnóstico executivo prático e acionável - como um gerente de verdade faria ao revisar a operação.

Princípios:
- Seja DIRETO, OBJETIVO e ACIONÁVEL. Nada de generalidades vazias.
- Use NÚMEROS dos dados fornecidos. Cite vendedores e cards específicos quando relevante.
- Identifique GARGALOS, PADRÕES de risco e OPORTUNIDADES.
- Sugira AÇÕES CONCRETAS que o gestor pode executar hoje.
- Classifique severidade com honestidade (não infle nem minimize).
- Fale em pt-BR, tom profissional mas humano.

Você DEVE responder em JSON estrito no formato:
{
  "executive_summary": "2-4 frases resumindo a saúde geral da operação",
  "health_score": 0-100,
  "trend": "improving" | "stable" | "declining",
  "trend_explanation": "1-2 frases",
  "diagnostics": [
    {
      "title": "Título curto do problema (ex.: Gargalo na etapa Negociação)",
      "severity": "critical" | "high" | "medium" | "low",
      "kanban_name": "nome do kanban afetado, ou 'Geral'",
      "description": "o que está acontecendo, com números",
      "root_cause": "causa-raiz provável",
      "recommended_actions": ["ação 1", "ação 2", "..."],
      "expected_impact": "o que melhora se a ação for tomada"
    }
  ],
  "team_insights": [
    { "user_name": "...", "observation": "...", "suggestion": "..." }
  ],
  "priority_actions": ["ação prioritária 1 do dia/semana", "..."],
  "opportunities": ["oportunidade 1", "..."]
}

Sempre que houver dados suficientes, produza pelo menos 2 diagnósticos. Coloque critical/high primeiro.`;

/**
 * Run the AI brain analysis on a snapshot.
 */
export async function runBrainAnalysis({ aiConfig, analysis, context }) {
  const snapshot = buildAnalysisSnapshot(analysis);
  const sysPrompt = (aiConfig.systemPromptBase ? aiConfig.systemPromptBase + '\n\n---\n\n' : '') + BRAIN_SYSTEM_PROMPT;
  const userPrompt = `${context ? `CONTEXTO ADICIONAL: ${context}\n\n` : ''}DADOS CONSOLIDADOS:\n\n${snapshot}\n\nProduza o diagnóstico em JSON estrito conforme o schema definido.`;




  const result = await callAI(aiConfig, [
    { role: 'system', content: sysPrompt },
    { role: 'user', content: userPrompt },
  ], {
    temperature: aiConfig.temperature ?? 0.4,
    maxTokens: aiConfig.maxTokens ?? 2500,
    responseFormat: { type: 'json_object' },
  });

  const parsed = extractJSON(result.content) || {
    executive_summary: 'Falha ao interpretar resposta da IA. Tente novamente.',
    health_score: 50,
    trend: 'stable',
    trend_explanation: '',
    diagnostics: [],
    team_insights: [],
    priority_actions: [],
    opportunities: [],
    _raw: (result.content || '').slice(0, 2000),
  };
  if (!parsed.executive_summary) {
    logError('supervisor_ia.brain.parse_failed', new Error('no executive_summary'), { raw: result.content?.slice(0, 500) });
  }

  return { insight: parsed, tokensUsed: result.tokensUsed || 0, model: result.model || aiConfig.model };
}

/**
 * Run a chat turn with the supervisor brain. Includes the latest analysis snapshot.
 */
export async function runBrainChat({ aiConfig, analysis, history, userMessage }) {
  const snapshot = buildAnalysisSnapshot(analysis);
  const sysPrompt = (aiConfig.systemPromptBase ? aiConfig.systemPromptBase + '\n\n---\n\n' : '') +
`Você é o **Gerente IA da Equipe de Vendas**. Está conversando com o gestor.
Tem acesso ao snapshot atual da operação (cards, vendedores, kanbans).
Seja direto, use os dados, cite números, recomende ações concretas. Responda em pt-BR, conciso (no máx. 6 parágrafos curtos), em markdown leve.

SNAPSHOT ATUAL:
${snapshot}`;

  const messages = [{ role: 'system', content: sysPrompt }];
  for (const m of (history || []).slice(-10)) {
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userMessage });

  const result = await callAI(aiConfig, messages, {
    temperature: aiConfig.temperature ?? 0.5,
    maxTokens: 1200,
  });
  return { content: result.content || '', tokensUsed: result.tokensUsed || 0, model: result.model };
}

/**
 * Format a WhatsApp alert message from a brain insight (critical/high only).
 */
export function formatWhatsappAlert(insight, orgName) {
  const critical = (insight.diagnostics || []).filter(d => ['critical', 'high'].includes(d.severity));
  if (!critical.length && (insight.priority_actions || []).length === 0) return null;

  const lines = [];
  lines.push(`🧠 *Supervisor IA — Alerta${orgName ? ` (${orgName})` : ''}*`);
  if (insight.executive_summary) {
    lines.push('');
    lines.push(insight.executive_summary);
  }
  if (typeof insight.health_score === 'number') {
    lines.push('');
    lines.push(`*Saúde da operação:* ${insight.health_score}/100  •  *Tendência:* ${insight.trend || 'stable'}`);
  }
  if (critical.length) {
    lines.push('');
    lines.push('*⚠ Diagnósticos críticos:*');
    for (const d of critical.slice(0, 4)) {
      const sevTag = d.severity === 'critical' ? '🔴' : '🟠';
      lines.push(`${sevTag} *${d.title}* (${d.kanban_name})`);
      lines.push(`   _${d.description}_`);
      if (d.recommended_actions?.length) {
        lines.push(`   → ${d.recommended_actions.slice(0, 2).join(' | ')}`);
      }
    }
  }
  if (insight.priority_actions?.length) {
    lines.push('');
    lines.push('*🎯 Ações prioritárias:*');
    insight.priority_actions.slice(0, 5).forEach((a, i) => lines.push(`${i + 1}. ${a}`));
  }
  lines.push('');
  lines.push('_Abra o Supervisor IA no sistema para detalhes completos._');
  return lines.join('\n');
}

logInfo('supervisor_ia_brain.module_loaded', {});
