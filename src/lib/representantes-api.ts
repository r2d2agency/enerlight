import { API_URL, PRODUCTION_API_URL, api } from './api';

const TOKEN_KEY = 'rp_token';

export const rpToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface RpRepresentative {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
}

export interface RpCompany {
  id: string;
  representative_id: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RpOrderItem {
  description: string;
  qty: number;
  unit_price: number;
}

export interface RpOrder {
  id: string;
  representative_id: string;
  company_id: string;
  company_name?: string;
  order_number?: string | null;
  status: 'draft' | 'confirmed' | 'canceled';
  total_amount: number;
  order_date: string;
  notes?: string | null;
  items: RpOrderItem[];
  created_at: string;
  updated_at: string;
}

async function fetchRp(endpoint: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API_URL}${endpoint}`, init);

  const canTryDirectBackend = !API_URL && typeof window !== 'undefined' &&
    window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  if (canTryDirectBackend && [502, 503, 504].includes(res.status)) {
    return fetch(`${PRODUCTION_API_URL}${endpoint}`, init);
  }

  return res;
}

async function call<T>(endpoint: string, opts: { method?: string; body?: any; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = rpToken.get();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetchRp(endpoint, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e: any = new Error(data?.error || `Erro ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return data as T;
}

export const representantesApi = {
  login: (email: string, password: string) =>
    call<{ representative: RpRepresentative; token: string }>('/api/representantes/login', { method: 'POST', body: { email, password }, auth: false }),

  me: () => call<{ representative: RpRepresentative }>('/api/representantes/me'),

  esqueciSenha: (email: string) =>
    call<{ message: string }>('/api/representantes/esqueci-senha', { method: 'POST', body: { email }, auth: false }),

  validarToken: (token: string) =>
    call<{ valid: boolean; purpose?: 'invite' | 'reset'; name?: string }>(`/api/representantes/validar-token?token=${encodeURIComponent(token)}`, { auth: false }),

  ativarConta: (token: string, password: string) =>
    call<{ message: string }>('/api/representantes/ativar-conta', { method: 'POST', body: { token, password }, auth: false }),

  dashboard: () =>
    call<{
      companies: { active_companies: string; total_companies: string };
      orders: { orders_this_month: string; total_this_year: string; total_orders: string };
      recent_orders: RpOrder[];
    }>('/api/representantes/dashboard'),

  listCompanies: () => call<{ companies: RpCompany[] }>('/api/representantes/empresas'),
  createCompany: (body: Partial<RpCompany>) =>
    call<{ company: RpCompany }>('/api/representantes/empresas', { method: 'POST', body }),
  updateCompany: (id: string, body: Partial<RpCompany>) =>
    call<{ company: RpCompany }>(`/api/representantes/empresas/${id}`, { method: 'PUT', body }),
  deleteCompany: (id: string) =>
    call<{ message: string }>(`/api/representantes/empresas/${id}`, { method: 'DELETE' }),

  listOrders: () => call<{ orders: RpOrder[] }>('/api/representantes/pedidos'),
  createOrder: (body: Partial<RpOrder>) =>
    call<{ order: RpOrder }>('/api/representantes/pedidos', { method: 'POST', body }),
  updateOrder: (id: string, body: Partial<RpOrder>) =>
    call<{ order: RpOrder }>(`/api/representantes/pedidos/${id}`, { method: 'PUT', body }),
  deleteOrder: (id: string) =>
    call<{ message: string }>(`/api/representantes/pedidos/${id}`, { method: 'DELETE' }),
};

export interface RpAdminRepresentative {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: 'pending' | 'active' | 'blocked';
  invited_at?: string | null;
  activated_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
}

// Admin endpoints use the regular CRM session (auth_token), via the main api() helper —
// NOT the isolated `rp_token` used by the representative's own portal.
export const representantesAdminApi = {
  list: () => api<{ representatives: RpAdminRepresentative[] }>('/api/representantes/admin/representatives'),
  detail: (id: string) =>
    api<{ representative: RpAdminRepresentative; stats: { companies_count: string; orders_count: string; total_sales: string } }>(`/api/representantes/admin/representatives/${id}`),
  create: (body: { name: string; email: string; phone?: string }) =>
    api<{ representative: RpAdminRepresentative }>('/api/representantes/admin/representatives', { method: 'POST', body }),
  resendInvite: (id: string) =>
    api<{ message: string }>(`/api/representantes/admin/representatives/${id}/resend-invite`, { method: 'POST' }),
  block: (id: string) =>
    api<{ representative: RpAdminRepresentative }>(`/api/representantes/admin/representatives/${id}/block`, { method: 'POST' }),
  unblock: (id: string) =>
    api<{ representative: RpAdminRepresentative }>(`/api/representantes/admin/representatives/${id}/unblock`, { method: 'POST' }),
};
