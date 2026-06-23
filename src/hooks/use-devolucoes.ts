import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export type DevolucaoStatus =
  | 'solicitado' | 'aguardando_nf_produto' | 'recebido' | 'em_analise' | 'cliente_notificado'
  | 'aguardando_nf_retorno' | 'troca_conserto' | 'enviado' | 'concluido' | 'recusado' | 'cancelado';

export interface DevolucaoItem {
  id: string;
  devolucao_id: string;
  sku?: string;
  product_name: string;
  quantity: number;
  serial_number?: string;
  unit_value?: number;
  notes?: string;
  created_at: string;
}

export interface DevolucaoAnexo {
  id: string;
  category: 'foto' | 'nf_entrada' | 'nf_saida' | 'laudo' | 'outro';
  name?: string;
  url: string;
  mimetype?: string;
  size?: number;
  uploaded_by_name?: string;
  created_at: string;
}

export interface DevolucaoEvento {
  id: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  message?: string;
  metadata?: any;
  user_name?: string;
  created_at: string;
}

export interface Devolucao {
  id: string;
  organization_id: string;
  numero: number;
  contact_id?: string;
  contact_name?: string;
  deal_id?: string;
  customer_name: string;
  customer_document?: string;
  customer_whatsapp?: string;
  customer_email?: string;
  customer_address?: string;
  opened_channel: string;
  seller_user_id?: string;
  seller_name?: string;
  created_by?: string;
  created_by_name?: string;
  status: DevolucaoStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  reason: string;
  description?: string;
  original_order_number?: string;
  original_invoice_number?: string;
  original_invoice_date?: string;
  inbound_invoice_number?: string;
  inbound_invoice_key?: string;
  inbound_invoice_date?: string;
  inbound_invoice_value?: number;
  received_at?: string;
  received_by?: string;
  received_by_name?: string;
  analysis_status?: string;
  analysis_decision?: string;
  analysis_report?: string;
  analyzed_at?: string;
  analyzed_by_name?: string;
  customer_notified_at?: string;
  customer_notification_channel?: string;
  customer_notification_notes?: string;
  outbound_invoice_number?: string;
  outbound_invoice_date?: string;
  outbound_invoice_value?: number;
  outbound_tracking_code?: string;
  outbound_carrier?: string;
  outbound_sent_at?: string;
  inbound_carrier?: string;
  inbound_tracking_code?: string;
  inbound_freight_cost?: number;
  inbound_freight_status?: string;
  outbound_freight_cost?: number;
  outbound_freight_status?: string;
  resolution_summary?: string;
  closed_at?: string;
  closed_by_name?: string;
  total_freight_cost?: number;
  item_count?: number;
  attachment_count?: number;
  itens?: DevolucaoItem[];
  anexos?: DevolucaoAnexo[];
  eventos?: DevolucaoEvento[];
  created_at: string;
  updated_at: string;
}

export interface DevolucaoFilters {
  search?: string;
  status?: string;
  seller?: string;
  reason?: string;
  date_from?: string;
  date_to?: string;
  only_mine?: boolean;
}

export function useDevolucoes(filters?: DevolucaoFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.seller) params.set('seller', filters.seller);
  if (filters?.reason) params.set('reason', filters.reason);
  if (filters?.date_from) params.set('date_from', filters.date_from);
  if (filters?.date_to) params.set('date_to', filters.date_to);
  if (filters?.only_mine) params.set('only_mine', '1');
  const qs = params.toString();
  return useQuery<Devolucao[]>({
    queryKey: ['devolucoes', filters],
    queryFn: () => api(`/api/devolucoes${qs ? `?${qs}` : ''}`),
  });
}

export function useDevolucao(id: string | null) {
  return useQuery<Devolucao>({
    queryKey: ['devolucao', id],
    queryFn: () => api(`/api/devolucoes/${id}`),
    enabled: !!id,
  });
}

export function useDevolucoesStats() {
  return useQuery<{
    total: number; open_count: number; in_analysis: number; waiting_nf: number;
    closed_this_month: number; freight_cost_month: number; freight_cost_total: number;
  }>({
    queryKey: ['devolucoes-stats'],
    queryFn: () => api('/api/devolucoes/stats'),
  });
}

export function useDevolucaoSlaConfig() {
  return useQuery<Record<string, number>>({
    queryKey: ['devolucao-sla-config'],
    queryFn: () => api('/api/devolucoes/sla-config'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDevolucaoSlaConfigMutations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, number>) =>
      api('/api/devolucoes/sla-config', { method: 'PUT', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['devolucao-sla-config'] });
      toast.success('SLA atualizado!');
    },
    onError: (error: any) => toast.error(error.message || 'Erro ao salvar SLA'),
  });
}

export function useDevolucaoMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ['devolucoes'] });
    qc.invalidateQueries({ queryKey: ['devolucao'] });
    qc.invalidateQueries({ queryKey: ['devolucoes-stats'] });
  };
  const create = useMutation({
    mutationFn: (data: any) => api('/api/devolucoes', { method: 'POST', body: data }),
    onSuccess: () => { inv(); toast.success('Devolução aberta!'); },
  });
  const update = useMutation({
    mutationFn: ({ id, _silent, ...data }: any) => api(`/api/devolucoes/${id}`, { method: 'PUT', body: data }),
    onSuccess: (resp: any, vars: any) => {
      // Atualiza cache do detalhe sem refetch (evita "piscar" durante digitação)
      if (resp && vars?.id) {
        qc.setQueryData(['devolucao', vars.id], (old: any) => ({ ...(old || {}), ...resp }));
      }
      qc.invalidateQueries({ queryKey: ['devolucoes'] });
      qc.invalidateQueries({ queryKey: ['devolucoes-stats'] });
      if (!vars?._silent) toast.success('Devolução atualizada!');
    },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: DevolucaoStatus; note?: string }) =>
      api(`/api/devolucoes/${id}/status`, { method: 'PATCH', body: { status, note } }),
    onSuccess: () => { inv(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/devolucoes/${id}`, { method: 'DELETE' }),
    onSuccess: () => { inv(); toast.success('Devolução excluída'); },
  });
  return { create, update, changeStatus, remove };
}

export function useDevolucaoItemMutations() {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: ({ devolucaoId, ...data }: any) => api(`/api/devolucoes/${devolucaoId}/itens`, { method: 'POST', body: data }),
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['devolucao', v.devolucaoId] }),
  });
  const remove = useMutation({
    mutationFn: ({ itemId, devolucaoId }: { itemId: string; devolucaoId: string }) =>
      api(`/api/devolucoes/itens/${itemId}`, { method: 'DELETE' }),
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['devolucao', v.devolucaoId] }),
  });
  return { create, remove };
}

export function useDevolucaoAnexoMutations() {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: ({ devolucaoId, ...data }: any) => api(`/api/devolucoes/${devolucaoId}/anexos`, { method: 'POST', body: data }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ['devolucao', v.devolucaoId] }); toast.success('Anexo adicionado'); },
  });
  const remove = useMutation({
    mutationFn: ({ attId, devolucaoId }: { attId: string; devolucaoId: string }) =>
      api(`/api/devolucoes/anexos/${attId}`, { method: 'DELETE' }),
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['devolucao', v.devolucaoId] }),
  });
  return { create, remove };
}

export function useDevolucaoEventoMutations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ devolucaoId, ...data }: { devolucaoId: string; event_type?: string; message: string }) =>
      api(`/api/devolucoes/${devolucaoId}/eventos`, { method: 'POST', body: data }),
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['devolucao', v.devolucaoId] }),
  });
}

export const STATUS_LABELS: Record<DevolucaoStatus, string> = {
  solicitado: 'Solicitado',
  aguardando_nf_produto: 'Aguardando NF/Produto',
  recebido: 'Recebido',
  em_analise: 'Em Análise',
  cliente_notificado: 'Cliente Notificado',
  aguardando_nf_retorno: 'Aguardando NF Retorno',
  troca_conserto: 'Troca/Conserto',
  enviado: 'Enviado',
  concluido: 'Concluído',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
};

export const STATUS_ORDER: DevolucaoStatus[] = [
  'solicitado','aguardando_nf_produto','recebido','em_analise','cliente_notificado',
  'aguardando_nf_retorno','troca_conserto','enviado','concluido'
];

export const REASON_LABELS: Record<string, string> = {
  defeito: 'Defeito',
  arrependimento: 'Arrependimento',
  erro_envio: 'Erro de envio',
  garantia: 'Garantia',
  avaria_transporte: 'Avaria no transporte',
  outro: 'Outro',
};
