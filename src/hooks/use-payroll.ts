import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface PayrollConfig {
  organization_id: string;
  manager_user_id: string | null;
  ceo_user_id: string | null;
  finance_user_id: string | null;
}

export interface PayrollPeriod {
  id: string;
  reference_month: string;
  status: string;
  notes: string | null;
  created_by: string | null;
  paid_at: string | null;
  paid_by: string | null;
  created_at: string;
  updated_at: string;
  total_value: string | number;
  items_count: string | number;
}

export interface PayrollItem {
  id: string;
  period_id: string;
  user_id: string;
  user_name: string;
  user_name_current?: string;
  base_salary: string | number;
  commission_value: string | number;
  bonus_value: string | number;
  deductions_total: string | number;
  total: string | number;
  notes: string | null;
}

export interface PayrollDeduction {
  id: string;
  item_id: string;
  description: string;
  value: string | number;
}

export interface PayrollApproval {
  id: string;
  role: string;
  user_id: string | null;
  user_name: string | null;
  status: string;
  note: string | null;
  created_at: string;
}

export function usePayrollConfig() {
  return useQuery({
    queryKey: ["payroll-config"],
    queryFn: () => api<{ config: PayrollConfig | null; users: { id: string; name: string; email: string }[] }>("/api/payroll/config"),
  });
}

export function usePayrollEmployees() {
  return useQuery({
    queryKey: ["payroll-employees"],
    queryFn: () => api<{ user_id: string; name: string; email: string; base_salary: string | number }[]>("/api/payroll/employees"),
  });
}

export function usePayrollPeriods() {
  return useQuery({
    queryKey: ["payroll-periods"],
    queryFn: () => api<PayrollPeriod[]>("/api/payroll/periods"),
  });
}

export function usePayrollPeriod(id: string | null) {
  return useQuery({
    queryKey: ["payroll-period", id],
    queryFn: () => api<{
      period: PayrollPeriod;
      items: PayrollItem[];
      deductions: PayrollDeduction[];
      approvals: PayrollApproval[];
      config: PayrollConfig | null;
      myRole: "manager" | "ceo" | "finance" | null;
    }>(`/api/payroll/periods/${id}`),
    enabled: !!id,
  });
}

export function usePayrollMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["payroll-config"] });
    qc.invalidateQueries({ queryKey: ["payroll-employees"] });
    qc.invalidateQueries({ queryKey: ["payroll-periods"] });
    qc.invalidateQueries({ queryKey: ["payroll-period"] });
  };

  return {
    saveConfig: useMutation({
      mutationFn: (body: { manager_user_id: string | null; ceo_user_id: string | null; finance_user_id: string | null }) =>
        api("/api/payroll/config", { method: "PUT", body }),
      onSuccess: inv,
    }),
    saveEmployee: useMutation({
      mutationFn: ({ userId, base_salary }: { userId: string; base_salary: number }) =>
        api(`/api/payroll/employees/${userId}`, { method: "PUT", body: { base_salary } }),
      onSuccess: inv,
    }),
    createPeriod: useMutation({
      mutationFn: (reference_month: string) =>
        api<{ id: string }>("/api/payroll/periods", { method: "POST", body: { reference_month } }),
      onSuccess: inv,
    }),
    updateItem: useMutation({
      mutationFn: ({ id, ...body }: { id: string; base_salary?: number; commission_value?: number; bonus_value?: number; notes?: string }) =>
        api(`/api/payroll/items/${id}`, { method: "PUT", body }),
      onSuccess: inv,
    }),
    addDeduction: useMutation({
      mutationFn: ({ itemId, description, value }: { itemId: string; description: string; value: number }) =>
        api(`/api/payroll/items/${itemId}/deductions`, { method: "POST", body: { description, value } }),
      onSuccess: inv,
    }),
    removeDeduction: useMutation({
      mutationFn: (id: string) => api(`/api/payroll/deductions/${id}`, { method: "DELETE" }),
      onSuccess: inv,
    }),
    submit: useMutation({
      mutationFn: (id: string) => api(`/api/payroll/periods/${id}/submit`, { method: "POST" }),
      onSuccess: inv,
    }),
    approve: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) =>
        api(`/api/payroll/periods/${id}/approve`, { method: "POST", body: { note } }),
      onSuccess: inv,
    }),
    reject: useMutation({
      mutationFn: ({ id, note }: { id: string; note?: string }) =>
        api(`/api/payroll/periods/${id}/reject`, { method: "POST", body: { note } }),
      onSuccess: inv,
    }),
    pay: useMutation({
      mutationFn: (id: string) => api(`/api/payroll/periods/${id}/pay`, { method: "POST" }),
      onSuccess: inv,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`/api/payroll/periods/${id}`, { method: "DELETE" }),
      onSuccess: inv,
    }),
  };
}
