import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, API_URL, getAuthToken } from "@/lib/api";

export interface ERPBillingPreview {
  rows: Array<{
    client_name: string;
    order_number: string;
    order_value: number;
    state: string;
    seller_name: string;
    billing_date: string;
    order_date: string;
    channel: string;
  }>;
  sellers: string[];
  existingMappings: Array<{ seller_name: string; user_id: string; user_name: string }>;
  orgUsers: Array<{ id: string; name: string }>;
  totalValue: number;
}

export interface ERPBillingSummary {
  total: { orders: number; value: number };
  bySeller: Array<{
    seller_name: string;
    user_id: string | null;
    user_name: string | null;
    channel: string;
    order_count: number;
    total_value: number;
  }>;
  byChannel: Array<{ channel: string; order_count: number; total_value: number }>;
  timeline: Array<{ period: string; order_count: number; total_value: number }>;
  byState: Array<{ state: string; order_count: number; total_value: number }>;
}

export function useERPBillingSummary(params: { startDate?: string; endDate?: string; userId?: string }) {
  const sp = new URLSearchParams();
  if (params.startDate) sp.set("start_date", params.startDate);
  if (params.endDate) sp.set("end_date", params.endDate);
  if (params.userId) sp.set("user_id", params.userId);

  return useQuery({
    queryKey: ["erp-billing-summary", params],
    queryFn: () => api<ERPBillingSummary>(`/api/erp-billing/summary?${sp.toString()}`),
  });
}

export function useERPBillingRecords(params: { startDate?: string; endDate?: string; sellerName?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.startDate) sp.set("start_date", params.startDate);
  if (params.endDate) sp.set("end_date", params.endDate);
  if (params.sellerName) sp.set("seller_name", params.sellerName);
  if (params.page) sp.set("page", String(params.page));

  return useQuery({
    queryKey: ["erp-billing-records", params],
    queryFn: () => api<{ records: any[]; total: number; page: number; totalPages: number }>(`/api/erp-billing/records?${sp.toString()}`),
  });
}

export function useERPBillingImports() {
  return useQuery({
    queryKey: ["erp-billing-imports"],
    queryFn: () => api<any[]>(`/api/erp-billing/imports`),
  });
}

export function useERPBillingMutations() {
  const qc = useQueryClient();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["erp-billing"] });
    qc.invalidateQueries({ queryKey: ["erp-billing-summary"] });
    qc.invalidateQueries({ queryKey: ["erp-billing-records"] });
    qc.invalidateQueries({ queryKey: ["erp-billing-imports"] });
  };

  const previewFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const token = getAuthToken();
      const resp = await fetch(`${API_URL}/api/erp-billing/preview`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro ao processar arquivo" }));
        throw new Error(err.error || "Erro ao processar arquivo");
      }
      return resp.json() as Promise<ERPBillingPreview>;
    },
  });

  const importRecords = useMutation({
    mutationFn: (data: { rows: any[]; sellerMapping: Record<string, string> }) =>
      api<{ imported: number; skipped: number; batchId: string }>("/api/erp-billing/import", {
        method: "POST",
        body: data,
      }),
    onSuccess: invalidateAll,
  });

  const deleteBatch = useMutation({
    mutationFn: (batchId: string) =>
      api(`/api/erp-billing/batch/${batchId}`, { method: "DELETE" }),
    onSuccess: invalidateAll,
  });

  const deleteRecord = useMutation({
    mutationFn: (recordId: string) =>
      api(`/api/erp-billing/records/${recordId}`, { method: "DELETE" }),
    onSuccess: invalidateAll,
  });

  const dedup = useMutation({
    mutationFn: () =>
      api<{ removed: number }>("/api/erp-billing/dedup", { method: "POST" }),
    onSuccess: invalidateAll,
  });

  return { previewFile, importRecords, deleteBatch, deleteRecord, dedup };
}
