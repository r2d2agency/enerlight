import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

// Types
export interface TaskBoard {
  id: string;
  name: string;
  description?: string;
  color: string;
  is_global: boolean;
  owner_id?: string;
  owner_name?: string;
  card_count: number;
  created_at: string;
}

export interface TaskBoardColumn {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
  is_default: boolean;
}

export interface TaskCard {
  id: string;
  board_id: string;
  column_id: string;
  position: number;
  title: string;
  description?: string;
  assigned_to?: string;
  assigned_name?: string;
  created_by?: string;
  creator_name?: string;
  priority: string;
  status: string;
  due_date?: string;
  tags?: string[];
  color?: string;
  cover_image?: string;
  deal_id?: string;
  company_id?: string;
  contact_id?: string;
  project_id?: string;
  deal_title?: string;
  company_name?: string;
  contact_name?: string;
  project_title?: string;
  notes?: string;
  is_archived: boolean;
  completed_at?: string;
  total_checklist_items: number;
  completed_checklist_items: number;
  attachment_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskChecklist {
  id: string;
  card_id: string;
  title: string;
  position: number;
  items: TaskChecklistItem[];
}

export interface TaskChecklistItem {
  id: string;
  checklist_id: string;
  text: string;
  is_checked: boolean;
  position: number;
  assigned_to?: string;
  assigned_name?: string;
  due_date?: string;
  start_date?: string;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  description?: string;
  item_count: number;
  items?: { id: string; text: string; position: number }[];
}

export interface TaskComment {
  id: string;
  card_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
}

export interface TaskAttachment {
  id: string;
  card_id: string;
  file_name: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  uploaded_by_name?: string;
  created_at: string;
}

export interface OrgMember {
  id: string;
  name: string;
  email: string;
}

// ============================================
// BOARDS
// ============================================

export function useTaskBoards() {
  return useQuery<TaskBoard[]>({
    queryKey: ["task-boards"],
    queryFn: () => api<TaskBoard[]>("/api/task-boards"),
  });
}

export function useTaskBoardMutations() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const createBoard = useMutation({
    mutationFn: (data: { name: string; description?: string; color?: string; is_global?: boolean }) =>
      api<TaskBoard>("/api/task-boards", { method: "POST", body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-boards"] }); toast({ title: "Quadro criado" }); },
  });

  const updateBoard = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; color?: string }) =>
      api<TaskBoard>(`/api/task-boards/${id}`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-boards"] }),
  });

  const deleteBoard = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-boards"] }); toast({ title: "Quadro excluído" }); },
  });

  return { createBoard, updateBoard, deleteBoard };
}

// ============================================
// COLUMNS
// ============================================

export function useTaskBoardColumns(boardId?: string) {
  return useQuery<TaskBoardColumn[]>({
    queryKey: ["task-board-columns", boardId],
    queryFn: () => api<TaskBoardColumn[]>(`/api/task-boards/${boardId}/columns`),
    enabled: !!boardId,
  });
}

export function useColumnMutations(boardId?: string) {
  const qc = useQueryClient();

  const addColumn = useMutation({
    mutationFn: (data: { name: string; color?: string }) =>
      api<TaskBoardColumn>(`/api/task-boards/${boardId}/columns`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-board-columns", boardId] }),
  });

  const updateColumn = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; color?: string; position?: number }) =>
      api<TaskBoardColumn>(`/api/task-boards/columns/${id}`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-board-columns", boardId] }),
  });

  const deleteColumn = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/columns/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-board-columns", boardId] }),
  });

  const reorderColumns = useMutation({
    mutationFn: (column_ids: string[]) =>
      api(`/api/task-boards/${boardId}/columns/reorder`, { method: "PUT", body: { column_ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-board-columns", boardId] }),
  });

  return { addColumn, updateColumn, deleteColumn, reorderColumns };
}

// ============================================
// CARDS
// ============================================

export interface TaskCardFilters {
  assigned_to?: string;
  due_from?: string;
  due_to?: string;
  status?: string;
}

export function useTaskCards(boardId?: string, filters?: TaskCardFilters) {
  const params = new URLSearchParams();
  if (filters?.assigned_to) params.set("assigned_to", filters.assigned_to);
  if (filters?.due_from) params.set("due_from", filters.due_from);
  if (filters?.due_to) params.set("due_to", filters.due_to);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return useQuery<TaskCard[]>({
    queryKey: ["task-cards", boardId, qs],
    queryFn: () => api<TaskCard[]>(`/api/task-boards/${boardId}/cards${qs ? `?${qs}` : ""}`),
    enabled: !!boardId,
  });
}

export function useCardMutations(boardId?: string) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const createCard = useMutation({
    mutationFn: (data: Partial<TaskCard>) =>
      api<TaskCard>(`/api/task-boards/${boardId}/cards`, { method: "POST", body: data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-cards", boardId] }); toast({ title: "Tarefa criada" }); },
  });

  const updateCard = useMutation({
    mutationFn: ({ id, ...data }: Partial<TaskCard> & { id: string }) =>
      api<TaskCard>(`/api/task-boards/cards/${id}`, { method: "PUT", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-cards", boardId] }),
  });

  const moveCard = useMutation({
    mutationFn: ({ id, ...data }: { id: string; column_id?: string; position?: number; board_id?: string }) =>
      api<TaskCard>(`/api/task-boards/cards/${id}/move`, { method: "PUT", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-cards"] });
      qc.invalidateQueries({ queryKey: ["task-boards"] });
    },
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/cards/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["task-cards", boardId] }); toast({ title: "Tarefa excluída" }); },
  });

  return { createCard, updateCard, moveCard, deleteCard };
}

// ============================================
// CHECKLISTS
// ============================================

export function useCardChecklists(cardId?: string) {
  return useQuery<TaskChecklist[]>({
    queryKey: ["task-checklists", cardId],
    queryFn: () => api<TaskChecklist[]>(`/api/task-boards/cards/${cardId}/checklists`),
    enabled: !!cardId,
  });
}

export function useChecklistMutations(cardId?: string) {
  const qc = useQueryClient();

  const addChecklist = useMutation({
    mutationFn: (data: { title?: string; template_id?: string }) =>
      api<TaskChecklist>(`/api/task-boards/cards/${cardId}/checklists`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklists", cardId] }),
  });

  const addItem = useMutation({
    mutationFn: ({ checklistId, text }: { checklistId: string; text: string }) =>
      api<TaskChecklistItem>(`/api/task-boards/checklists/${checklistId}/items`, { method: "POST", body: { text } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklists", cardId] }),
  });

  const updateItem = useMutation({
    mutationFn: ({ id, ...data }: { id: string; text?: string; is_checked?: boolean; assigned_to?: string; due_date?: string; start_date?: string }) =>
      api<TaskChecklistItem>(`/api/task-boards/checklist-items/${id}`, { method: "PUT", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-checklists", cardId] });
      qc.invalidateQueries({ queryKey: ["task-cards"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/checklist-items/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklists", cardId] }),
  });

  const deleteChecklist = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/checklists/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checklists", cardId] }),
  });

  return { addChecklist, addItem, updateItem, deleteItem, deleteChecklist };
}

// ============================================
// TEMPLATES
// ============================================

export function useChecklistTemplates() {
  return useQuery<ChecklistTemplate[]>({
    queryKey: ["checklist-templates"],
    queryFn: () => api<ChecklistTemplate[]>("/api/task-boards/templates/list"),
  });
}

export function useTemplateMutations() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const createTemplate = useMutation({
    mutationFn: (data: { name: string; description?: string; items: string[] }) =>
      api<ChecklistTemplate>("/api/task-boards/templates", { method: "POST", body: { ...data, items: data.items.map(t => ({ text: t })) } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checklist-templates"] }); toast({ title: "Template criado" }); },
  });

  const updateTemplate = useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; items?: string[] }) =>
      api(`/api/task-boards/templates/${id}`, { method: "PUT", body: { ...data, items: data.items?.map(t => ({ text: t })) } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-templates"] }),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["checklist-templates"] }); toast({ title: "Template excluído" }); },
  });

  return { createTemplate, updateTemplate, deleteTemplate };
}

// ============================================
// COMMENTS
// ============================================

export function useCardComments(cardId?: string) {
  return useQuery<TaskComment[]>({
    queryKey: ["task-comments", cardId],
    queryFn: () => api<TaskComment[]>(`/api/task-boards/cards/${cardId}/comments`),
    enabled: !!cardId,
  });
}

export function useCommentMutations(cardId?: string) {
  const qc = useQueryClient();

  const addComment = useMutation({
    mutationFn: (content: string) =>
      api<TaskComment>(`/api/task-boards/cards/${cardId}/comments`, { method: "POST", body: { content } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-comments", cardId] }),
  });

  return { addComment };
}

// ============================================
// ATTACHMENTS
// ============================================

export function useCardAttachments(cardId?: string) {
  return useQuery<TaskAttachment[]>({
    queryKey: ["task-attachments", cardId],
    queryFn: () => api<TaskAttachment[]>(`/api/task-boards/cards/${cardId}/attachments`),
    enabled: !!cardId,
  });
}

export function useAttachmentMutations(cardId?: string) {
  const qc = useQueryClient();

  const addAttachment = useMutation({
    mutationFn: (data: { file_name: string; file_url: string; file_type?: string; file_size?: number }) =>
      api<TaskAttachment>(`/api/task-boards/cards/${cardId}/attachments`, { method: "POST", body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-attachments", cardId] }),
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api(`/api/task-boards/attachments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-attachments", cardId] }),
  });

  return { addAttachment, deleteAttachment };
}

// ============================================
// MEMBERS (for assignment)
// ============================================

export function useOrgMembers() {
  return useQuery<OrgMember[]>({
    queryKey: ["task-board-members"],
    queryFn: () => api<OrgMember[]>("/api/task-boards/members"),
  });
}

// ============================================
// SEARCH (for linking)
// ============================================

export interface SearchDeal { id: string; title: string; value?: number; company_name?: string; }
export interface SearchProject { id: string; title: string; status?: string; }
export interface SearchContact { id: string; name: string; phone?: string; }
export interface SearchCompany { id: string; name: string; cnpj?: string; }

export function useSearchDeals(q: string) {
  return useQuery<SearchDeal[]>({
    queryKey: ["task-search-deals", q],
    queryFn: () => api<SearchDeal[]>(`/api/task-boards/search/deals?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });
}

export function useSearchProjects(q: string) {
  return useQuery<SearchProject[]>({
    queryKey: ["task-search-projects", q],
    queryFn: () => api<SearchProject[]>(`/api/task-boards/search/projects?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });
}

export function useSearchContacts(q: string) {
  return useQuery<SearchContact[]>({
    queryKey: ["task-search-contacts", q],
    queryFn: () => api<SearchContact[]>(`/api/task-boards/search/contacts?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });
}

export function useSearchCompanies(q: string) {
  return useQuery<SearchCompany[]>({
    queryKey: ["task-search-companies", q],
    queryFn: () => api<SearchCompany[]>(`/api/task-boards/search/companies?q=${encodeURIComponent(q)}`),
    enabled: q.length >= 1,
  });
}

// ============================================
// DUE SOON (notifications)
// ============================================

export interface DueSoonTask { id: string; title: string; due_date: string; status: string; board_name: string; }

export function useDueSoonTasks() {
  return useQuery<DueSoonTask[]>({
    queryKey: ["task-due-soon"],
    queryFn: () => api<DueSoonTask[]>("/api/task-boards/due-soon"),
    refetchInterval: 5 * 60 * 1000, // every 5 min
  });
}
