import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { estoqueApi } from '@/lib/estoque-api';

export function useEstoque() {
  const client = useQueryClient();
  const produtos = useQuery({ queryKey: ['estoque-produtos'], queryFn: estoqueApi.listarProdutos });
  const movimentos = useQuery({ queryKey: ['estoque-movimentos'], queryFn: estoqueApi.listarMovimentos });
  const alertas = useQuery({ queryKey: ['estoque-alertas'], queryFn: estoqueApi.listarAlertas });
  const invalidate = () => { ['estoque-produtos', 'estoque-movimentos', 'estoque-alertas'].forEach(key => client.invalidateQueries({ queryKey: [key] })); };
  const movimento = useMutation({ mutationFn: estoqueApi.registrarMovimento, onSuccess: invalidate });
  const produto = useMutation({ mutationFn: estoqueApi.criarProduto, onSuccess: invalidate });
  const bom = useMutation({ mutationFn: ({ productId, items }: { productId: string; items: Array<{ component_id: string; quantity: number }> }) => estoqueApi.salvarBOM(productId, items), onSuccess: invalidate });
  const consumirComposto = useMutation({ mutationFn: ({ product_id, quantity, notes }: { product_id: string; quantity: number; notes?: string }) => estoqueApi.consumirComposto(product_id, quantity, notes), onSuccess: invalidate });
  const produzir = useMutation({ mutationFn: ({ product_id, quantity, notes }: { product_id: string; quantity: number; notes?: string }) => estoqueApi.produzir(product_id, quantity, notes), onSuccess: invalidate });
  return { produtos, movimentos, alertas, movimento, produto, bom, consumirComposto, produzir, recarregar: invalidate };
}
