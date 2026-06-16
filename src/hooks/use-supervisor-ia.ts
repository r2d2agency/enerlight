import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface SupervisorIAConfig {
  funnel_ids: string[];
  homologation_board_ids: string[];
  licitacao_board_ids: string[];
  group_ids: string[];
  user_ids: string[];
  representative_ids: string[];
  rule_require_company: boolean;
  rule_require_value: boolean;
  rule_require_owner: boolean;
  rule_require_contact: boolean;
  rule_require_followup: boolean;
  rule_require_history: boolean;
  rule_company_stage_ids: string[];
  rule_value_stage_ids: string[];
  rule_owner_stage_ids: string[];
  rule_contact_stage_ids: string[];
  rule_followup_stage_ids: string[];
  rule_history_stage_ids: string[];
  stale_hours: number;
  // Cérebro IA
  ai_agent_id: string | null;
  auto_analysis_enabled: boolean;
  auto_analysis_interval_hours: number;
  alert_whatsapp_numbers: string[];
  alert_whatsapp_connection_id: string | null;
  analysis_period_days: number;
  organizer_enabled: boolean;
  organizer_stale_to_next_enabled: boolean;
  organizer_stale_to_next_hours: number;
  organizer_dead_to_lost_enabled: boolean;
  organizer_dead_to_lost_hours: number;
  organizer_round_robin_enabled: boolean;
  organizer_notify_missing_enabled: boolean;
  organizer_auto_value_threshold: number;
  organizer_last_run_at: string | null;
  last_auto_analysis_at: string | null;
}

export interface OrganizerAction {
  id: string;
  rule: 'stale_to_next' | 'dead_to_lost' | 'unassigned_round_robin' | 'notify_missing_data';
  severity: 'low' | 'high';
  status: 'suggested' | 'auto_applied' | 'applied' | 'rejected' | 'failed';
  deal_id: string | null;
  deal_title: string | null;
  funnel_name: string | null;
  from_stage_name: string | null;
  to_stage_name: string | null;
  to_owner_name: string | null;
  reason: string | null;
  error: string | null;
  created_at: string;
  applied_at: string | null;
}


export interface ScopeOptions {
  funnels: { id: string; name: string; color?: string }[];
  stages: { id: string; name: string; funnel_id: string; position?: number }[];
  groups: { id: string; name: string }[];
  users: { id: string; name: string; email?: string }[];
  representatives: { id: string; name: string }[];
  homologation_boards: { id: string; name: string }[];
  licitacao_boards: { id: string; name: string }[];
  ai_agents: { id: string; name: string }[];
  connections: { id: string; name: string }[];
}

export interface SupervisorIAAnalysis {
  period: { start_date: string; end_date: string; stale_hours: number };
  summary: {
    total_deals_created: number;
    total_companies_created: number;
    total_incomplete: number;
    total_stale: number;
    total_without_followup: number;
    total_without_history: number;
  };
  deals_by_owner: { owner_id: string; owner_name: string; deals_created: number; total_value: number }[];
  new_companies_by_user: { created_by: string; created_by_name: string; companies_created: number }[];
  diagnostics: {
    kind: 'crm_funnel' | 'homologation_board' | 'licitacao_board';
    id: string;
    name: string;
    color?: string;
    total: number;
    incomplete: number;
    without_followup: number;
    without_history: number;
    stale: number;
    problem_cards: {
      id: string;
      title: string;
      stage_name?: string;
      owner_name?: string;
      company_name?: string;
      value: number;
      hours_idle: number;
      issues: string[];
    }[];
  }[];
}

export interface BrainInsight {
  executive_summary: string;
  health_score: number;
  trend: 'improving' | 'stable' | 'declining';
  trend_explanation: string;
  diagnostics: {
    title: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    kanban_name: string;
    description: string;
    root_cause: string;
    recommended_actions: string[];
    expected_impact: string;
  }[];
  team_insights: { user_name: string; observation: string; suggestion: string }[];
  priority_actions: string[];
  opportunities: string[];
}

export interface BrainInsightRecord {
  id: string;
  trigger: string;
  period_start: string;
  period_end: string;
  insight: BrainInsight;
  tokens_used: number;
  model: string;
  alerted_at: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function useSupervisorIAConfig() {
  return useQuery({
    queryKey: ['supervisor-ia', 'config'],
    queryFn: () => api<SupervisorIAConfig>('/api/supervisor-ia/config'),
  });
}

export function useSupervisorIAScopeOptions() {
  return useQuery({
    queryKey: ['supervisor-ia', 'scope-options'],
    queryFn: () => api<ScopeOptions>('/api/supervisor-ia/scope-options'),
  });
}

export function useSupervisorIAUpdateConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cfg: Partial<SupervisorIAConfig>) =>
      api<SupervisorIAConfig>('/api/supervisor-ia/config', { method: 'PUT', body: cfg }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisor-ia'] });
      toast.success('Configuração do Supervisor IA salva');
    },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });
}

export function useSupervisorIAAnalysis(params: { startDate: string; endDate: string; enabled?: boolean }) {
  const sp = new URLSearchParams();
  sp.set('start_date', params.startDate);
  sp.set('end_date', params.endDate);
  return useQuery({
    queryKey: ['supervisor-ia', 'analysis', params.startDate, params.endDate],
    queryFn: () => api<SupervisorIAAnalysis>(`/api/supervisor-ia/analysis?${sp}`),
    enabled: params.enabled !== false,
  });
}

// ---- Cérebro IA ----
export function useBrainInsights() {
  return useQuery({
    queryKey: ['supervisor-ia', 'insights'],
    queryFn: () => api<BrainInsightRecord[]>('/api/supervisor-ia/insights?limit=30'),
  });
}

export function useRunBrainAnalysis() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: { context?: string; period_days?: number }) =>
      api<BrainInsightRecord>('/api/supervisor-ia/brain/analyze', { method: 'POST', body: body || {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisor-ia', 'insights'] });
      toast.success('Cérebro IA gerou uma nova análise');
    },
    onError: (e: Error) => toast.error(`Erro ao analisar: ${e.message}`),
  });
}

export function useDeleteInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/supervisor-ia/insights/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supervisor-ia', 'insights'] }),
  });
}

export function useBrainChatHistory() {
  return useQuery({
    queryKey: ['supervisor-ia', 'chat'],
    queryFn: () => api<ChatMessage[]>('/api/supervisor-ia/chat'),
  });
}

export function useBrainChatSend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) =>
      api<ChatMessage>('/api/supervisor-ia/chat', { method: 'POST', body: { message } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supervisor-ia', 'chat'] }),
    onError: (e: Error) => toast.error(`Erro no chat: ${e.message}`),
  });
}

export function useClearBrainChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/supervisor-ia/chat', { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supervisor-ia', 'chat'] }),
  });
}
