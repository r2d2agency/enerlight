import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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
  created_at: string;
  // Stats (from list endpoint)
  open_deals_count?: number;
  open_deals_value?: number;
}

export interface RepresentativeDashboard {
  total_commission: number;
  open_deals: number;
  open_value: number;
  won_deals: number;
  won_value: number;
  lost_deals: number;
  lost_value: number;
  loss_reasons: { reason: string; count: number }[];
}

export function useRepresentatives(search?: string) {
  return useQuery({
    queryKey: ["crm-representatives", search],
    queryFn: async () => {
      const params = search ? `?search=${encodeURIComponent(search)}` : "";
      return api<Representative[]>(`/api/crm/representatives${params}`);
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

// Representatives filtered by current user's visibility (for deal form)
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
      toast({ title: "Representante criado com sucesso" });
    },
  });

  const updateRepresentative = useMutation({
    mutationFn: async ({ id, ...data }: Partial<Representative> & { id: string }) => {
      return api<Representative>(`/api/crm/representatives/${id}`, { method: "PUT", body: data });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-representatives"] });
      toast({ title: "Representante atualizado" });
    },
  });

  const deleteRepresentative = useMutation({
    mutationFn: async (id: string) => {
      return api<void>(`/api/crm/representatives/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-representatives"] });
      toast({ title: "Representante excluído" });
    },
  });

  return { createRepresentative, updateRepresentative, deleteRepresentative };
}
