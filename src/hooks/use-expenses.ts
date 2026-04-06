import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ExpenseItem {
  id: string;
  organization_id: string;
  user_id: string;
  group_id?: string;
  report_id?: string | null;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  expense_time?: string;
  payment_type?: string;
  location?: string;
  establishment?: string;
  cnpj?: string;
  receipt_url?: string;
  created_at: string;
  user_name?: string;
  group_name?: string;
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
  item_count: number;
}

export const EXPENSE_CATEGORIES = [
  { value: 'combustivel', label: 'Combustível', icon: '⛽' },
  { value: 'alimentacao', label: 'Alimentação', icon: '🍽️' },
  { value: 'transporte', label: 'Transporte', icon: '🚗' },
  { value: 'hospedagem', label: 'Hospedagem', icon: '🏨' },
  { value: 'outros', label: 'Outros', icon: '📦' },
];

export const PAYMENT_TYPES = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'pix', label: 'PIX' },
  { value: 'outros', label: 'Outros' },
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

  // Standalone items (ungrouped)
  const ungroupedItems = useQuery({
    queryKey: ['expense-items-ungrouped'],
    queryFn: () => api<ExpenseItem[]>('/api/expenses/items?ungrouped=true'),
  });

  const groupSummary = useQuery({
    queryKey: ['expenses-summary'],
    queryFn: () => api<GroupSummary[]>('/api/expenses/summary/by-group'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['expense'] });
    queryClient.invalidateQueries({ queryKey: ['expense-items-ungrouped'] });
    queryClient.invalidateQueries({ queryKey: ['expenses-summary'] });
  };

  // Create standalone item
  const createItem = useMutation({
    mutationFn: (data: Partial<ExpenseItem>) =>
      api<ExpenseItem>('/api/expenses/items', { method: 'POST', body: data }),
    onSuccess: invalidate,
  });

  // Delete item
  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api(`/api/expenses/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  // Group items into a report
  const groupItems = useMutation({
    mutationFn: (data: { title: string; description?: string; item_ids: string[] }) =>
      api<ExpenseReport>('/api/expenses/items/group', { method: 'POST', body: data }),
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
    ungroupedItems,
    groupSummary,
    createItem,
    deleteItem,
    groupItems,
    submitReport,
    approveReport,
    rejectReport,
    payReport,
    deleteReport,
  };
}
