import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_URL, getAuthToken } from "@/lib/api";
import { toast } from "sonner";

export interface Prospect {
  id: string;
  name: string;
  phone: string;
  source?: string;
  converted_at?: string;
  converted_deal_id?: string;
  created_at: string;
}

async function fetchProspects(): Promise<Prospect[]> {
  const res = await fetch(`${API_URL}/api/crm/prospects`, {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) throw new Error("Failed to fetch prospects");
  return res.json();
}

async function createProspect(data: { name: string; phone: string; source?: string }): Promise<Prospect> {
  const res = await fetch(`${API_URL}/api/crm/prospects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to create prospect");
  }
  return res.json();
}

async function bulkCreateProspects(prospects: Array<{ name: string; phone: string; source?: string }>): Promise<{ created: number; duplicates: number }> {
  const res = await fetch(`${API_URL}/api/crm/prospects/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ prospects }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to import prospects");
  }
  return res.json();
}

async function deleteProspect(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/crm/prospects/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });
  if (!res.ok) throw new Error("Failed to delete prospect");
}

async function bulkDelete(ids: string[]): Promise<void> {
  const res = await fetch(`${API_URL}/api/crm/prospects/bulk-delete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error("Failed to delete prospects");
}

async function convertToDeal(data: { prospect_id: string; funnel_id: string; title?: string }): Promise<{ deal_id: string }> {
  const res = await fetch(`${API_URL}/api/crm/prospects/${data.prospect_id}/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ funnel_id: data.funnel_id, title: data.title }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || "Failed to convert prospect");
  }
  return res.json();
}

export function useProspects() {
  const queryClient = useQueryClient();

  const { data: prospects = [], isLoading, error } = useQuery({
    queryKey: ["crm-prospects"],
    queryFn: fetchProspects,
  });

  const createMutation = useMutation({
    mutationFn: createProspect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-prospects"] });
      toast.success("Prospect criado com sucesso");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: bulkCreateProspects,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["crm-prospects"] });
      toast.success(`${data.created} prospects importados. ${data.duplicates} duplicados ignorados.`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProspect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-prospects"] });
      toast.success("Prospect excluído");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDelete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-prospects"] });
      toast.success("Prospects excluídos");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const convertMutation = useMutation({
    mutationFn: convertToDeal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
      toast.success("Prospect convertido para negociação!");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return {
    prospects,
    isLoading,
    error,
    createProspect: createMutation,
    bulkCreate: bulkCreateMutation,
    deleteProspect: deleteMutation,
    bulkDelete: bulkDeleteMutation,
    convertToDeal: convertMutation,
  };
}
