import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ExpenseItem {
  id: string;
  report_id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  receipt_url?: string;
  created_at: string;
}

export interface ExpenseReport {
  id: string;
  organization_id: string;
  user_id: string;
  group_id?: string;
  title: string;
  description?: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid';
  total_amount: number;
  submitted_at?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  paid_at?: string;
  paid_by?: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  group_name?: string;
  item_count?: number;
  items?: ExpenseItem[];
}

export interface GroupSummary {
  id: string;
  group_name: string;
  total: number;
  paid: number;
  approved: number;
  pending: number;
  report_count: number;
}

export const EXPENSE_CATEGORIES = [
  { value: 'combustivel', label: 'Combustível', icon: '⛽' },
  { value: 'alimentacao', label: 'Alimentação', icon: '🍽️' },
  { value: 'transporte', label: 'Transporte', icon: '🚗' },
  { value: 'hospedagem', label: 'Hospedagem', icon: '🏨' },
  { value: 'outros', label: 'Outros', icon: '📦' },
];

export function useExpenses(filters?: { status?: string; user_id?: string; group_id?: string }) {
  const queryClient = useQueryClient();

  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.user_id) params.set('user_id', filters.user_id);
  if (filters?.group_id) params.set('group_id', filters.group_id);
  const qs = params.toString() ? `?${params.toString()}` : '';

  const reports = useQuery({
    queryKey: ['expenses', filters],
    queryFn: () => api<ExpenseReport[]>(`/api/expenses${qs}`),
  });

  const report = (id: string) => useQuery({
    queryKey: ['expense', id],
    queryFn: () => api<ExpenseReport>(`/api/expenses/${id}`),
    enabled: !!id,
  });

  const groupSummary = useQuery({
    queryKey: ['expenses-summary'],
    queryFn: () => api<GroupSummary[]>('/api/expenses/summary/by-group'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expense'] });
    queryClient.invalidateQueries({ queryKey: ['expenses-summary'] });
  };

  const createReport = useMutation({
    mutationFn: (data: { title: string; description?: string; group_id?: string; items?: Partial<ExpenseItem>[] }) =>
      api<ExpenseReport>('/api/expenses', { method: 'POST', body: data }),
    onSuccess: invalidate,
  });

  const addItem = useMutation({
    mutationFn: ({ reportId, item }: { reportId: string; item: Partial<ExpenseItem> }) =>
      api<ExpenseItem>(`/api/expenses/${reportId}/items`, { method: 'POST', body: item }),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api(`/api/expenses/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  const submitReport = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}/submit`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const approveReport = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}/approve`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const rejectReport = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api(`/api/expenses/${id}/reject`, { method: 'PATCH', body: { reason } }),
    onSuccess: invalidate,
  });

  const payReport = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}/pay`, { method: 'PATCH' }),
    onSuccess: invalidate,
  });

  const deleteReport = useMutation({
    mutationFn: (id: string) => api(`/api/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return {
    reports,
    report,
    groupSummary,
    createReport,
    addItem,
    deleteItem,
    submitReport,
    approveReport,
    rejectReport,
    payReport,
    deleteReport,
  };
}
