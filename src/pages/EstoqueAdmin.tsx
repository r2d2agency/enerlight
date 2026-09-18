import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useEstoque } from '@/hooks/use-estoque';
import { estoqueApi, EstoqueProduto, ProdutoTipo } from '@/lib/estoque-api';
import { Package, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';

interface NovoProdutoForm {
  sku: string; name: string; unit: string; minimum_quantity: string; product_kind: ProdutoTipo; codes: string[];
}

const PRODUTO_VAZIO: NovoProdutoForm = { sku: '', name: '', unit: 'UN', minimum_quantity: '0', product_kind: 'COMPONENT', codes: [] };

export default function EstoqueAdmin() {
  const { produtos, movimentos, alertas, importacoes, movimento, produto, bom, consumirComposto, produzir, recarregar } = useEstoque();
  const [importacaoSelecionada, setImportacaoSelecionada] = useState<any>(null);
  const { toast } = useToast();
  const [busca, setBusca] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [selecionado, setSelecionado] = useState<EstoqueProduto | null>(null);
  const [bomItems, setBomItems] = useState<{ component_id: string; quantity: number }[]>([]);
  const [showNovo, setShowNovo] = useState(false);
  const [novo, setNovo] = useState<NovoProdutoForm>(PRODUTO_VAZIO);
  const [novoCodigo, setNovoCodigo] = useState('');
  const items = (produtos.data || []).filter(p => !busca || `${p.name} ${p.sku} ${p.codes?.map(c => c.code).join(' ') || ''}`.toLowerCase().includes(busca.toLowerCase()));
  const registrar = (p: EstoqueProduto, type: 'IN' | 'ADJUSTMENT' | 'OUT') => {
    const value = Number(window.prompt('Quantidade'));
    if (!(value > 0)) return;
    movimento.mutate({ product_id: p.id, movement_type: type, quantity: value, notes: 'Lançamento administrativo' }, {
      onSuccess: () => toast({ title: 'Movimento registrado' }),
      onError: (e: any) => toast({ title: 'Erro', description: String(e?.message || e), variant: 'destructive' }),
    });
  };
  const editarBom = async (p: EstoqueProduto) => { setSelecionado(p); try { setBomItems((await estoqueApi.listarBOM(p.id)).map(i => ({ component_id: i.component_product_id || i.component_id || '', quantity: i.quantity }))); } catch { setBomItems([]); } };
  const addCodigo = () => {
    const code = novoCodigo.trim().toUpperCase();
    if (!code) return;
    if (novo.codes.includes(code)) { toast({ title: 'Código já adicionado', variant: 'destructive' }); return; }
    setNovo(n => ({ ...n, codes: [...n.codes, code] }));
    setNovoCodigo('');
  };
  const salvarProduto = () => {
    if (!novo.sku.trim() || !novo.name.trim()) { toast({ title: 'Informe SKU e nome do produto', variant: 'destructive' }); return; }
    produto.mutate({
      sku: novo.sku.trim().toUpperCase(),
      name: novo.name.trim(),
      unit: novo.unit || 'UN',
      minimum_quantity: Number(novo.minimum_quantity) || 0,
      product_kind: novo.product_kind,
      codes: novo.codes,
    }, {
      onSuccess: () => { toast({ title: 'Produto cadastrado' }); setShowNovo(false); setNovo(PRODUTO_VAZIO); },
      onError: (e: any) => toast({ title: 'Erro ao cadastrar', description: String(e?.message || e), variant: 'destructive' }),
    });
  };
  return <MainLayout><div className="space-y-6"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><Package className="h-7 w-7 text-primary" /><div><h1 className="text-2xl font-bold">Estoque</h1><p className="text-sm text-muted-foreground">Itens simples, compostos, BOM e operações.</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={recarregar}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button><Button onClick={() => { setNovo(PRODUTO_VAZIO); setShowNovo(true); }}><Plus className="mr-2 h-4 w-4" />Novo produto</Button></div></div>
  <div className="grid gap-4 md:grid-cols-3"><Card><CardHeader><CardTitle className="text-sm">Produtos</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{produtos.data?.length ?? '—'}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Alertas</CardTitle></CardHeader><CardContent className="text-2xl font-bold text-destructive">{alertas.data?.length ?? '—'}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Movimentos</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{movimentos.data?.length ?? '—'}</CardContent></Card></div>
  <Tabs defaultValue="produtos"><TabsList><TabsTrigger value="produtos">Produtos</TabsTrigger><TabsTrigger value="movimentos">Movimentos</TabsTrigger><TabsTrigger value="alertas">Alertas</TabsTrigger><TabsTrigger value="importar">Importar XML</TabsTrigger><TabsTrigger value="importacoes">Importações</TabsTrigger></TabsList><TabsContent value="produtos" className="mt-4"><Card><CardContent className="pt-6"><Input placeholder="Buscar por nome, SKU ou código" value={busca} onChange={e => setBusca(e.target.value)} /><Table className="mt-4"><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Códigos</TableHead><TableHead>Saldo</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader><TableBody>{items.map(p => <TableRow key={p.id}><TableCell>{p.sku}</TableCell><TableCell>{p.name}</TableCell><TableCell><Badge>{p.product_kind === 'COMPOSITE' ? 'Composto' : 'Simples'}</Badge></TableCell><TableCell><div className="flex flex-wrap gap-1">{p.codes?.length ? p.codes.map(c => <Badge key={c.code} variant="secondary">{c.code}</Badge>) : <span className="text-muted-foreground text-sm">—</span>}</div></TableCell><TableCell>{p.quantity} {p.unit}</TableCell><TableCell className="space-x-1"><Button size="sm" onClick={() => registrar(p, 'IN')}>Entrada</Button><Button size="sm" variant="outline" onClick={() => registrar(p, 'ADJUSTMENT')}>Ajuste</Button>{p.product_kind === 'COMPOSITE' && <><Button size="sm" variant="outline" onClick={() => editarBom(p)}>BOM</Button><Button size="sm" onClick={() => { const q = Number(window.prompt('Quantidade a produzir')); if (q > 0) produzir.mutate({ product_id: p.id, quantity: q }); }}>Produzir</Button><Button size="sm" variant="destructive" onClick={() => { const q = Number(window.prompt('Quantidade a consumir')); if (q > 0) consumirComposto.mutate({ product_id: p.id, quantity: q }); }}>Saída</Button></>}</TableCell></TableRow>)}</TableBody></Table>{items.length === 0 && <p className="text-sm text-muted-foreground mt-4">Nenhum produto cadastrado. Use o botão “Novo produto” para começar.</p>}{selecionado && <Card className="mt-6"><CardHeader><CardTitle>BOM: {selecionado.name}</CardTitle></CardHeader><CardContent className="space-y-2">{bomItems.map((i, n) => <div className="flex gap-2" key={n}><select className="border rounded px-2 flex-1" value={i.component_id} onChange={e => setBomItems(x => x.map((v, j) => j === n ? { ...v, component_id: e.target.value } : v))}><option value="">Selecione o componente</option>{(produtos.data || []).filter(x => x.id !== selecionado.id).map(x => <option key={x.id} value={x.id}>{x.sku} — {x.name}</option>)}</select><Input type="number" min="0.001" value={i.quantity} onChange={e => setBomItems(x => x.map((v, j) => j === n ? { ...v, quantity: Number(e.target.value) } : v))} className="w-28" /><Button variant="ghost" onClick={() => setBomItems(x => x.filter((_, j) => j !== n))}>Remover</Button></div>)}<Button variant="outline" onClick={() => setBomItems(x => [...x, { component_id: '', quantity: 1 }])}>Adicionar componente</Button><Button className="ml-2" onClick={() => bom.mutate({ productId: selecionado.id, items: bomItems.filter(x => x.component_id && x.quantity > 0) }, { onSuccess: () => toast({ title: 'BOM salva' }), onError: (e: any) => toast({ title: 'Erro ao salvar BOM', description: String(e?.message || e), variant: 'destructive' }) })}>Salvar BOM</Button></CardContent></Card>}</CardContent></Card></TabsContent>
  <TabsContent value="movimentos" className="mt-4"><Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Produto</TableHead><TableHead>Tipo</TableHead><TableHead>Quantidade</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader><TableBody>{(movimentos.data || []).map(m => <TableRow key={m.id}><TableCell>{new Date(m.created_at).toLocaleString('pt-BR')}</TableCell><TableCell>{m.name || m.product_id}</TableCell><TableCell><Badge>{m.movement_type}</Badge></TableCell><TableCell>{m.quantity}</TableCell><TableCell>{m.notes || '—'}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></TabsContent>
  <TabsContent value="alertas"><Card><CardContent className="pt-6">{(alertas.data || []).length === 0 ? <p className="text-sm text-muted-foreground">Nenhum alerta ativo.</p> : (alertas.data || []).map(a => <div key={a.id} className="flex justify-between border-b py-3"><span>{a.name || a.product_id}</span><Badge variant="destructive">{a.message}</Badge></div>)}</CardContent></Card></TabsContent>
  <TabsContent value="importacoes"><Card><CardContent className="pt-6"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Hash</TableHead><TableHead>Itens</TableHead><TableHead>Status</TableHead><TableHead>Ação</TableHead></TableRow></TableHeader><TableBody>{(importacoes.data || []).map(i => <TableRow key={i.id}><TableCell>{new Date(i.created_at).toLocaleString('pt-BR')}</TableCell><TableCell className="font-mono text-xs">{i.document_hash.slice(0, 12)}…</TableCell><TableCell>{i.items_matched}/{i.items_total}</TableCell><TableCell><Badge>{i.status}</Badge></TableCell><TableCell><Button size="sm" variant="outline" onClick={async () => setImportacaoSelecionada(await estoqueApi.detalharImportacao(i.id))}>Detalhes</Button></TableCell></TableRow>)}</TableBody></Table>{!(importacoes.data || []).length && <p className="text-sm text-muted-foreground mt-4">Nenhuma importação realizada.</p>}</CardContent></Card>{importacaoSelecionada && <Card className="mt-4"><CardHeader><CardTitle>Detalhes da importação</CardTitle></CardHeader><CardContent><p className="text-sm mb-3">{importacaoSelecionada.items?.length || 0} item(ns) persistido(s)</p><pre className="max-h-64 overflow-auto rounded bg-muted p-3 text-xs">{importacaoSelecionada.raw_xml}</pre></CardContent></Card>}</TabsContent>
  <TabsContent value="importar"><Card><CardContent className="pt-6 space-y-4"><p className="text-sm text-muted-foreground">Envie o XML de uma NF-e de saída. Os itens com códigos cadastrados recebem baixa automática; os demais ficam listados como não encontrados.</p><Input type="file" accept=".xml,text/xml" onChange={e => setArquivo(e.target.files?.[0] || null)} /><Button disabled={!arquivo} onClick={async () => { if (!arquivo) return; try { const r = await estoqueApi.importarXml(await arquivo.text()); if (r.duplicate) { toast({ title: 'XML já importado anteriormente', variant: 'destructive' }); } else { toast({ title: 'XML importado', description: `${r.imported} item(ns) baixado(s), ${r.unmatched} sem correspondência` }); } recarregar(); } catch (e: any) { toast({ title: 'Erro na importação', description: String(e?.message || e), variant: 'destructive' }); } }}><Upload className="mr-2 h-4 w-4" />Importar XML</Button></CardContent></Card></TabsContent></Tabs>
  <Dialog open={showNovo} onOpenChange={setShowNovo}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Novo produto</DialogTitle></DialogHeader><div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>SKU principal</Label><Input placeholder="Ex.: PETRO200" value={novo.sku} onChange={e => setNovo(n => ({ ...n, sku: e.target.value }))} /></div><div className="space-y-1.5"><Label>Nome</Label><Input placeholder="Ex.: Petro Prime 200" value={novo.name} onChange={e => setNovo(n => ({ ...n, name: e.target.value }))} /></div></div><div className="grid grid-cols-3 gap-3"><div className="space-y-1.5"><Label>Tipo</Label><Select value={novo.product_kind} onValueChange={(v: ProdutoTipo) => setNovo(n => ({ ...n, product_kind: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COMPONENT">Simples / Componente</SelectItem><SelectItem value="COMPOSITE">Composto</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label>Unidade</Label><Input value={novo.unit} onChange={e => setNovo(n => ({ ...n, unit: e.target.value.toUpperCase() }))} /></div><div className="space-y-1.5"><Label>Estoque mínimo</Label><Input type="number" min="0" value={novo.minimum_quantity} onChange={e => setNovo(n => ({ ...n, minimum_quantity: e.target.value }))} /></div></div><div className="space-y-1.5"><Label>Códigos alternativos (ERP, EAN, códigos internos)</Label><div className="flex gap-2"><Input placeholder="Digite o código e pressione Enter" value={novoCodigo} onChange={e => setNovoCodigo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCodigo(); } }} /><Button variant="outline" onClick={addCodigo}>Adicionar</Button></div>{novo.codes.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{novo.codes.map(c => <Badge key={c} variant="secondary" className="gap-1">{c}<button onClick={() => setNovo(n => ({ ...n, codes: n.codes.filter(x => x !== c) }))}><X className="h-3 w-3" /></button></Badge>)}</div>}<p className="text-xs text-muted-foreground">Todos os códigos apontam para o mesmo produto — a importação de XML usa esses códigos para dar baixa no saldo.</p></div></div><DialogFooter><Button variant="outline" onClick={() => setShowNovo(false)}>Cancelar</Button><Button onClick={salvarProduto}>Cadastrar produto</Button></DialogFooter></DialogContent></Dialog>
  </div></MainLayout>;
}
