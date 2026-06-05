import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export type IndicatorType = "parceiro" | "representante" | "indicador" | "instalador";

export interface IndicatorArea {
  id?: string;
  city?: string;
  state?: string;
  lat?: number | null;
  lng?: number | null;
  radius_km: number;
}

export interface Representative {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf_cnpj?: string;
  city?: string;
  state?: string;
  address?: string;
  zip_code?: string;
  commission_percent: number;
  notes?: string;
  is_active: boolean;
  linked_user_id?: string;
  linked_user_name?: string;
  indicator_type?: IndicatorType;
  segment_ids?: string[];
  areas?: IndicatorArea[];
  areas_count?: number;
  source?: string | null;
  created_at: string;
  open_deals_count?: number;
  open_deals_value?: number;
  last_interaction_at?: string;
}


export interface RepresentativeDashboard {
  commission_percent: number;
  total_commission: number;
  potential_commission: number;
  open_deals: number;
  open_value: number;
  won_deals: number;
  won_value: number;
  lost_deals: number;
  lost_value: number;
  loss_reasons: { reason: string; count: number }[];
}

export interface IndicatorSegment {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
}

export function useRepresentatives(search?: string, type?: string, ownerId?: string, source?: string) {
  return useQuery({
    queryKey: ["crm-representatives", search, type, ownerId, source],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (type && type !== "all") params.set("type", type);
      if (ownerId && ownerId !== "all") params.set("owner_id", ownerId);
      if (source && source !== "all") params.set("source", source);
      const qs = params.toString();
      return api<Representative[]>(`/api/crm/representatives${qs ? `?${qs}` : ""}`);
    },
  });
}


export function useRepresentative(id: string | null) {
  return useQuery({
    queryKey: ["crm-representative", id],
    queryFn: async () => {
      if (!id) return null;
      return api<Representative>(`/api/crm/representatives/${id}`);
    },
    enabled: !!id,
  });
}

export function useRepresentativeDashboard(id: string | null, startDate?: string, endDate?: string) {
  return useQuery({
    queryKey: ["crm-representative-dashboard", id, startDate, endDate],
    queryFn: async () => {
      if (!id) return null;
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      const qs = params.toString();
      return api<RepresentativeDashboard>(`/api/crm/representatives/${id}/dashboard${qs ? `?${qs}` : ""}`);
    },
    enabled: !!id,
  });
}

export interface RepresentativeDeal {
  id: string;
  title: string;
  value: number;
  status: string;
  created_at: string;
  expected_close_date?: string;
  stage_id?: string;
  stage_name?: string;
  stage_color?: string;
  company_id?: string;
  company_name?: string;
  funnel_id?: string;
}

export function useRepresentativeDeals(id: string | null, startDate?: string, endDate?: string, status?: string) {
  return useQuery({
    queryKey: ["crm-representative-deals", id, startDate, endDate, status],
    queryFn: async () => {
      if (!id) return [];
      const params = new URLSearchParams();
      if (startDate) params.append("start_date", startDate);
      if (endDate) params.append("end_date", endDate);
      if (status) params.append("status", status);
      const qs = params.toString();
      return api<RepresentativeDeal[]>(`/api/crm/representatives/${id}/deals${qs ? `?${qs}` : ""}`);
    },
    enabled: !!id,
  });
}

export function useRepresentativesForDeal() {
  return useQuery({
    queryKey: ["crm-representatives-for-deal"],
    queryFn: async () => {
      return api<Representative[]>("/api/crm/representatives/for-deal");
    },
  });
}

export function useRepresentativeMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createRepresentative = useMutation({
    mutationFn: async (data: Partial<Representative>) => {
      return api<Representative>("/api/crm/representatives", { method: "POST", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-representatives"] });
      queryClient.invalidateQueries({ queryKey: ["crm-map-data"] });
      toast({ title: "Indicador criado com sucesso" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao criar indicador", description: err?.message || "Tente novamente", variant: "destructive" });
    },
  });


  const updateRepresentative = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Representative> & { id: string }) => {
      return api<Representative>(`/api/crm/representatives/${id}`, { method: "PUT", body: data });
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["crm-representatives"] });
      queryClient.invalidateQueries({ queryKey: ["crm-representative", vars.id] });
      queryClient.invalidateQueries({ queryKey: ["crm-map-data"] });
      toast({ title: "Indicador atualizado" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao atualizar indicador", description: err?.message || "Tente novamente", variant: "destructive" });
    },
  });


  const deleteRepresentative = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/crm/representatives/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-representatives"] });
      queryClient.invalidateQueries({ queryKey: ["crm-map-data"] });
      toast({ title: "Indicador excluído" });
    },
  });

  return { createRepresentative, updateRepresentative, deleteRepresentative };
}

// ============== CONTACTS / HISTORY ==============
export interface IndicatorHistory {
  id: string;
  indicator_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

export function useIndicatorHistory(indicatorId: string | null) {
  return useQuery({
    queryKey: ["crm-indicator-history", indicatorId],
    queryFn: async () => {
      if (!indicatorId) return [];
      try {
        return await api<IndicatorHistory[]>(`/api/crm/representatives/${indicatorId}/history`);
      } catch (error) {
        console.error("Error fetching indicator history:", error);
        return [];
      }
    },
    enabled: !!indicatorId,
  });
}

export function useIndicatorHistoryMutations() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const createHistory = useMutation({
    mutationFn: ({ indicatorId, content }: { indicatorId: string; content: string }) =>
      api<IndicatorHistory>(`/api/crm/representatives/${indicatorId}/history`, { method: "POST", body: { content } }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-indicator-history", vars.indicatorId] });
      qc.invalidateQueries({ queryKey: ["crm-representatives"] });
    },
  });

  const deleteHistory = useMutation({
    mutationFn: async ({ indicatorId, historyId }: { indicatorId: string; historyId: string }) => {
      // O backend segue a estrutura /api/crm/representatives/:id/history/:historyId
      // ou /api/crm/indicators/:id/history/:historyId conforme o tipo.
      // Adicionando caminhos baseados em logs de erro para cobrir todas as possibilidades.
      const attempts = [
        { path: `/api/crm/representatives/${indicatorId}/history/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/indicators/${indicatorId}/history/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/history/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/indicators/history/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/representatives/history/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/representatives/${indicatorId}/interactions/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/indicators/${indicatorId}/interactions/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/interactions/${historyId}`, method: "DELETE" as const },
        { path: `/api/crm/representatives/${indicatorId}/history/delete/${historyId}`, method: "POST" as const },
        { path: `/api/crm/indicators/${indicatorId}/history/delete/${historyId}`, method: "POST" as const },
        { path: `/api/crm/history/delete/${historyId}`, method: "POST" as const },
        { path: `/api/crm/representatives/${indicatorId}/interactions/delete/${historyId}`, method: "POST" as const },
        { path: `/api/crm/interactions/delete/${historyId}`, method: "POST" as const },
      ];

      let lastError: any = null;
      let success = false;

      for (const attempt of attempts) {
        try {
          console.log(`[useIndicatorHistoryMutations] Tentando excluir via: ${attempt.method} ${attempt.path}`);
          await api<void>(attempt.path, { method: attempt.method });
          success = true;
          console.log(`[useIndicatorHistoryMutations] Sucesso ao excluir via: ${attempt.method} ${attempt.path}`);
          break;
        } catch (error: any) {
          lastError = error;
          // Se for 404 (Não encontrado) ou 405 (Método não permitido), tentamos a próxima rota.
          // O status 502/504 ou erros de rede devem interromper a tentativa.
          if (error.status !== 404 && error.status !== 405) {
            console.error(`[useIndicatorHistoryMutations] Erro fatal (status ${error.status}) em ${attempt.method} ${attempt.path}:`, error);
            break;
          }
          console.warn(`[useIndicatorHistoryMutations] Rota falhou (${error.status}): ${attempt.method} ${attempt.path}`);
        }
      }
      
      if (!success) throw lastError;
      return;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["crm-indicator-history", vars.indicatorId] });
      toast({ title: "Histórico excluído com sucesso" });
    },
  });

  return { createHistory, deleteHistory };
}


export interface ChatContact {
  id: string;
  name: string | null;
  phone: string | null;
  jid: string | null;
  connection_id: string;
  connection_name: string | null;
}

export function useIndicatorContacts() {
  return useQuery({
    queryKey: ["chat-contacts"],
    queryFn: () => api<ChatContact[]>("/api/chat/contacts"),
  });
}

export interface ScheduledMessage {
  id: string;
  phone: string;
  content: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
}

export function useScheduledMessagesByPhone(phone?: string) {
  return useQuery({
    queryKey: ["scheduled-messages", phone],
    queryFn: () => {
      if (!phone) return [];
      return api<ScheduledMessage[]>(`/api/chat/scheduled-messages-by-phone?phone=${encodeURIComponent(phone)}`);
    },
    enabled: !!phone,
  });
}

export function useCreateScheduledMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { phone: string; content: string; scheduled_at: string }) =>
      api<ScheduledMessage>("/api/chat/scheduled-messages", { method: "POST", body: data }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["scheduled-messages", vars.phone] });
    },
  });
}

// ============== SEGMENTS ==============
export function useIndicatorSegments() {
  return useQuery({
    queryKey: ["crm-indicator-segments"],
    queryFn: () => api<IndicatorSegment[]>("/api/crm/indicator-segments"),
  });
}

export function useIndicatorSegmentMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["crm-indicator-segments"] });

  const create = useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      api<IndicatorSegment>("/api/crm/indicator-segments", { method: "POST", body: data }),
    onSuccess: () => { invalidate(); toast({ title: "Segmento criado" }); },
  });
  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<IndicatorSegment> & { id: string }) =>
      api<IndicatorSegment>(`/api/crm/indicator-segments/${id}`, { method: "PUT", body: data }),
    onSuccess: () => { invalidate(); toast({ title: "Segmento atualizado" }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/crm/indicator-segments/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Segmento excluído" }); },
  });
  return { create, update, remove };
}

// ============== INDICATOR SOURCES (origens) ==============
export interface IndicatorSource { id: string; name: string; }

export function useIndicatorSources() {
  return useQuery({
    queryKey: ["crm-indicator-sources"],
    queryFn: () => api<IndicatorSource[]>("/api/crm/indicator-sources"),
  });
}

export function useIndicatorSourceMutations() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["crm-indicator-sources"] });

  const create = useMutation({
    mutationFn: (name: string) =>
      api<IndicatorSource>("/api/crm/indicator-sources", { method: "POST", body: { name } }),
    onSuccess: () => { invalidate(); toast({ title: "Origem adicionada" }); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<void>(`/api/crm/indicator-sources/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Origem excluída" }); },
  });
  return { create, remove };
}
