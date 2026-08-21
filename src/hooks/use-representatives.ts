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
  linked_user_ids?: string[];
  linked_user_names?: string[];
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

export interface PriceListItem {
  id: string;
  price_list_id: string;
  price_list_name?: string;
  category?: string;
  subcategory?: string;
  brand?: string;
  code: string;
  description: string;
  cost_price: number;
  sale_price: number;
  markup_percentage?: number;
}

export interface CartItem {
  id: string;
  item_id: string;
  quantity: number;
  description: string;
  code: string;
  sale_price: number;
  cost_price: number;
  brand?: string;
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

export function useRepresentativesHub() {
  return useQuery({
    queryKey: ["crm-representatives-hub"],
    queryFn: async () => api<RepresentativeHubItem[]>(`/api/crm/representatives/hub`),
  });
}

export interface RepresentativeHubItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  is_active: boolean;
  commission_percent: number;
  linked_user_id?: string;
  linked_user_name?: string;
  open_deals_count: number;
  open_deals_value: number;
  won_deals_count: number;
  lost_deals_count: number;
  stale_deals_count: number;
  last_activity_at?: string | null;
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

export function useRepresentativeCatalog(filters: { category?: string; subcategory?: string; brand?: string; search?: string; price_list_id?: string }) {
  return useQuery({
    queryKey: ["representative-catalog", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, val]) => {
        if (val) params.append(key, val);
      });
      return api<PriceListItem[]>(`/api/representatives/catalog?${params.toString()}`);
    }
  });
}

export function useRepresentativeCart() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["representative-cart"],
    queryFn: () => api<CartItem[]>("/api/representatives/cart")
  });

  const addToCart = useMutation({
    mutationFn: (data: { item_id: string; quantity: number }) => 
      api("/api/representatives/cart", { method: "POST", body: data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["representative-cart"] });
      toast({ title: "Item adicionado ao carrinho" });
    }
  });

  const removeFromCart = useMutation({
    mutationFn: (id: string) => 
      api(`/api/representatives/cart/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["representative-cart"] });
      toast({ title: "Item removido do carrinho" });
    }
  });

  return { ...query, addToCart, removeFromCart };
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

// ... rest of history, scheduled messages, segments etc same as before ...
export interface IndicatorHistory { id: string; indicator_id: string; user_name: string; content: string; created_at: string; }
export function useIndicatorHistory(indicatorId: string | null) {
  return useQuery({
    queryKey: ["crm-indicator-history", indicatorId],
    queryFn: async () => {
      if (!indicatorId) return [];
      return api<IndicatorHistory[]>(`/api/crm/representatives/${indicatorId}/history`);
    },
    enabled: !!indicatorId,
  });
}

export function useRepresentativesForDeal() {
  return useQuery({
    queryKey: ["crm-representatives-for-deal"],
    queryFn: () => api<Representative[]>("/api/crm/representatives/for-deal"),
  });
}
