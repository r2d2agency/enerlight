import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface Meeting {
  id: string;
  organization_id: string;
  title: string;
  description?: string;
  meeting_date: string;
  start_time: string;
  end_time: string;
  location?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  deal_id?: string;
  project_id?: string;
  minutes?: string;
  created_by?: string;
  created_by_name?: string;
  deal_title?: string;
  project_title?: string;
  participant_count: number;
  total_tasks: number;
  completed_tasks: number;
  attachment_count: number;
  participants?: MeetingParticipant[];
  attachments?: MeetingAttachment[];
  tasks?: MeetingTask[];
  created_at: string;
  updated_at: string;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  name: string;
  email: string;
  status: string;
}

export interface MeetingAttachment {
  id: string;
  meeting_id: string;
  name: string;
  url: string;
  mimetype?: string;
  size?: number;
  uploaded_by_name?: string;
  created_at: string;
}

export interface MeetingTask {
  id: string;
  meeting_id: string;
  title: string;
  description?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_by_name?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  due_date?: string;
  completed_at?: string;
  created_at: string;
}

interface MeetingFilters {
  search?: string;
  participant?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
}

export function useMeetings(filters?: MeetingFilters) {
  const params = new URLSearchParams();
  if (filters?.search) params.set('search', filters.search);
  if (filters?.participant) params.set('participant', filters.participant);
  if (filters?.date_from) params.set('date_from', filters.date_from);
  if (filters?.date_to) params.set('date_to', filters.date_to);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();

  return useQuery<Meeting[]>({
    queryKey: ["meetings", filters],
    queryFn: () => api(`/api/meetings${qs ? `?${qs}` : ''}`),
  });
}

export function useMeeting(id: string | null) {
  return useQuery<Meeting>({
    queryKey: ["meeting", id],
    queryFn: () => api(`/api/meetings/${id}`),
    enabled: !!id,
  });
}

export function useMeetingMutations() {
  const qc = useQueryClient();
  const inv = () => {
    qc.invalidateQueries({ queryKey: ["meetings"] });
    qc.invalidateQueries({ queryKey: ["meeting"] });
  };

  const create = useMutation({
    mutationFn: (data: any) => api("/api/meetings", { method: "POST", body: data }),
    onSuccess: () => { inv(); toast.success("Reunião agendada!"); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: any) => api(`/api/meetings/${id}`, { method: "PUT", body: data }),
    onSuccess: () => { inv(); toast.success("Reunião atualizada!"); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/meetings/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); toast.success("Reunião excluída!"); },
  });

  return { create, update, remove };
}

export function useMeetingParticipantMutations() {
  const qc = useQueryClient();
  const inv = (meetingId: string) => qc.invalidateQueries({ queryKey: ["meeting", meetingId] });

  const add = useMutation({
    mutationFn: ({ meetingId, user_ids }: { meetingId: string; user_ids: string[] }) =>
      api(`/api/meetings/${meetingId}/participants`, { method: "POST", body: { user_ids } }),
    onSuccess: (_, v) => inv(v.meetingId),
  });

  const remove = useMutation({
    mutationFn: ({ meetingId, userId }: { meetingId: string; userId: string }) =>
      api(`/api/meetings/${meetingId}/participants/${userId}`, { method: "DELETE" }),
    onSuccess: (_, v) => inv(v.meetingId),
  });

  return { add, remove };
}

export function useMeetingAttachmentMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: ({ meetingId, ...data }: { meetingId: string; name: string; url: string; mimetype?: string; size?: number }) =>
      api(`/api/meetings/${meetingId}/attachments`, { method: "POST", body: data }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["meeting", v.meetingId] }); toast.success("Arquivo anexado!"); },
  });

  const remove = useMutation({
    mutationFn: ({ attId, meetingId }: { attId: string; meetingId: string }) =>
      api(`/api/meetings/attachments/${attId}`, { method: "DELETE" }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["meeting", v.meetingId] }); toast.success("Arquivo removido!"); },
  });

  return { create, remove };
}

export function useMeetingTaskMutations() {
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: ({ meetingId, ...data }: any) =>
      api(`/api/meetings/${meetingId}/tasks`, { method: "POST", body: data }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["meeting", v.meetingId] }); qc.invalidateQueries({ queryKey: ["meetings"] }); },
  });

  const update = useMutation({
    mutationFn: ({ taskId, meetingId, ...data }: any) =>
      api(`/api/meetings/tasks/${taskId}`, { method: "PATCH", body: data }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["meeting", v.meetingId] }); qc.invalidateQueries({ queryKey: ["meetings"] }); },
  });

  const remove = useMutation({
    mutationFn: ({ taskId, meetingId }: { taskId: string; meetingId: string }) =>
      api(`/api/meetings/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: (_, v) => { qc.invalidateQueries({ queryKey: ["meeting", v.meetingId] }); qc.invalidateQueries({ queryKey: ["meetings"] }); },
  });

  return { create, update, remove };
}

export function useCheckConflicts() {
  return useMutation({
    mutationFn: (data: { user_ids: string[]; meeting_date: string; start_time: string; end_time: string; exclude_meeting_id?: string }) =>
      api<{ conflicts: any[] }>("/api/meetings/check-conflicts", { method: "POST", body: data }),
  });
}
