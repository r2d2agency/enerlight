import { API_URL, PRODUCTION_API_URL, api } from './api';

// Portal Comercial — cliente de API isolado para o ator EXTERNO (representante/
// parceiro sem conta no CRM). Mesmo padrão de token isolado usado em
// representantes-api.ts (rp_token), aqui com sua própria chave de storage.
const TOKEN_KEY = 'comercial_token';

export const comercialToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export type ComercialProfile = 'admin' | 'gerente' | 'vendedor' | 'parceiro';

export interface ComercialActor {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  profile: ComercialProfile;
  status: 'pending' | 'active' | 'blocked';
  max_discount_percent?: number | null;
  can_view_costs: boolean;
  can_view_margin: boolean;
  can_edit_price_manually: boolean;
  default_price_list_id?: string | null;
  team_name?: string | null;
}

async function fetchComercial(endpoint: string, init: RequestInit): Promise<Response> {
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
    const t = comercialToken.get();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetchComercial(endpoint, {
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

// Portal externo — login isolado, fora do app principal (sem AuthContext)
export const comercialExternalApi = {
  login: (email: string, password: string) =>
    call<{ actor: { id: string; email: string; name: string }; token: string }>(
      '/api/comercial/login', { method: 'POST', body: { email, password }, auth: false }
    ),

  me: () => call<{ actor: ComercialActor }>('/api/comercial/me'),

  esqueciSenha: (email: string) =>
    call<{ message: string }>('/api/comercial/esqueci-senha', { method: 'POST', body: { email }, auth: false }),

  validarToken: (token: string) =>
    call<{ valid: boolean; purpose?: 'invite' | 'reset'; name?: string }>(
      `/api/comercial/validar-token?token=${encodeURIComponent(token)}`, { auth: false }
    ),

  ativarConta: (token: string, password: string) =>
    call<{ message: string }>('/api/comercial/ativar-conta', { method: 'POST', body: { token, password } , auth: false }),
};

// Portal interno — mesmo login/token do CRM (usa o helper api() principal)
export const comercialInternalApi = {
  me: () => api<{ actor: ComercialActor }>('/api/comercial/interno/me'),
};

export interface ComercialAdminActor {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profile: ComercialProfile;
  status: 'pending' | 'active' | 'blocked';
  user_id?: string | null;
  team_id?: string | null;
  team_name?: string | null;
  default_price_list_id?: string | null;
  max_discount_percent?: number | null;
  can_view_costs: boolean;
  can_view_margin: boolean;
  can_edit_price_manually: boolean;
  invited_at?: string | null;
  activated_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
}

export interface ComercialTeam {
  id: string;
  name: string;
  manager_actor_id?: string | null;
  manager_name?: string | null;
  members_count: number;
}

// Administração — usa a mesma sessão do CRM (auth_token), não o token isolado do portal
export const comercialAdminApi = {
  listActors: () => api<{ actors: ComercialAdminActor[] }>('/api/comercial/admin/actors'),
  getActor: (id: string) => api<{ actor: ComercialAdminActor }>(`/api/comercial/admin/actors/${id}`),
  linkInternal: (body: { user_id: string; profile?: ComercialProfile; team_id?: string }) =>
    api<{ actor: ComercialAdminActor }>('/api/comercial/admin/actors/link-internal', { method: 'POST', body }),
  inviteExternal: (body: { name: string; email: string; phone?: string; profile?: ComercialProfile }) =>
    api<{ actor: ComercialAdminActor }>('/api/comercial/admin/actors/invite-external', { method: 'POST', body }),
  updateActor: (id: string, body: Partial<Pick<ComercialAdminActor,
    'profile' | 'team_id' | 'default_price_list_id' | 'max_discount_percent' | 'can_view_costs' | 'can_view_margin' | 'can_edit_price_manually'>>) =>
    api<{ actor: ComercialAdminActor }>(`/api/comercial/admin/actors/${id}`, { method: 'PUT', body }),
  resendInvite: (id: string) =>
    api<{ message: string }>(`/api/comercial/admin/actors/${id}/resend-invite`, { method: 'POST' }),
  block: (id: string) =>
    api<{ actor: ComercialAdminActor }>(`/api/comercial/admin/actors/${id}/block`, { method: 'POST' }),
  unblock: (id: string) =>
    api<{ actor: ComercialAdminActor }>(`/api/comercial/admin/actors/${id}/unblock`, { method: 'POST' }),

  listTeams: () => api<{ teams: ComercialTeam[] }>('/api/comercial/admin/teams'),
  createTeam: (body: { name: string; manager_actor_id?: string }) =>
    api<{ team: ComercialTeam }>('/api/comercial/admin/teams', { method: 'POST', body }),
  updateTeam: (id: string, body: { name?: string; manager_actor_id?: string | null }) =>
    api<{ team: ComercialTeam }>(`/api/comercial/admin/teams/${id}`, { method: 'PUT', body }),
  deleteTeam: (id: string) =>
    api<{ message: string }>(`/api/comercial/admin/teams/${id}`, { method: 'DELETE' }),
};
