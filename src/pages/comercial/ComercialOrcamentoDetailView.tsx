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
import { Loader2, ArrowLeft, Plus, Trash2, Send, Copy, Download, ShoppingCart } from 'lucide-react';

interface QuoteApiBundle {
  getQuote: (id: string) => Promise<ComercialQuoteDetail>;
  updateQuote: (id: string, body: Partial<ComercialQuote>) => Promise<{ quote: ComercialQuote }>;
  addQuoteItem: (id: string, body: { price_list_item_id: string; quantity: number; discount_percent?: number }) => Promise<{ item: ComercialQuoteItem; quote: ComercialQuote }>;
  updateQuoteItem: (id: string, itemId: string, body: { quantity?: number; discount_percent?: number }) => Promise<{ item: ComercialQuoteItem; quote: ComercialQuote }>;
  deleteQuoteItem: (id: string, itemId: string) => Promise<{ message: string }>;
  sendQuote: (id: string) => Promise<{ message: string; status: string; public_token?: string }>;
  convertQuoteToSale: (id: string) => Promise<{ sale: ComercialSale }>;
  listQuoteProducts: (id: string) => Promise<{ products: ComercialCatalogProduct[] }>;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);

  const [form, setForm] = useState({
    payment_terms: '', delivery_time: '', valid_until: '', freight_value: '0', notes: '', internal_notes: '',
  });

  const [products, setProducts] = useState<ComercialCatalogProduct[]>([]);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ product_id: '', quantity: '1', discount_percent: '0' });
  const [savingItem, setSavingItem] = useState(false);

  const load = () => {
    if (!id) return;
    setLoading(true);
    api.getQuote(id)
      .then((res) => {
        setDetail(res);
        setForm({
          payment_terms: res.quote.payment_terms || '',
          delivery_time: res.quote.delivery_time || '',
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
    setItemForm({ product_id: '', quantity: '1', discount_percent: '0' });
    setItemDialogOpen(true);
    if (id && products.length === 0) {
      api.listQuoteProducts(id).then((res) => setProducts(res.products)).catch(() => {});
    }
  };

  const handleAddItem = async () => {
    if (!id || !itemForm.product_id) {
      toast({ title: 'Selecione um produto', variant: 'destructive' });
      return;
    }
    setSavingItem(true);
    try {
      await api.addQuoteItem(id, {
        price_list_item_id: itemForm.product_id,
        quantity: Number(itemForm.quantity) || 1,
        discount_percent: Number(itemForm.discount_percent) || 0,
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

  const handleDownloadPdf = () => {
    generateQuotePDF(
      {
        id: quote.id,
        client_name: quote.client_name,
        client_document: quote.client_document,
        client_email: quote.client_email,
        client_phone: quote.client_phone,
        valid_until: quote.valid_until,
        payment_terms: quote.payment_terms,
        shipping_type: 'cif',
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
      { name: quote.organization_name, logo_url: quote.organization_logo_url }
    );
  };

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
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleDownloadPdf} className="flex-1 sm:flex-none min-w-[9rem] sm:min-w-0">
            <Download className="h-4 w-4 mr-1" />
            Baixar PDF
          </Button>
        )}
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

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
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
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar produto</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label>Produto</Label>
                        <Select value={itemForm.product_id} onValueChange={(v) => setItemForm({ ...itemForm, product_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Quantidade</Label>
                          <Input type="number" min="0.001" step="0.001" value={itemForm.quantity} onChange={(e) => setItemForm({ ...itemForm, quantity: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label>Desconto (%)</Label>
                          <Input type="number" min="0" max="100" step="0.01" value={itemForm.discount_percent} onChange={(e) => setItemForm({ ...itemForm, discount_percent: e.target.value })} />
                        </div>
                      </div>
                      {actor.max_discount_percent != null && actor.profile !== 'admin' && (
                        <p className="text-xs text-muted-foreground">
                          Seu desconto máximo autorizado é {actor.max_discount_percent}%. Acima disso, o orçamento vai para aprovação ao ser enviado.
                        </p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddItem} disabled={savingItem}>
                        {savingItem && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Adicionar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum item adicionado ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[160px]">Produto</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Unitário</TableHead>
                        <TableHead className="text-right">Desc.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        {editable && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                          <TableCell className="text-right">{item.discount_percent}%</TableCell>
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
                  <Input disabled={!editable} value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="Ex: 30/60/90 dias" />
                </div>
                <div className="space-y-1">
                  <Label>Prazo de entrega</Label>
                  <Input disabled={!editable} value={form.delivery_time} onChange={(e) => setForm({ ...form, delivery_time: e.target.value })} placeholder="Ex: 15 dias úteis" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Validade da proposta</Label>
                  <Input disabled={!editable} type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Frete</Label>
                  <Input disabled={!editable} type="number" step="0.01" value={form.freight_value} onChange={(e) => setForm({ ...form, freight_value: e.target.value })} />
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

        <div className="space-y-4">
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
