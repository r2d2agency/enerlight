import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface Goal {
  id: string;
  name: string;
  type: 'individual' | 'group';
  target_user_id?: string;
  target_user_name?: string;
  target_group_id?: string;
  target_group_name?: string;
  metric: string;
  target_value: number;
  period: 'daily' | 'weekly' | 'monthly';
  start_date: string;
  end_date?: string;
  is_active: boolean;
  created_at: string;
}

export interface GoalProgress {
  goal_id: string;
  goal_name: string;
  metric: string;
  target_value: number;
  current_value: number;
  percentage: number;
  type: string;
  period: string;
  target_user_name?: string;
  target_group_name?: string;
}

export interface SellerRanking {
  user_id: string;
  user_name: string;
  total_deals: number;
  won_deals: number;
  open_deals: number;
  won_value: number;
  total_value: number;
}

export interface GoalDashboardData {
  progress: GoalProgress[];
  kpis: {
    new_deals: number;
    closed_deals: number;
    won_value: number;
    new_clients: number;
    recurring_clients: number;
  };
  ranking: SellerRanking[];
  timeline: Array<{
    period: string;
    new_deals: number;
    closed_deals: number;
    won_value: number;
  }>;
}

export function useGoals() {
  return useQuery({
    queryKey: ["crm-goals"],
    queryFn: () => api<Goal[]>("/api/crm/goals"),
  });
}

export function useGoalDashboard(params: {
  startDate?: string;
  endDate?: string;
  userId?: string;
  groupId?: string;
  period?: string;
}) {
  const sp = new URLSearchParams();
  if (params.startDate) sp.set("start_date", params.startDate);
  if (params.endDate) sp.set("end_date", params.endDate);
  if (params.userId) sp.set("user_id", params.userId);
  if (params.groupId) sp.set("group_id", params.groupId);
  if (params.period) sp.set("period", params.period);

  return useQuery({
    queryKey: ["crm-goals-dashboard", params],
    queryFn: () => api<GoalDashboardData>(`/api/crm/goals/dashboard?${sp.toString()}`),
  });
}

export function useGoalMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["crm-goals"] });
    qc.invalidateQueries({ queryKey: ["crm-goals-dashboard"] });
  };

  const createGoal = useMutation({
    mutationFn: (data: Partial<Goal>) => api<Goal>("/api/crm/goals", { method: "POST", body: data }),
    onSuccess: invalidate,
  });

  const updateGoal = useMutation({
    mutationFn: ({ id, ...data }: Partial<Goal> & { id: string }) =>
      api<Goal>(`/api/crm/goals/${id}`, { method: "PUT", body: data }),
    onSuccess: invalidate,
  });

  const deleteGoal = useMutation({
    mutationFn: (id: string) => api(`/api/crm/goals/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  return { createGoal, updateGoal, deleteGoal };
}
