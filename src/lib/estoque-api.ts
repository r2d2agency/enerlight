import { api } from './api';

export type ProdutoTipo = 'COMPONENT' | 'COMPOSITE';
export type TipoMovimento = 'IN' | 'OUT' | 'ADJUSTMENT' | 'PRODUCTION';
export interface EstoqueCodigo { id?: string; code: string; code_type?: string }
export interface EstoqueProduto { id: string; sku: string; name: string; unit: string; quantity: number; minimum_quantity: number; product_kind?: ProdutoTipo; codes?: EstoqueCodigo[] }
export interface EstoqueBOMItem { id?: string; component_id?: string; component_product_id?: string; component_sku?: string; component_name?: string; quantity: number; unit?: string }
export interface EstoqueMovimento { id: string; product_id: string; sku?: string; name?: string; movement_type: TipoMovimento; quantity: number; notes?: string; reference?: string; created_at: string; balance?: number }
export interface EstoqueAlerta { id: string; product_id: string; sku?: string; name?: string; alert_type: string; message: string; created_at: string }
export interface ProdutoInput { sku: string; name: string; unit?: string; minimum_quantity?: number; product_kind?: ProdutoTipo; codes?: string[] }
const unwrap = <T>(data: T | { products?: T; movements?: T; alerts?: T }) => data && typeof data === 'object' ? ((data as any).products ?? (data as any).movements ?? (data as any).alerts ?? data) as T : data as T;
const operationKey = () => `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const estoqueApi = {
  listarProdutos: async () => unwrap(await api<EstoqueProduto[] | { products: EstoqueProduto[] }>('/api/stock/products')),
  criarProduto: (body: ProdutoInput) => api<EstoqueProduto>('/api/stock/products', { method: 'POST', body }),
  listarMovimentos: async () => unwrap(await api<EstoqueMovimento[] | { movements: EstoqueMovimento[] }>('/api/stock/movements')),
  registrarMovimento: (body: { product_id: string; movement_type: Exclude<TipoMovimento, 'PRODUCTION'>; quantity: number; notes?: string; reference?: string }) => api<EstoqueMovimento>('/api/stock/movements', { method: 'POST', body: { ...body, idempotency_key: operationKey() } }),
  listarAlertas: async () => unwrap(await api<EstoqueAlerta[] | { alerts: EstoqueAlerta[] }>('/api/stock/alerts')),
  listarBOM: (productId: string) => api<any[]>(`/api/stock/products/${productId}/boms`),
  salvarBOM: (productId: string, items: Array<{ component_id: string; quantity: number }>) => api<any>(`/api/stock/products/${productId}/boms`, { method: 'POST', body: { items: items.map(i => ({ component_product_id: i.component_id, quantity: i.quantity })) } }),
  consumirComposto: (product_id: string, quantity: number, notes?: string) => api('/api/stock/composite-out', { method: 'POST', body: { product_id, quantity, notes, idempotency_key: operationKey() } }),
  produzir: (product_id: string, quantity: number, notes?: string) => api('/api/stock/production-in', { method: 'POST', body: { product_id, quantity, notes, idempotency_key: operationKey() } }),
  importarXml: (xml: string) => api<{ imported: number; unmatched: number }>('/api/stock/import/xml', { method: 'POST', body: { xml } }),
};