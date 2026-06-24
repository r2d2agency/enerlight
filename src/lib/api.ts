export const PRODUCTION_API_URL = 'https://blaster-ener-backend.isyhhh.easypanel.host';

const resolveApiUrl = () => {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim();

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '');
  }

  // Same-origin (proxied by nginx via /api) - avoids CORS in production
  return '';
};

export const API_URL = resolveApiUrl();

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  auth?: boolean;
  isFormData?: boolean;
  silent?: boolean;
}

export const api = async <T>(endpoint: string, options: ApiOptions = {}): Promise<T> => {
  const { method = 'GET', body, auth = true, isFormData = false, silent = false } = options;
  const headers: Record<string, string> = {};

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const requestBody = isFormData ? (body as FormData) : (body ? JSON.stringify(body) : undefined);
  const fetchFrom = (baseUrl: string) => fetch(`${baseUrl}${endpoint}`, {
    method,
    headers,
    body: requestBody,
  });

  let response = await fetchFrom(API_URL);
  let contentType = response.headers.get('content-type') || '';
  let data: any = null;

  // Read body as text first for safer parsing
  let rawText = await response.text().catch(() => '');

  let isHtmlResponse = rawText.trim().startsWith('<!') || rawText.includes('<html');

  const shouldRetryFallback =
    !response.ok &&
    response.status >= 500 &&
    isHtmlResponse &&
    API_URL !== PRODUCTION_API_URL &&
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1', ''].includes(window.location.hostname);

  if (shouldRetryFallback) {
    response = await fetchFrom(PRODUCTION_API_URL);
    contentType = response.headers.get('content-type') || '';
    rawText = await response.text().catch(() => '');
    isHtmlResponse = rawText.trim().startsWith('<!') || rawText.includes('<html');
  }

  if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }
  } else {
    // Got HTML or unexpected format – log for debugging
    if (isHtmlResponse && !silent) {
      console.error('[api] Got HTML instead of JSON', {
        url: `${API_URL}${endpoint}`,
        status: response.status,
        preview: rawText.substring(0, 300),
      });
    }
    data = { raw: rawText };
  }

  if (!response.ok) {
    let baseMsg = data?.error || data?.message || `Erro na requisição (${response.status})`;

    if (response.status === 502) {
      baseMsg = 'Servidor temporariamente indisponível (502). Tente novamente em instantes.';
    } else if (isHtmlResponse && response.status >= 500) {
      baseMsg = `Erro no servidor (${response.status}). A API retornou HTML em vez de JSON.`;
    }

    const details = data?.details ? `: ${data.details}` : '';
    if (!silent) {
      // eslint-disable-next-line no-console
      console.error('[api] request failed', {
        url: `${API_URL}${endpoint}`,
        status: response.status,
        contentType,
        body,
        response: data,
      });
    }

    const error = new Error(`${baseMsg}${details}`) as Error & { status?: number; endpoint?: string; data?: any };
    error.status = response.status;
    error.endpoint = endpoint;
    error.data = data;
    throw error;
  }

  return data as T;
};

// Auth helpers
export const authApi = {
  login: (email: string, password: string) =>
    api<{ user: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/login',
      { method: 'POST', body: { email, password }, auth: false }
    ),

  register: (email: string, password: string, name: string, plan_id?: string) =>
    api<{ user: { id: string; email: string; name: string }; token: string }>(
      '/api/auth/register',
      { method: 'POST', body: { email, password, name, plan_id }, auth: false }
    ),

  getMe: () =>
    api<{ user: { id: string; email: string; name: string }; token?: string }>('/api/auth/me'),

  getSignupPlans: () =>
    api<Array<{
      id: string;
      name: string;
      description: string | null;
      max_connections: number;
      max_monthly_messages: number;
      max_users: number;
      price: number;
      billing_period: string;
      trial_days: number;
      has_chat: boolean;
      has_campaigns: boolean;
      has_asaas_integration: boolean;
    }>>('/api/auth/plans', { auth: false }),
};

export const setAuthToken = (token: string) => {
  localStorage.setItem('auth_token', token);
};

export const clearAuthToken = () => {
  localStorage.removeItem('auth_token');
};

export const getAuthToken = () => {
  return localStorage.getItem('auth_token');
};
