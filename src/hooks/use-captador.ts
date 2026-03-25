import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface FieldCapture {
  id: string;
  organization_id: string;
  created_by: string;
  created_by_name: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  construction_stage: string | null;
  stage_notes: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_role: string | null;
  company_name: string | null;
  company_cnpj: string | null;
  deal_id: string | null;
  status: string;
  segment: string | null;
  notes: string | null;
  visit_count: number;
  return_date: string | null;
  return_notes: string | null;
  estimated_start: string | null;
  estimated_end: string | null;
  attachments: { id: string; file_url: string; file_name: string; file_type: string }[] | null;
  created_at: string;
  updated_at: string;
}

export interface FieldCaptureDetail extends FieldCapture {
  visits: {
    id: string;
    visited_by: string;
    visited_by_name: string;
    construction_stage: string;
    notes: string;
    latitude: number;
    longitude: number;
    created_at: string;
    attachments: { id: string; file_url: string; file_name: string; file_type: string }[] | null;
  }[];
}

interface CaptureFilters {
  status?: string;
  user_id?: string;
  assigned_to?: string;
  unassigned?: boolean;
  start_date?: string;
  end_date?: string;
  segment?: string;
}

export interface CaptadorSettings {
  auto_distribute: boolean;
  auto_create_task: boolean;
  notify_whatsapp: boolean;
}

export function useFieldCaptures(filters?: CaptureFilters) {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  if (filters?.user_id) params.set("user_id", filters.user_id);
  if (filters?.assigned_to) params.set("assigned_to", filters.assigned_to);
  if (filters?.unassigned) params.set("unassigned", "true");
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.segment) params.set("segment", filters.segment);
  const qs = params.toString();

  return useQuery<FieldCapture[]>({
    queryKey: ["field-captures", filters],
    queryFn: () => api(`/api/captador${qs ? `?${qs}` : ""}`),
  });
}

export function useFieldCaptureDetail(id: string | null) {
  return useQuery<FieldCaptureDetail>({
    queryKey: ["field-capture", id],
    queryFn: () => api(`/api/captador/${id}`),
    enabled: !!id,
  });
}

export function useFieldCaptureMapPoints(filters?: CaptureFilters) {
  const params = new URLSearchParams();
  if (filters?.user_id) params.set("user_id", filters.user_id);
  if (filters?.assigned_to) params.set("user_id", filters.assigned_to);
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.segment) params.set("segment", filters.segment);
  const qs = params.toString();

  return useQuery<any[]>({
    queryKey: ["field-capture-map", filters],
    queryFn: () => api(`/api/captador/map/points${qs ? `?${qs}` : ""}`),
  });
}

export function useFieldCaptureStats(userId?: string) {
  const params = userId ? `?user_id=${userId}` : "";
  return useQuery<{
    total_captures: number; new_count: number; in_progress_count: number;
    converted_count: number; unassigned_count: number; total_visits: number; total_scouts: number;
  }>({
    queryKey: ["field-capture-stats", userId],
    queryFn: () => api(`/api/captador/stats/summary${params}`),
  });
}

export function useCreateFieldCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api("/api/captador", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-captures"] });
      qc.invalidateQueries({ queryKey: ["field-capture-map"] });
      qc.invalidateQueries({ queryKey: ["field-capture-stats"] });
    },
  });
}

export function useUpdateFieldCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api(`/api/captador/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-captures"] });
      qc.invalidateQueries({ queryKey: ["field-capture"] });
      qc.invalidateQueries({ queryKey: ["field-capture-map"] });
    },
  });
}

export function useAddFieldCaptureVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ captureId, ...data }: any) =>
      api(`/api/captador/${captureId}/visits`, { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-captures"] });
      qc.invalidateQueries({ queryKey: ["field-capture"] });
    },
  });
}

export function useAddCaptureAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ captureId, ...data }: any) =>
      api(`/api/captador/${captureId}/attachments`, { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-capture"] });
    },
  });
}

export function useDeleteFieldCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/captador/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-captures"] });
      qc.invalidateQueries({ queryKey: ["field-capture-map"] });
      qc.invalidateQueries({ queryKey: ["field-capture-stats"] });
    },
  });
}

export function useCaptadorSellers() {
  return useQuery<{ id: string; name: string; whatsapp_phone: string }[]>({
    queryKey: ["captador-sellers"],
    queryFn: () => api("/api/captador/sellers"),
  });
}

export function useCaptadorSettings() {
  return useQuery<CaptadorSettings>({
    queryKey: ["captador-settings"],
    queryFn: () => api("/api/captador/settings"),
  });
}

export function useUpdateCaptadorSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<CaptadorSettings>) =>
      api("/api/captador/settings", { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captador-settings"] }),
  });
}

// ─── Segments CRUD ───

export interface CaptadorSegment {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export function useCaptadorSegments() {
  return useQuery<CaptadorSegment[]>({
    queryKey: ["captador-segments"],
    queryFn: () => api("/api/captador/segments"),
  });
}

export function useCreateCaptadorSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api("/api/captador/segments", { method: "POST", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captador-segments"] }),
  });
}

export function useDeleteCaptadorSegment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/captador/segments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captador-segments"] }),
  });
}

// ─── Distribution Members ───

export interface DistributionMember {
  id: string;
  organization_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  is_active: boolean;
  created_at: string;
}

export function useDistributionMembers() {
  return useQuery<DistributionMember[]>({
    queryKey: ["captador-distribution-members"],
    queryFn: () => api("/api/captador/distribution-members"),
  });
}

export function useAddDistributionMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (user_id: string) =>
      api("/api/captador/distribution-members", { method: "POST", body: { user_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captador-distribution-members"] }),
  });
}

export function useRemoveDistributionMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api(`/api/captador/distribution-members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["captador-distribution-members"] }),
  });
}

export function useTodayReturns() {
  return useQuery<FieldCapture[]>({
    queryKey: ["captador-returns-today"],
    queryFn: () => api("/api/captador/returns/today"),
  });
}

export function useScheduleReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, return_date, return_notes }: { id: string; return_date: string; return_notes?: string }) =>
      api(`/api/captador/${id}/schedule-return`, { method: "POST", body: { return_date, return_notes } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["field-captures"] });
      qc.invalidateQueries({ queryKey: ["field-capture"] });
      qc.invalidateQueries({ queryKey: ["captador-returns-today"] });
    },
  });
}
