import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface ExternalVisit {
  id: string;
  deal_id: string;
  deal_title?: string;
  title: string;
  description?: string;
  visit_date: string;
  start_time?: string;
  end_time?: string;
  status: string;
  address?: string;
  created_by_name?: string;
  participants: { id: string; user_id: string; user_name: string }[];
}

interface ExternalVisitFilters {
  start_date?: string;
  end_date?: string;
  user_id?: string;
  status?: string;
}

export function useExternalVisits(filters?: ExternalVisitFilters) {
  const params = new URLSearchParams();
  if (filters?.start_date) params.set("start_date", filters.start_date);
  if (filters?.end_date) params.set("end_date", filters.end_date);
  if (filters?.user_id) params.set("user_id", filters.user_id);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();

  return useQuery<ExternalVisit[]>({
    queryKey: ["crm-external-visits", filters],
    queryFn: () => api(`/api/crm/external-visits${qs ? `?${qs}` : ""}`),
  });
}
