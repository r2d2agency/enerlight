import { API_URL } from './api';

const TOKEN_KEY = 'ead_token';

export const eadToken = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export interface EadStudent {
  id: string;
  cpf: string;
  name: string;
  email: string;
  company?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string;
  created_at?: string;
  brand_id?: string | null;
  brand_slug?: string | null;
  brand_name?: string | null;
  brand_logo?: string | null;
  brand_primary?: string | null;
  brand_accent?: string | null;
}

async function call<T>(endpoint: string, opts: { method?: string; body?: any; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = eadToken.get();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const e: any = new Error(data?.error || `Erro ${res.status}`);
    e.status = res.status; throw e;
  }
  return data as T;
}

export const eadApi = {
  register: (b: { cpf: string; name: string; email: string; password: string; company?: string; city?: string; state?: string }) =>
    call<{ student: EadStudent; token: string }>('/api/ead/auth/register', { method: 'POST', body: b, auth: false }),
  login: (email: string, password: string) =>
    call<{ student: EadStudent; token: string }>('/api/ead/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => call<{ student: EadStudent }>('/api/ead/auth/me'),

  courses: () => call<any[]>('/api/ead/courses'),
  course: (id: string) => call<any>(`/api/ead/courses/${id}`),
  quiz: (id: string) => call<{ questions: any[] }>(`/api/ead/courses/${id}/quiz`),
  attempt: (id: string, answers: Record<string, string>) =>
    call<{ score: number; correct: number; total: number; passed: boolean; review: any[]; certificate: any }>(
      `/api/ead/courses/${id}/attempt`, { method: 'POST', body: { answers } }
    ),
  myCertificates: () => call<any[]>('/api/ead/my/certificates'),
  myManuals: () => call<any[]>('/api/ead/my/manuals'),
  lessonProgress: (lessonId: string, b: { watched_seconds: number; last_position: number; total_seconds?: number | null }) =>
    call<any>(`/api/ead/lessons/${lessonId}/progress`, { method: 'POST', body: b }),
  lessonComplete: (lessonId: string) =>
    call<any>(`/api/ead/lessons/${lessonId}/complete`, { method: 'POST' }),

  // Brand public endpoints
  getBrand: (slug: string) => call<any>(`/api/ead/brand/${slug}`, { auth: false }),
  brandSignup: (slug: string, body: any) =>
    call<{ ok: boolean; message: string }>(`/api/ead/brand/${slug}/signup`, { method: 'POST', body, auth: false }),
};

// Admin (uses regular auth_token via fetch)
async function adminCall<T>(endpoint: string, opts: { method?: string; body?: any } = {}): Promise<T> {
  const { method = 'GET', body } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = localStorage.getItem('auth_token');
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(`${API_URL}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) { const e: any = new Error(data?.error || `Erro ${res.status}`); e.status = res.status; throw e; }
  return data as T;
}

export const eadAdminApi = {
  courses: () => adminCall<any[]>('/api/ead/admin/courses'),
  createCourse: (b: any) => adminCall<any>('/api/ead/admin/courses', { method: 'POST', body: b }),
  updateCourse: (id: string, b: any) => adminCall<any>(`/api/ead/admin/courses/${id}`, { method: 'PATCH', body: b }),
  deleteCourse: (id: string) => adminCall<any>(`/api/ead/admin/courses/${id}`, { method: 'DELETE' }),

  lessons: (cid: string) => adminCall<any[]>(`/api/ead/admin/courses/${cid}/lessons`),
  createLesson: (cid: string, b: any) => adminCall<any>(`/api/ead/admin/courses/${cid}/lessons`, { method: 'POST', body: b }),
  updateLesson: (id: string, b: any) => adminCall<any>(`/api/ead/admin/lessons/${id}`, { method: 'PATCH', body: b }),
  deleteLesson: (id: string) => adminCall<any>(`/api/ead/admin/lessons/${id}`, { method: 'DELETE' }),

  manuals: (cid: string) => adminCall<any[]>(`/api/ead/admin/courses/${cid}/manuals`),
  createManual: (cid: string, b: any) => adminCall<any>(`/api/ead/admin/courses/${cid}/manuals`, { method: 'POST', body: b }),
  updateManual: (id: string, b: any) => adminCall<any>(`/api/ead/admin/manuals/${id}`, { method: 'PATCH', body: b }),
  deleteManual: (id: string) => adminCall<any>(`/api/ead/admin/manuals/${id}`, { method: 'DELETE' }),

  modules: (cid: string) => adminCall<any[]>(`/api/ead/admin/courses/${cid}/modules`),
  createModule: (cid: string, b: any) => adminCall<any>(`/api/ead/admin/courses/${cid}/modules`, { method: 'POST', body: b }),
  updateModule: (id: string, b: any) => adminCall<any>(`/api/ead/admin/modules/${id}`, { method: 'PATCH', body: b }),
  deleteModule: (id: string) => adminCall<any>(`/api/ead/admin/modules/${id}`, { method: 'DELETE' }),

  questions: (cid: string) => adminCall<any[]>(`/api/ead/admin/courses/${cid}/questions`),
  createQuestion: (cid: string, b: any) => adminCall<any>(`/api/ead/admin/courses/${cid}/questions`, { method: 'POST', body: b }),
  updateQuestion: (id: string, b: any) => adminCall<any>(`/api/ead/admin/questions/${id}`, { method: 'PATCH', body: b }),
  deleteQuestion: (id: string) => adminCall<any>(`/api/ead/admin/questions/${id}`, { method: 'DELETE' }),

  template: (cid: string) => adminCall<any>(`/api/ead/admin/courses/${cid}/template`),
  saveTemplate: (cid: string, b: any) => adminCall<any>(`/api/ead/admin/courses/${cid}/template`, { method: 'PUT', body: b }),
  previewTemplate: (cid: string) => adminCall<any>(`/api/ead/admin/courses/${cid}/template/preview`, { method: 'POST' }),

  students: () => adminCall<any[]>('/api/ead/admin/students'),
  student: (id: string) => adminCall<any>(`/api/ead/admin/students/${id}`),
  certificates: () => adminCall<any[]>('/api/ead/admin/certificates'),

  // Brands
  brands: () => adminCall<any[]>('/api/ead/admin/brands'),
  createBrand: (b: any) => adminCall<any>('/api/ead/admin/brands', { method: 'POST', body: b }),
  updateBrand: (id: string, b: any) => adminCall<any>(`/api/ead/admin/brands/${id}`, { method: 'PATCH', body: b }),
  deleteBrand: (id: string) => adminCall<any>(`/api/ead/admin/brands/${id}`, { method: 'DELETE' }),
  brandConnections: () => adminCall<any[]>('/api/ead/admin/brands-meta/connections'),

  // Approvals
  pendingStudents: () => adminCall<any[]>('/api/ead/admin/students/pending'),
  approveStudent: (id: string) => adminCall<any>(`/api/ead/admin/students/${id}/approve`, { method: 'POST' }),
  rejectStudent: (id: string, reason?: string) => adminCall<any>(`/api/ead/admin/students/${id}/reject`, { method: 'POST', body: { reason } }),
  resendNotification: (id: string) => adminCall<any>(`/api/ead/admin/students/${id}/resend-notification`, { method: 'POST' }),
};

export function ytEmbedUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    let id = '';
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v')!;
    else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/embed/')[1];
    else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/shorts/')[1];
    return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : url;
  } catch { return url; }
}
