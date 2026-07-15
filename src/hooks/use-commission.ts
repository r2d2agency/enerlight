import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Tier { label: string; target: number; extra_percent: number; extra_fixed: number; }
export interface CommissionRule {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  base_percent: number;
  tiers: Tier[];
  active: boolean;
}

export interface ValidationRecord {
  id: string;
  client_name: string;
  order_number: string;
  order_value: number;
  adjusted_value: number | null;
  state: string;
  seller_name: string;
  billing_date: string;
  channel: string;
  linked_user_id: string | null;
  linked_user_name: string | null;
  validation_status: 'pending' | 'validated' | 'rejected' | null;
  validated_by: string | null;
  validated_by_name: string | null;
  validated_at: string | null;
  validation_note: string | null;
  is_refund: boolean;
}

export interface OrgUser { id: string; name: string; email: string; }

export function useValidationQueue(params: { start_date?: string; end_date?: string; status?: string; seller_name?: string; user_id?: string }) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
  return useQuery({
    queryKey: ["commission-validation", params],
    queryFn: () => api<{ records: ValidationRecord[]; stats: any[] }>(`/api/commission/validation?${sp.toString()}`),
  });
}

export function useValidationMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["commission-validation"] });
    qc.invalidateQueries({ queryKey: ["commission-summary"] });
    qc.invalidateQueries({ queryKey: ["commission-my"] });
  };
  const updateRecord = useMutation({
    mutationFn: (data: { id: string; patch: Partial<ValidationRecord> & { status?: string } }) =>
      api(`/api/commission/validation/${data.id}`, { method: "PATCH", body: data.patch }),
    onSuccess: invalidate,
  });
  const bulkStatus = useMutation({
    mutationFn: (data: { ids: string[]; status: string }) =>
      api(`/api/commission/validation/bulk`, { method: "POST", body: data }),
    onSuccess: invalidate,
  });
  return { updateRecord, bulkStatus };
}

export function useCommissionRules() {
  return useQuery({
    queryKey: ["commission-rules"],
    queryFn: () => api<CommissionRule[]>(`/api/commission/rules`),
  });
}

export function useCommissionRulesMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["commission-rules"] });
  const upsert = useMutation({
    mutationFn: (data: { user_id: string; base_percent: number; tiers: Tier[]; active: boolean }) =>
      api(`/api/commission/rules/${data.user_id}`, { method: "PUT", body: data }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (user_id: string) => api(`/api/commission/rules/${user_id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
  return { upsert, remove };
}

export function useCommissionSummary(params: { start_date?: string; end_date?: string }) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
  return useQuery({
    queryKey: ["commission-summary", params],
    queryFn: () => api<{ start_date: string; end_date: string; users: any[] }>(`/api/commission/summary?${sp.toString()}`),
  });
}

export function useMyCommission(params: { start_date?: string; end_date?: string }) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) sp.set(k, String(v)); });
  return useQuery({
    queryKey: ["commission-my", params],
    queryFn: () => api<any>(`/api/commission/my?${sp.toString()}`),
  });
}

export function useCommissionOrgUsers() {
  return useQuery({
    queryKey: ["commission-org-users"],
    queryFn: () => api<OrgUser[]>(`/api/commission/org-users`),
  });
}
