import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface SalesPosition {
  id: string;
  name: string;
  current_user_id: string | null;
  current_user_name: string | null;
  current_user_email: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

export function useSalesPositions() {
  return useQuery({
    queryKey: ["crm-sales-positions"],
    queryFn: () => api<SalesPosition[]>("/api/crm/sales-positions"),
  });
}

export function useCRMOrgMembers() {
  return useQuery({
    queryKey: ["crm-org-members"],
    queryFn: () => api<OrgMember[]>("/api/crm/org-members"),
  });
}

export function useSalesPositionMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (data: { name: string; current_user_id?: string }) =>
      api("/api/crm/sales-positions", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-sales-positions"] });
      toast.success("Posição criada!");
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; current_user_id?: string | null; is_active?: boolean }) =>
      api(`/api/crm/sales-positions/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-sales-positions"] });
      qc.invalidateQueries({ queryKey: ["crm-companies"] });
      toast.success("Posição atualizada!");
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/crm/sales-positions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-sales-positions"] });
      toast.success("Posição excluída!");
    },
  });

  return { create, update, remove };
}
