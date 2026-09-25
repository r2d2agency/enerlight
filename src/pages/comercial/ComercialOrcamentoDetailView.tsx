import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  ComercialActor, ComercialCatalogProduct, ComercialQuoteDetail, ComercialQuoteItem, ComercialQuote, ComercialSale,
} from '@/lib/comercial-api';
import { quoteStatusConfig, formatCurrency } from './ComercialOrcamentosView';
import { generateQuotePDF } from '@/lib/pdf-generator';
import { resolveMediaUrl } from '@/lib/media';
import { Loader2, ArrowLeft, Plus, Trash2, Send, Copy, Download, ShoppingCart, Search } from 'lucide-react';

interface QuoteApiBundle {
  getQuote: (id: string) => Promise<ComercialQuoteDetail>;
  updateQuote: (id: string, body: Partial<ComercialQuote>) => Promise<{ quote: ComercialQuote }>;
  addQuoteItem: (id: string, body: { price_list_item_id: string; quantity: number; discount_percent?: number }) => Promise<{ item: ComercialQuoteItem; quote: ComercialQuote }>;
  updateQuoteItem: (id: string, itemId: string, body: { quantity?: number; unit_price?: number; discount_percent?: number }) => Promise<{ item: ComercialQuoteItem; quote: ComercialQuote }>;
  deleteQuoteItem: (id: string, itemId: string) => Promise<{ message: string }>;
  sendQuote: (id: string) => Promise<{ message: string; status: string; public_token?: string }>;
  convertQuoteToSale: (id: string) => Promise<{ sale: ComercialSale }>;
  listQuoteProducts: (id: string) => Promise<{ products: ComercialCatalogProduct[] }>;
  getQuoteSettings?: () => Promise<{ settings: { delivery_terms: string[]; payment_terms_options: string[]; default_shipping_type: 'fob' | 'cif' } }>;
}

interface Props {
  actor: ComercialActor;
  basePath: string;
  salesBasePath: string;
  proposalBaseUrl: string; // ex: `${window.location.origin}/proposta`
  api: QuoteApiBundle;
}

const EDITABLE_STATUSES = ['draft', 'em_elaboracao'];
const CONVERTIBLE_STATUSES = ['enviado', 'visualizado', 'em_negociacao'];

export default function ComercialOrcamentoDetailView({ actor, basePath, salesBasePath, proposalBaseUrl, api }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [detail, setDetail] = useState<ComercialQuoteDetail | null>(null);
  const [quoteSettings, setQuoteSettings] = useState({ delivery_terms: [] as string[], payment_terms_options: [] as string[], default_shipping_type: 'cif' as 'fob' | 'cif' });
  const [customPayment, setCustomPayment] = useState(false);
  const [customDelivery, setCustomDelivery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [pdfLayout, setPdfLayout] = useState<'classic-landscape' | 'modern-portrait'>('modern-portrait');
  const [includeCover, setIncludeCover] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);

  const [form, setForm] = useState({
    payment_terms: '', delivery_time: '', shipping_type: 'cif' as 'fob' | 'cif', valid_until: '', freight_value: '0', notes: '', internal_notes: '',
  });

  const [products, setProducts] = useState<ComercialCatalogProduct[]>([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ product_id: '' });
  const [productSearch, setProductSearch] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [discountModes, setDiscountModes] = useState<Record<string, 'percent' | 'value'>>({});

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.getQuote(id)
      .then((res) => {
        setDetail(res);
        setForm({
          payment_terms: res.quote.payment_terms || '',
          delivery_time: res.quote.delivery_time || '',
          shipping_type: res.quote.shipping_type || 'cif',
          valid_until: res.quote.valid_until ? res.quote.valid_until.slice(0, 10) : '',
          freight_value: String(res.quote.freight_value ?? 0),
          notes: res.quote.notes || '',
          internal_notes: res.quote.internal_notes || '',
        });
      })
      .catch((error) => toast({ title: 'Erro ao carregar orçamento', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.getQuoteSettings?.().then(({ settings }) => setQuoteSettings({ delivery_terms: settings.delivery_terms || [], payment_terms_options: settings.payment_terms_options || [], default_shipping_type: settings.default_shipping_type || 'cif' })).catch(() => {}); }, [api]);

  if (loading || !detail) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { quote, items, history } = detail;
  const editable = EDITABLE_STATUSES.includes(quote.status);
  const cfg = quoteStatusConfig[quote.status] || quoteStatusConfig.draft;

  const handleSaveInfo = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await api.updateQuote(id, {
        payment_terms: form.payment_terms || undefined,
        delivery_time: form.delivery_time || undefined,
        shipping_type: form.shipping_type,
        valid_until: form.valid_until || undefined,
        freight_value: Number(form.freight_value) || 0,
        notes: form.notes || undefined,
        internal_notes: form.internal_notes || undefined,
      });
      toast({ title: 'Informações salvas' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao salvar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openItemDialog = () => {
    setItemForm({ product_id: '' });
    setProductSearch('');
    setItemDialogOpen(true);
    if (id && products.length === 0) {
      api.listQuoteProducts(id).then((res) => setProducts(res.products)).catch(() => {});
    }
  };

  const handleAddItem = async (productId = itemForm.product_id) => {
    if (!id || !productId) {
      toast({ title: 'Selecione um produto', variant: 'destructive' });
      return;
    }
    setSavingItem(true);
    try {
      await api.addQuoteItem(id, {
        price_list_item_id: productId,
        quantity: 1,
        discount_percent: 0,
      });
      setItemDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao adicionar item', description: message, variant: 'destructive' });
    } finally {
      setSavingItem(false);
    }
  };

  const handleUpdateItem = async (itemId: string, body: { quantity?: number; unit_price?: number; discount_percent?: number }) => {
    if (!id || Object.values(body).some((value) => !Number.isFinite(value))) return;
    setSavingItemId(itemId);
    try {
      const response = await api.updateQuoteItem(id, itemId, body);
      setDetail((current) => current ? {
        ...current,
        quote: response.quote,
        items: current.items.map((item) => item.id === itemId ? response.item : item),
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar item', description: message, variant: 'destructive' });
    } finally {
      setSavingItemId(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!id) return;
    try {
      await api.deleteQuoteItem(id, itemId);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao remover item', description: message, variant: 'destructive' });
    }
  };

  const handleSend = async () => {
    if (!id) return;
    setSending(true);
    try {
      const res = await api.sendQuote(id);
      if (res.status === 'aguardando_aprovacao') {
        toast({ title: 'Aguardando aprovação', description: res.message });
      } else {
        toast({ title: 'Orçamento enviado', description: 'O link da proposta já pode ser compartilhado com o cliente.' });
      }
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao enviar', description: message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleConvert = async () => {
    if (!id) return;
    setConverting(true);
    try {
      const res = await api.convertQuoteToSale(id);
      toast({ title: 'Convertido em venda', description: res.sale.sale_number || undefined });
      navigate(`${salesBasePath}/${res.sale.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao converter em venda', description: message, variant: 'destructive' });
    } finally {
      setConverting(false);
    }
  };

  const handleCopyLink = () => {
    if (!quote.public_token) return;
    navigator.clipboard.writeText(`${proposalBaseUrl}/${quote.public_token}`);
    toast({ title: 'Link copiado' });
  };

  const handleDownloadPdf = (layout: 'classic-landscape' | 'modern-portrait' = 'modern-portrait', withCover = true) => {
    generateQuotePDF(
      {
        id: quote.id,
        client_name: quote.client_name,
        client_document: quote.client_document,
        client_email: quote.client_email,
        client_phone: quote.client_phone,
        valid_until: quote.valid_until,
        payment_terms: quote.payment_terms,
        shipping_type: quote.shipping_type || 'cif',
        shipping_value: quote.freight_value,
        notes: quote.notes,
        total_value: quote.total_value,
        include_images: true,
        items: items.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_type: 'percentage',
          discount_value: i.discount_percent,
          total_price: i.total_price,
          image_url: i.image_url,
        })),
      },
      { name: quote.organization_name, logo_url: quote.organization_logo_url },
      { layout, include_cover: withCover }
    );
  };

  const availableCover = resolveMediaUrl(quote.template?.cover_url || quote.template_cover || quote.cover_image_url);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(basePath)} className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <Badge variant={cfg.variant} className="sm:hidden">{cfg.label}</Badge>
      </div>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold truncate">{quote.quote_number || 'Orçamento'}</h1>
            <Badge variant={cfg.variant} className="hidden sm:inline-flex">{cfg.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground truncate">{quote.client_name}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-y py-3 -mx-1 px-1 sm:border-none sm:py-0 sm:mx-0 sm:px-0">
        {items.length > 0 && <>
          <Button variant="outline" size="sm" onClick={() => { setPdfLayout('modern-portrait'); setIncludeCover(Boolean(availableCover)); setPdfDialogOpen(true); }} className="flex-1 sm:flex-none min-w-[9rem] sm:min-w-0"><Download className="h-4 w-4 mr-1" />PDF vertical</Button>
          <Button variant="outline" size="sm" onClick={() => { setPdfLayout('classic-landscape'); setIncludeCover(Boolean(availableCover)); setPdfDialogOpen(true); }} className="flex-1 sm:flex-none min-w-[9rem] sm:min-w-0"><Download className="h-4 w-4 mr-1" />PDF horizontal</Button>
        </>}
        {quote.public_token && (
          <Button variant="outline" size="sm" onClick={handleCopyLink} className="flex-1 sm:flex-none min-w-[9rem] sm:min-w-0">
            <Copy className="h-4 w-4 mr-1" />
            Copiar link
          </Button>
        )}
        {editable && (
          <Button size="sm" onClick={handleSend} disabled={sending} className="flex-1 sm:flex-none min-w-[9rem] sm:min-w-0">
            {sending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
            Enviar orçamento
          </Button>
        )}
        {CONVERTIBLE_STATUSES.includes(quote.status) && (
          <Button size="sm" onClick={handleConvert} disabled={converting} className="flex-1 sm:flex-none min-w-[9rem] sm:min-w-0">
            {converting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-1" />}
            Converter em venda
          </Button>
        )}
      </div>

      <Dialog open={pdfDialogOpen} onOpenChange={setPdfDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gerar PDF {pdfLayout === 'modern-portrait' ? 'vertical' : 'horizontal'}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm"><p className="text-muted-foreground">Escolha se deseja incluir a capa vinculada ao template/tabela deste orçamento.</p><label className="flex items-center gap-2"><input type="checkbox" checked={includeCover} disabled={!availableCover} onChange={(event) => setIncludeCover(event.target.checked)} />Incluir capa{!availableCover && ' (nenhuma capa disponível)'}</label>{availableCover && <img src={availableCover} alt="Capa do orçamento" className="max-h-40 w-full rounded border object-cover" />}</div>
          <DialogFooter><Button onClick={() => { setPdfDialogOpen(false); handleDownloadPdf(pdfLayout, includeCover); }}><Download className="mr-2 h-4 w-4" />Gerar PDF</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-3 grid md:grid-cols-2 gap-4 order-first">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{quote.client_name}</p>
              {quote.client_document && <p className="text-muted-foreground">{quote.client_document}</p>}
              {quote.client_email && <p className="text-muted-foreground">{quote.client_email}</p>}
              {quote.client_phone && <p className="text-muted-foreground">{quote.client_phone}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Totais</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(quote.subtotal_value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{formatCurrency(quote.discount_value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{formatCurrency(quote.freight_value)}</span></div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatCurrency(quote.total_value)}</span></div>
            </CardContent>
          </Card>
        </div>
        <div className="md:col-span-3 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Itens</CardTitle>
              {editable && (
                <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" onClick={openItemDialog}>
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar item
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden">
                    <DialogHeader>
                      <DialogTitle>Adicionar produto</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Produto</Label>
                        <div className="flex gap-2">
                          <Input placeholder="Código ou nome" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                          <Button type="button" variant="outline" title="Pesquisar produtos"><Search className="h-4 w-4" /></Button>
                        </div>
                        <div className="max-h-[45vh] overflow-y-auto overflow-x-hidden rounded border">
                          {products.filter((p) => `${p.sku || ''} ${p.name} ${p.description || ''}`.toLowerCase().includes(productSearch.toLowerCase())).map((p) => (
                            <button type="button" key={p.id} className={`w-full flex items-center gap-3 p-2 text-left hover:bg-muted ${itemForm.product_id === p.id ? 'bg-muted' : ''}`} onClick={() => { const selectedId = p.price_list_item_id || p.id; setItemForm({ product_id: selectedId }); void handleAddItem(selectedId); }}>
                              {p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 rounded object-cover" /> : <div className="h-10 w-10 rounded bg-muted" />}
                              <span className="min-w-0 flex-1"><strong className="block truncate">{p.name}</strong><small className="text-muted-foreground">{p.sku || 'Sem código'} · {p.description || 'Sem descrição'}</small></span>
                              <span className="font-medium">{formatCurrency(p.base_price)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Selecione um produto para adicioná-lo ao orçamento. Quantidade, preço e desconto podem ser ajustados na tabela.</p>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum item adicionado ainda.</p>
              ) : (
                <div className="w-full overflow-visible">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[38%] min-w-[220px]">Produto</TableHead>
                        <TableHead className="w-[7%] text-right">Qtd</TableHead>
                        <TableHead className="w-[18%] text-right">Unitário</TableHead>
                        <TableHead className="w-[18%] text-right">Desc.</TableHead>
                        <TableHead className="w-[14%] text-right">Total</TableHead>
                        {editable && <TableHead className="w-10" />}
                        {editable && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">
                            {editable ? <Input className="w-16 ml-auto px-1 text-right" type="number" min="0.001" step="0.001" defaultValue={item.quantity} onBlur={(e) => handleUpdateItem(item.id, { quantity: Number(e.target.value) })} /> : item.quantity}
                          </TableCell>
                          <TableCell className="text-right">
                            {editable ? <Input className="w-full min-w-[7rem] ml-auto text-right" type="text" inputMode="decimal" defaultValue={String(item.unit_price).replace('.', ',')} title="Preço deste orçamento; não altera a tabela de produtos" onBlur={(e) => { const raw = e.target.value.trim().replace(/\./g, '').replace(',', '.'); handleUpdateItem(item.id, { unit_price: Number(raw) }); }} /> : formatCurrency(item.unit_price)}
                          </TableCell>
                          <TableCell className="text-right min-w-[8.5rem]">
                            {editable ? (() => {
                              const mode = discountModes[item.id] || 'percent';
                              return <div className="flex w-full min-w-0 items-center justify-end gap-1">
                                <Input key={`${item.id}-${item.discount_percent}-${item.unit_price}-${mode}`} className="w-full min-w-0 px-1 text-right" type="number" min="0" step="0.01" defaultValue={mode === 'percent' ? item.discount_percent : (Number(item.quantity) * Number(item.unit_price) * Number(item.discount_percent) / 100)} onBlur={(e) => {
                                  const value = Number(e.target.value);
                                  const base = Number(item.quantity) * Number(item.unit_price);
                                  const percent = mode === 'value' ? (base > 0 ? (value / base) * 100 : 0) : value;
                                  handleUpdateItem(item.id, { discount_percent: percent });
                                }} />
                                <Select value={mode} onValueChange={(value: 'percent' | 'value') => setDiscountModes((current) => ({ ...current, [item.id]: value }))}>
                                  <SelectTrigger className="h-9 w-14 px-2"><SelectValue /></SelectTrigger>
                                  <SelectContent><SelectItem value="percent">%</SelectItem><SelectItem value="value">R$</SelectItem></SelectContent>
                                </Select>
                              </div>;
                            })() : `${item.discount_percent}%`}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(item.total_price)}</TableCell>
                          {editable && (
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => handleRemoveItem(item.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Informações comerciais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Condição de pagamento</Label>
                  {quoteSettings.payment_terms_options.length > 0 && !customPayment ? <Select disabled={!editable} value={form.payment_terms} onValueChange={(value) => { if (value === '__custom__') setCustomPayment(true); else setForm({ ...form, payment_terms: value }); }}><SelectTrigger><SelectValue placeholder="Selecione uma condição" /></SelectTrigger><SelectContent>{quoteSettings.payment_terms_options.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}<SelectItem value="__custom__">Outro / personalizado</SelectItem></SelectContent></Select> : <Input disabled={!editable} value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="Ex: 30/60/90 dias" />}{quoteSettings.payment_terms_options.length > 0 && customPayment && <Button type="button" size="sm" variant="link" onClick={() => setCustomPayment(false)}>Usar opções cadastradas</Button>}
                </div>
                <div className="space-y-1">
                  <Label>Prazo de entrega</Label>
                  {quoteSettings.delivery_terms.length > 0 && !customDelivery ? <Select disabled={!editable} value={form.delivery_time} onValueChange={(value) => { if (value === '__custom__') setCustomDelivery(true); else setForm({ ...form, delivery_time: value }); }}><SelectTrigger><SelectValue placeholder="Selecione um prazo" /></SelectTrigger><SelectContent>{quoteSettings.delivery_terms.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}<SelectItem value="__custom__">Outro / personalizado</SelectItem></SelectContent></Select> : <Input disabled={!editable} value={form.delivery_time} onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} placeholder="Ex: 15 dias úteis" />}{quoteSettings.delivery_terms.length > 0 && customDelivery && <Button type="button" size="sm" variant="link" onClick={() => setCustomDelivery(false)}>Usar opções cadastradas</Button>}
                </div>
                <div className="space-y-1">
                  <Label>Modalidade do frete</Label>
                  <Select disabled={!editable} value={form.shipping_type} onValueChange={(value: 'fob' | 'cif') => setForm({ ...form, shipping_type: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="cif">CIF (remetente)</SelectItem><SelectItem value="fob">FOB (destinatário)</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Validade da proposta</Label>
                  <Input disabled={!editable} type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Frete ({form.shipping_type.toUpperCase()})</Label>
                  <Input disabled={!editable} type="number" min="0" step="0.01" value={form.freight_value} onChange={(e) => setForm({ ...form, freight_value: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Observações comerciais (aparecem na proposta)</Label>
                <Textarea disabled={!editable} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Observações internas</Label>
                <Textarea disabled={!editable} rows={2} value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })} />
              </div>
              {editable && (
                <Button size="sm" onClick={handleSaveInfo} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Salvar informações
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="hidden">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{quote.client_name}</p>
              {quote.client_document && <p className="text-muted-foreground">{quote.client_document}</p>}
              {quote.client_email && <p className="text-muted-foreground">{quote.client_email}</p>}
              {quote.client_phone && <p className="text-muted-foreground">{quote.client_phone}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Totais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(quote.subtotal_value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span>-{formatCurrency(quote.discount_value)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span>{formatCurrency(quote.freight_value)}</span></div>
              <div className="flex justify-between font-semibold text-base pt-1 border-t"><span>Total</span><span>{formatCurrency(quote.total_value)}</span></div>
              {actor.can_view_margin && quote.margin_percent !== undefined && (
                <div className="flex justify-between text-xs text-muted-foreground pt-1"><span>Margem</span><span>{Number(quote.margin_percent).toFixed(1)}%</span></div>
              )}
            </CardContent>
          </Card>

          {history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Histórico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {history.map((h) => (
                  <div key={h.id} className="border-b last:border-0 pb-2 last:pb-0">
                    <p>{h.note || h.action}{h.actor_name ? ` · ${h.actor_name}` : ''}</p>
                    <p>{new Date(h.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
