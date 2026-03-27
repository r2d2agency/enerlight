import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface LicitacaoBoard {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by_name: string;
  item_count: number;
  created_at: string;
}

export interface LicitacaoStage {
  id: string;
  board_id: string;
  name: string;
  color: string;
  sort_order: number;
  is_final: boolean;
  item_count: number;
}

export interface Licitacao {
  id: string;
  board_id: string;
  stage_id: string | null;
  title: string;
  description: string | null;
  edital_number: string | null;
  edital_url: string | null;
  modality: string | null;
  opening_date: string | null;
  deadline_date: string | null;
  result_date: string | null;
  estimated_value: number;
  entity_name: string | null;
  entity_cnpj: string | null;
  entity_contact: string | null;
  entity_phone: string | null;
  entity_email: string | null;
  status: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  notes: string | null;
  sort_order: number;
  task_count: number;
  completed_task_count: number;
  checklist_count: number;
  checked_count: number;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface LicitacaoTask {
  id: string;
  licitacao_id: string;
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

export interface LicitacaoChecklist {
  id: string;
  licitacao_id: string;
  title: string;
  is_checked: boolean;
  sort_order: number;
  checked_by_name: string | null;
  checked_at: string | null;
}

export interface LicitacaoHistory {
  id: string;
  licitacao_id: string;
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
export function useLicitacaoBoards() {
  return useQuery({
    queryKey: ["licitacao-boards"],
    queryFn: () => api<LicitacaoBoard[]>("/api/licitacao/boards"),
  });
}

export function useCreateLicitacaoBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api<LicitacaoBoard>("/api/licitacao/boards", { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-boards"] }),
  });
}

export function useDeleteLicitacaoBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/boards/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-boards"] }),
  });
}

// Stages
export function useLicitacaoStages(boardId: string | null) {
  return useQuery({
    queryKey: ["licitacao-stages", boardId],
    queryFn: () => api<LicitacaoStage[]>(`/api/licitacao/boards/${boardId}/stages`),
    enabled: !!boardId,
  });
}

export function useCreateLicitacaoStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, ...data }: { boardId: string; name: string; color?: string; is_final?: boolean }) =>
      api(`/api/licitacao/boards/${boardId}/stages`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-stages"] }),
  });
}

export function useUpdateLicitacaoStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; sort_order?: number; is_final?: boolean }) =>
      api(`/api/licitacao/stages/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-stages"] }),
  });
}

export function useReorderLicitacaoStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, order }: { boardId: string; order: { id: string; sort_order: number }[] }) =>
      api(`/api/licitacao/boards/${boardId}/stages/reorder`, { method: "POST", body: { order } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-stages"] }),
  });
}

export function useDeleteLicitacaoStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/stages/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-stages"] }),
  });
}

// Items (Licitações)
export function useLicitacoes(boardId: string | null) {
  return useQuery({
    queryKey: ["licitacoes", boardId],
    queryFn: () => api<Licitacao[]>(`/api/licitacao/boards/${boardId}/items`),
    enabled: !!boardId,
  });
}

export function useCreateLicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, ...data }: { boardId: string; title: string; [key: string]: any }) =>
      api(`/api/licitacao/boards/${boardId}/items`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacoes"] }),
  });
}

export function useUpdateLicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api(`/api/licitacao/items/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licitacoes"] });
      qc.invalidateQueries({ queryKey: ["licitacao-stages"] });
    },
  });
}

export function useDeleteLicitacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/items/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacoes"] }),
  });
}

// Tasks
export function useLicitacaoTasks(licitacaoId: string | null) {
  return useQuery({
    queryKey: ["licitacao-tasks", licitacaoId],
    queryFn: () => api<LicitacaoTask[]>(`/api/licitacao/items/${licitacaoId}/tasks`),
    enabled: !!licitacaoId,
  });
}

export function useCreateLicitacaoTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licitacaoId, ...data }: { licitacaoId: string; title: string; description?: string; priority?: string; due_date?: string; assigned_to?: string }) =>
      api(`/api/licitacao/items/${licitacaoId}/tasks`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-tasks"] }),
  });
}

export function useUpdateLicitacaoTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: any }) =>
      api(`/api/licitacao/tasks/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-tasks"] }),
  });
}

export function useDeleteLicitacaoTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-tasks"] }),
  });
}

// Checklist
export function useLicitacaoChecklist(licitacaoId: string | null) {
  return useQuery({
    queryKey: ["licitacao-checklist", licitacaoId],
    queryFn: () => api<LicitacaoChecklist[]>(`/api/licitacao/items/${licitacaoId}/checklist`),
    enabled: !!licitacaoId,
  });
}

export function useCreateLicitacaoChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licitacaoId, title }: { licitacaoId: string; title: string }) =>
      api(`/api/licitacao/items/${licitacaoId}/checklist`, { method: "POST", body: { title } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-checklist"] }),
  });
}

export function useUpdateLicitacaoChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; is_checked?: boolean; title?: string }) =>
      api(`/api/licitacao/checklist/${id}`, { method: "PATCH", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-checklist"] }),
  });
}

export function useDeleteLicitacaoChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/checklist/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-checklist"] }),
  });
}

// Documents
export function useLicitacaoDocuments(licitacaoId: string | null) {
  return useQuery({
    queryKey: ["licitacao-documents", licitacaoId],
    queryFn: () => api<any[]>(`/api/licitacao/items/${licitacaoId}/documents`),
    enabled: !!licitacaoId,
  });
}

export function useCreateLicitacaoDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licitacaoId, ...data }: { licitacaoId: string; name: string; url: string; mimetype?: string; size?: number }) =>
      api(`/api/licitacao/items/${licitacaoId}/documents`, { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licitacao-documents"] });
      qc.invalidateQueries({ queryKey: ["licitacao-history"] });
    },
  });
}

export function useDeleteLicitacaoDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/documents/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-documents"] }),
  });
}

// Notes
export function useLicitacaoNotes(licitacaoId: string | null) {
  return useQuery({
    queryKey: ["licitacao-notes", licitacaoId],
    queryFn: () => api<any[]>(`/api/licitacao/items/${licitacaoId}/notes`),
    enabled: !!licitacaoId,
  });
}

export function useCreateLicitacaoNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ licitacaoId, content, note_type }: { licitacaoId: string; content: string; note_type?: string }) =>
      api(`/api/licitacao/items/${licitacaoId}/notes`, { method: "POST", body: { content, note_type } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["licitacao-notes"] });
      qc.invalidateQueries({ queryKey: ["licitacao-history"] });
    },
  });
}

export function useDeleteLicitacaoNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/licitacao/notes/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["licitacao-notes"] }),
  });
}

// History
export function useLicitacaoHistory(licitacaoId: string | null) {
  return useQuery({
    queryKey: ["licitacao-history", licitacaoId],
    queryFn: () => api<LicitacaoHistory[]>(`/api/licitacao/items/${licitacaoId}/history`),
    enabled: !!licitacaoId,
  });
}

// Org members
export function useLicitacaoOrgMembers() {
  return useQuery({
    queryKey: ["licitacao-org-members"],
    queryFn: () => api<OrgMember[]>("/api/licitacao/org-members"),
  });
}

export interface LicitacaoContact {
  id: string;
  name: string;
  phone: string;
}

export function useSearchLicitacaoContacts(q: string) {
  return useQuery({
    queryKey: ["licitacao-search-contacts", q],
    queryFn: () => api<LicitacaoContact[]>(`/api/licitacao/search-contacts?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });
}
