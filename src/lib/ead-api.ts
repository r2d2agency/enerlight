import { API_URL, PRODUCTION_API_URL } from './api';

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
  brand_cover_url?: string | null;
  brand_primary?: string | null;
  brand_accent?: string | null;
  must_change_password?: boolean;
}


async function fetchEad(endpoint: string, init: RequestInit): Promise<Response> {
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
    const t = eadToken.get();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetchEad(endpoint, {
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
  register: (b: { cpf: string; name: string; email: string; company?: string; city?: string; state?: string }) =>
    call<{ student: EadStudent; token?: string; pending?: boolean; message?: string }>('/api/ead/auth/register', { method: 'POST', body: b, auth: false }),
  login: (email: string, password: string) =>
    call<{ student: EadStudent; token: string }>('/api/ead/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  changePassword: (new_password: string, current_password?: string) =>
    call<{ ok: boolean }>('/api/ead/auth/change-password', { method: 'POST', body: { new_password, current_password } }),
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
  myCatalogs: () => call<{ categories: any[]; uncategorized: any[] }>('/api/ead/my/catalogs'),
  myCatalog: (id: string) => call<any>(`/api/ead/my/catalogs/${id}`),
  catalogPdfUrl: (id: string) => `${API_URL}/api/ead/my/catalogs/${id}/pdf`,
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
  const res = await fetchEad(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
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
  student: (id: string) => adminCall<{ student: any; certificates: any[]; attempts: any[]; enrollments: any[] }>(`/api/ead/admin/students/${id}`),
  updateStudent: (id: string, b: { brand_id?: string | null }) => adminCall<any>(`/api/ead/admin/students/${id}`, { method: 'PATCH', body: b }),
  certificates: () => adminCall<any[]>('/api/ead/admin/certificates'),
  regenerateCertificate: (b: { student_id?: string; course_id?: string; certificate_id?: string; resend?: boolean }) =>
    adminCall<any>('/api/ead/admin/certificates/regenerate', { method: 'POST', body: b }),

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
  resetPassword: (id: string) => adminCall<any>(`/api/ead/admin/students/${id}/reset-password`, { method: 'POST' }),
  manualEnroll: (b: {
    name: string; cpf: string; email: string; phone?: string;
    company?: string; city?: string; state?: string;
    brand_id?: string | null; course_id: string;
    password?: string; send_notification?: boolean;
  }) => adminCall<any>('/api/ead/admin/students/manual-enroll', { method: 'POST', body: b }),
  issueCertificate: (studentId: string, course_id: string) =>
    adminCall<any>(`/api/ead/admin/students/${studentId}/issue-certificate`, { method: 'POST', body: { course_id } }),

  // Brand admins management (superadmin)
  brandAdmins: (brandId: string) => adminCall<any[]>(`/api/ead/admin/brands/${brandId}/admins`),
  createBrandAdmin: (brandId: string, b: { name: string; email: string; password?: string }) =>
    adminCall<any>(`/api/ead/admin/brands/${brandId}/admins`, { method: 'POST', body: b }),
  updateBrandAdmin: (id: string, b: any) => adminCall<any>(`/api/ead/admin/brand-admins/${id}`, { method: 'PATCH', body: b }),
  resetBrandAdminPassword: (id: string) => adminCall<any>(`/api/ead/admin/brand-admins/${id}/reset-password`, { method: 'POST' }),
  deleteBrandAdmin: (id: string) => adminCall<any>(`/api/ead/admin/brand-admins/${id}`, { method: 'DELETE' }),

  // Catálogos globais (superadmin) — brand_id opcional (null = global)
  catalogCategories: () => adminCall<any[]>('/api/ead/admin/catalog-categories'),
  createCatalogCategory: (b: { name: string; description?: string; order_index?: number; brand_id?: string | null }) =>
    adminCall<any>('/api/ead/admin/catalog-categories', { method: 'POST', body: b }),
  updateCatalogCategory: (id: string, b: any) =>
    adminCall<any>(`/api/ead/admin/catalog-categories/${id}`, { method: 'PATCH', body: b }),
  deleteCatalogCategory: (id: string) =>
    adminCall<any>(`/api/ead/admin/catalog-categories/${id}`, { method: 'DELETE' }),
  catalogs: (params?: { category_id?: string; brand_id?: string | '__global__' }) => {
    const qs = new URLSearchParams();
    if (params?.category_id) qs.set('category_id', params.category_id);
    if (params?.brand_id) qs.set('brand_id', params.brand_id);
    const s = qs.toString();
    return adminCall<any[]>(`/api/ead/admin/catalogs${s ? `?${s}` : ''}`);
  },
  createCatalog: (b: any) => adminCall<any>('/api/ead/admin/catalogs', { method: 'POST', body: b }),
  updateCatalog: (id: string, b: any) => adminCall<any>(`/api/ead/admin/catalogs/${id}`, { method: 'PATCH', body: b }),
  deleteCatalog: (id: string) => adminCall<any>(`/api/ead/admin/catalogs/${id}`, { method: 'DELETE' }),
  uploadCatalogFile: async (file: File): Promise<{ url: string }> => {
    const t = localStorage.getItem('auth_token');
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetchEad('/api/ead/admin/catalog-upload', {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data;
  },
};

// ==================== Brand Admin Portal (per-brand analytics) ====================
const BA_TOKEN_KEY = 'ead_brand_admin_token';
export const brandAdminToken = {
  get: () => localStorage.getItem(BA_TOKEN_KEY),
  set: (t: string) => localStorage.setItem(BA_TOKEN_KEY, t),
  clear: () => localStorage.removeItem(BA_TOKEN_KEY),
};

async function baCall<T>(endpoint: string, opts: { method?: string; body?: any; auth?: boolean } = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth) { const t = brandAdminToken.get(); if (t) headers['Authorization'] = `Bearer ${t}`; }
  const res = await fetchEad(endpoint, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) { const e: any = new Error(data?.error || `Erro ${res.status}`); e.status = res.status; throw e; }
  return data as T;
}

export const eadBrandAdminApi = {
  login: (slug: string, email: string, password: string) =>
    baCall<{ token: string; admin: any }>('/api/ead/brand-admin/login', { method: 'POST', body: { slug, email, password }, auth: false }),
  me: () => baCall<{ admin: any }>('/api/ead/brand-admin/me'),
  dashboard: (params?: { from?: string; to?: string; company?: string; city?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set('from', params.from);
    if (params?.to) qs.set('to', params.to);
    if (params?.company) qs.set('company', params.company);
    if (params?.city) qs.set('city', params.city);
    const s = qs.toString();
    return baCall<any>(`/api/ead/brand-admin/dashboard${s ? `?${s}` : ''}`);
  },

  pendingStudents: (params?: { company?: string; city?: string }) => {
    const qs = new URLSearchParams();
    if (params?.company) qs.set('company', params.company);
    if (params?.city) qs.set('city', params.city);
    const s = qs.toString();
    return baCall<any[]>(`/api/ead/brand-admin/students/pending${s ? `?${s}` : ''}`);
  },
  approveStudent: (id: string) =>
    baCall<any>(`/api/ead/brand-admin/students/${id}/approve`, { method: 'POST' }),
  rejectStudent: (id: string, reason?: string) =>
    baCall<any>(`/api/ead/brand-admin/students/${id}/reject`, { method: 'POST', body: { reason } }),

  settings: () => baCall<any>('/api/ead/brand-admin/settings'),
  updateSettings: (b: any) =>
    baCall<any>('/api/ead/brand-admin/settings', { method: 'PATCH', body: b }),


  // Catálogos
  catalogCategories: () => baCall<any[]>('/api/ead/brand-admin/catalog-categories'),
  createCatalogCategory: (b: { name: string; description?: string; order_index?: number }) =>
    baCall<any>('/api/ead/brand-admin/catalog-categories', { method: 'POST', body: b }),
  updateCatalogCategory: (id: string, b: any) =>
    baCall<any>(`/api/ead/brand-admin/catalog-categories/${id}`, { method: 'PATCH', body: b }),
  deleteCatalogCategory: (id: string) =>
    baCall<any>(`/api/ead/brand-admin/catalog-categories/${id}`, { method: 'DELETE' }),

  catalogs: (categoryId?: string) => {
    const qs = categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : '';
    return baCall<any[]>(`/api/ead/brand-admin/catalogs${qs}`);
  },
  createCatalog: (b: any) => baCall<any>('/api/ead/brand-admin/catalogs', { method: 'POST', body: b }),
  updateCatalog: (id: string, b: any) => baCall<any>(`/api/ead/brand-admin/catalogs/${id}`, { method: 'PATCH', body: b }),
  deleteCatalog: (id: string) => baCall<any>(`/api/ead/brand-admin/catalogs/${id}`, { method: 'DELETE' }),

  uploadCatalogFile: async (file: File): Promise<{ url: string }> => {
    const t = brandAdminToken.get();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetchEad('/api/ead/brand-admin/catalog-upload', {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: fd,
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
    return data;
  },
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
