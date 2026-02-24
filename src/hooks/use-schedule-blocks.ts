import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";

export interface ScheduleBlock {
  id: string;
  organization_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  title: string;
  reason: string;
  block_date: string;
  start_time?: string;
  end_time?: string;
  all_day: boolean;
  recurrent: boolean;
  recurrence_pattern?: string;
  recurrence_days?: number[];
  recurrence_end?: string;
  notes?: string;
  created_at: string;
  _is_recurrence_instance?: boolean;
}

export const BLOCK_REASONS: Record<string, { label: string; emoji: string }> = {
  vacation: { label: "Férias", emoji: "🏖️" },
  day_off: { label: "Folga", emoji: "😴" },
  medical: { label: "Médico", emoji: "🏥" },
  lunch: { label: "Almoço", emoji: "🍽️" },
  external_event: { label: "Evento externo", emoji: "🎪" },
  personal: { label: "Pessoal", emoji: "🏠" },
  other: { label: "Outro", emoji: "📌" },
};

interface ScheduleBlockFilters {
  user_id?: string;
  date_from?: string;
  date_to?: string;
}

export function useScheduleBlocks(filters?: ScheduleBlockFilters) {
  const params = new URLSearchParams();
  if (filters?.user_id) params.set("user_id", filters.user_id);
  if (filters?.date_from) params.set("date_from", filters.date_from);
  if (filters?.date_to) params.set("date_to", filters.date_to);
  const qs = params.toString();

  return useQuery<ScheduleBlock[]>({
    queryKey: ["schedule-blocks", filters],
    queryFn: () => api(`/api/schedule-blocks${qs ? `?${qs}` : ""}`),
  });
}

export function useScheduleBlockMutations() {
  const qc = useQueryClient();
  const inv = () => qc.invalidateQueries({ queryKey: ["schedule-blocks"] });

  const create = useMutation({
    mutationFn: (data: Partial<ScheduleBlock>) =>
      api("/api/schedule-blocks", { method: "POST", body: data }),
    onSuccess: () => { inv(); toast.success("Bloqueio de agenda criado!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: Partial<ScheduleBlock> & { id: string }) =>
      api(`/api/schedule-blocks/${id}`, { method: "PUT", body: data }),
    onSuccess: () => { inv(); toast.success("Bloqueio atualizado!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api(`/api/schedule-blocks/${id}`, { method: "DELETE" }),
    onSuccess: () => { inv(); toast.success("Bloqueio removido!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { create, update, remove };
}
