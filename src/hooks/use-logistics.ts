import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export interface LogisticsShipment {
  id: string;
  organization_id: string;
  company_name: string;
  client_name: string;
  invoice_number: string;
  order_number: string;
  requested_date: string;
  departure_date: string;
  estimated_delivery: string;
  actual_delivery: string;
  carrier: string;
  carrier_quote_code: string;
  volumes: number;
  freight_paid: number;
  freight_invoiced: number;
  tax_value: number;
  real_cost: number;
  status: string;
  channel: string;
  deal_id?: string;
  requester_id?: string;
  requester_name?: string;
  notes: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface LogisticsDashboard {
  summary: {
    total_shipments: number;
    total_freight_paid: number;
    total_freight_invoiced: number;
    total_tax: number;
    total_real_cost: number;
    balance: number;
    on_time: number;
    late: number;
    in_transit: number;
    pending: number;
  };
  byCarrier: Array<{ carrier: string; total: number; freight_paid: number; freight_invoiced: number; real_cost: number }>;
  byRequester: Array<{ requester_id: string; requester_name: string; total_shipments: number; total_freight_paid: number; total_invoiced: number; balance: number }>;
  byStatus: Array<{ status: string; total: number; freight_paid: number }>;
  monthlyTrend: Array<{ month: string; total: number; freight_paid: number; freight_invoiced: number; real_cost: number }>;
  byCompany: Array<{ company_name: string; total: number; freight_paid: number; freight_invoiced: number; real_cost: number; balance: number }>;
  byChannel: Array<{ channel: string; total: number; freight_paid: number; freight_invoiced: number }>;
}

export function useLogisticsShipments(filters?: {
  status?: string;
  carrier?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  requester_id?: string;
  company_name?: string;
}) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.carrier) params.set("carrier", filters.carrier);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.search) params.set("search", filters.search);
  if (filters?.requester_id) params.set("requester_id", filters.requester_id);
  if (filters?.company_name) params.set("company_name", filters.company_name);
  if (filters?.requester_id) params.set("requester_id", filters.requester_id);

  return useQuery({
    queryKey: ["logistics-shipments", filters],
    queryFn: () => api<LogisticsShipment[]>(`/api/logistics/shipments?${params.toString()}`),
  });
}

export function useLogisticsDashboard(filters?: { start_date?: string; end_date?: string; company_name?: string }) {
  const params = new URLSearchParams();
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.company_name) params.set("company_name", filters.company_name);

  return useQuery({
    queryKey: ["logistics-dashboard", filters],
    queryFn: () => api<LogisticsDashboard>(`/api/logistics/dashboard?${params.toString()}`),
  });
}

export function useLogisticsCompanies() {
  return useQuery({
    queryKey: ["logistics-companies"],
    queryFn: () => api<string[]>(`/api/logistics/companies`),
  });
}

export function useLogisticsCarriers() {
  return useQuery({
    queryKey: ["logistics-carriers"],
    queryFn: () => api<string[]>(`/api/logistics/carriers`),
  });
}

export function useLogisticsChannels() {
  return useQuery({
    queryKey: ["logistics-channels"],
    queryFn: () => api<string[]>(`/api/logistics/channels`),
  });
}

export function useLogisticsMembers() {
  return useQuery({
    queryKey: ["logistics-members"],
    queryFn: () => api<Array<{ id: string; name: string; email: string }>>(`/api/logistics/members`),
  });
}

export function useCreateShipment() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (data: Partial<LogisticsShipment>) => api<LogisticsShipment>("/api/logistics/shipments", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logistics-shipments"] });
      qc.invalidateQueries({ queryKey: ["logistics-dashboard"] });
      toast({ title: "Remessa criada com sucesso" });
    },
    onError: (e: any) => toast({ title: "Erro ao criar remessa", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateShipment() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<LogisticsShipment> & { id: string }) =>
      api<LogisticsShipment>(`/api/logistics/shipments/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logistics-shipments"] });
      qc.invalidateQueries({ queryKey: ["logistics-dashboard"] });
      toast({ title: "Remessa atualizada" });
    },
    onError: (e: any) => toast({ title: "Erro ao atualizar", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteShipment() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => api(`/api/logistics/shipments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logistics-shipments"] });
      qc.invalidateQueries({ queryKey: ["logistics-dashboard"] });
      toast({ title: "Remessa excluída" });
    },
    onError: (e: any) => toast({ title: "Erro ao excluir", description: e.message, variant: "destructive" }),
  });
}

export function useImportShipments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (items: Partial<LogisticsShipment>[]) =>
      api<{ imported: number }>("/api/logistics/import", { method: "POST", body: { items } }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["logistics-shipments"] });
      qc.invalidateQueries({ queryKey: ["logistics-dashboard"] });
      toast({ title: `${data.imported} remessas importadas` });
    },
    onError: (e: any) => toast({ title: "Erro na importação", description: e.message, variant: "destructive" }),
  });
}

export function useLogisticsByQuoteCode(code?: string) {
  return useQuery({
    queryKey: ["logistics-by-quote", code],
    queryFn: () => api<LogisticsShipment[]>(`/api/logistics/by-quote-code/${code}`),
    enabled: !!code,
  });
}
