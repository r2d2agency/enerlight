import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface HomologationBoard {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string;
  created_by_name: string;
  company_count: number;
  created_at: string;
  updated_at: string;
}

export interface HomologationStage {
  id: string;
  board_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_final: boolean;
  company_count: number;
}

export interface HomologationCompany {
  id: string;
  board_id: string;
  stage_id: string | null;
  name: string;
  cnpj: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  completed_at: string | null;
  sort_order: number;
  task_count: number;
  completed_task_count: number;
  meeting_count: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface HomologationTask {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface HomologationHistory {
  id: string;
  company_id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

// Boards
export function useHomologationBoards() {
  return useQuery({
    queryKey: ["homologation-boards"],
    queryFn: () => api<HomologationBoard[]>("/api/homologation/boards"),
  });
}

export function useCreateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; stages?: { name: string; color?: string; is_final?: boolean }[] }) =>
      api<HomologationBoard>("/api/homologation/boards", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-boards"] }),
  });
}

export function useUpdateBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; is_active?: boolean }) =>
      api(`/api/homologation/boards/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-boards"] }),
  });
}

export function useDeleteBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/homologation/boards/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-boards"] }),
  });
}

// Stages
export function useHomologationStages(boardId: string | null) {
  return useQuery({
    queryKey: ["homologation-stages", boardId],
    queryFn: () => api<HomologationStage[]>(`/api/homologation/boards/${boardId}/stages`),
    enabled: !!boardId,
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, ...data }: { boardId: string; name: string; color?: string; is_final?: boolean }) =>
      api(`/api/homologation/boards/${boardId}/stages`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-stages"] }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; sort_order?: number; is_final?: boolean }) =>
      api(`/api/homologation/stages/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-stages"] }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/homologation/stages/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-stages"] }),
  });
}

// Companies
export function useHomologationCompanies(boardId: string | null) {
  return useQuery({
    queryKey: ["homologation-companies", boardId],
    queryFn: () => api<HomologationCompany[]>(`/api/homologation/boards/${boardId}/companies`),
    enabled: !!boardId,
  });
}

export function useCreateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, ...data }: { boardId: string; name: string; cnpj?: string; contact_name?: string; contact_email?: string; contact_phone?: string; notes?: string; stage_id?: string; assigned_to?: string }) =>
      api(`/api/homologation/boards/${boardId}/companies`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-companies"] }),
  });
}

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; cnpj?: string; contact_name?: string; contact_email?: string; contact_phone?: string; notes?: string; stage_id?: string; assigned_to?: string; sort_order?: number }) =>
      api(`/api/homologation/companies/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homologation-companies"] });
      qc.invalidateQueries({ queryKey: ["homologation-stages"] });
    },
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/homologation/companies/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["homologation-companies"] }),
  });
}

// Tasks
export function useHomologationTasks(companyId: string | null) {
  return useQuery({
    queryKey: ["homologation-tasks", companyId],
    queryFn: () => api<HomologationTask[]>(`/api/homologation/companies/${companyId}/tasks`),
    enabled: !!companyId,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, ...data }: { companyId: string; title: string; description?: string; priority?: string; due_date?: string; assigned_to?: string }) =>
      api(`/api/homologation/companies/${companyId}/tasks`, { method: "POST", body: data }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["homologation-tasks", vars.companyId] });
      qc.invalidateQueries({ queryKey: ["homologation-companies"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; status?: string; priority?: string; due_date?: string; assigned_to?: string }) =>
      api(`/api/homologation/tasks/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homologation-tasks"] });
      qc.invalidateQueries({ queryKey: ["homologation-companies"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/homologation/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homologation-tasks"] });
      qc.invalidateQueries({ queryKey: ["homologation-companies"] });
    },
  });
}

// Meetings
export function useHomologationMeetings(companyId: string | null) {
  return useQuery({
    queryKey: ["homologation-meetings", companyId],
    queryFn: () => api<any[]>(`/api/homologation/companies/${companyId}/meetings`),
    enabled: !!companyId,
  });
}

export function useLinkMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, meetingId }: { companyId: string; meetingId: string }) =>
      api(`/api/homologation/companies/${companyId}/meetings`, { method: "POST", body: { meeting_id: meetingId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["homologation-meetings"] });
      qc.invalidateQueries({ queryKey: ["homologation-companies"] });
    },
  });
}

// History
export function useHomologationHistory(companyId: string | null) {
  return useQuery({
    queryKey: ["homologation-history", companyId],
    queryFn: () => api<HomologationHistory[]>(`/api/homologation/companies/${companyId}/history`),
    enabled: !!companyId,
  });
}

// Org members
export function useHomologationOrgMembers() {
  return useQuery({
    queryKey: ["homologation-org-members"],
    queryFn: () => api<OrgMember[]>("/api/homologation/org-members"),
  });
}
