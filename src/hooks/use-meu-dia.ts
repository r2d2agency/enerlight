import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type MeuDiaItemType =
  | "task"
  | "followup"
  | "meeting"
  | "alert"
  | "stale_deal"
  | "scheduled_message"
  | "kanban_card";

export interface MeuDiaItem {
  id: string;
  source_id: string;
  type: MeuDiaItemType;
  title: string;
  subtitle?: string;
  tag: string;
  starts_at?: string;
  ends_at?: string;
  due_at?: string;
  is_overdue?: boolean;
  severity?: "low" | "medium" | "high" | "critical";
  priority?: string;
  deal_id?: string;
  deal_value?: number | null;
  idle_hours?: number;
  link: string;
  score: number;
}

export interface MeuDiaSummary {
  total: number;
  overdue: number;
  tasks: number;
  followups: number;
  meetings: number;
  alerts: number;
  stale_deals: number;
  scheduled: number;
  kanban: number;
}

export interface MeuDiaResponse {
  items: MeuDiaItem[];
  summary: MeuDiaSummary;
  generated_at: string;
}

export function useMeuDia() {
  return useQuery<MeuDiaResponse>({
    queryKey: ["meu-dia"],
    queryFn: async () => {
      const { data } = await api.get<MeuDiaResponse>("/meu-dia");
      return data;
    },
    refetchInterval: 60_000, // tempo real (refresh a cada 1min)
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}
