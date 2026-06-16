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
  stale_hours: number;
}

export interface ScopeOptions {
  funnels: { id: string; name: string; color?: string }[];
  groups: { id: string; name: string }[];
  users: { id: string; name: string; email?: string }[];
  representatives: { id: string; name: string }[];
  homologation_boards: { id: string; name: string }[];
  licitacao_boards: { id: string; name: string }[];
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
