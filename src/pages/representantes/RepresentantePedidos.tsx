import { useEffect, useState } from 'react';
import RepresentanteLayout from './RepresentanteLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { representantesApi, RpCompany, RpOrder, RpOrderItem } from '@/lib/representantes-api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, ShoppingCart, X } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

const statusLabel: Record<string, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  canceled: 'Cancelado',
};

const emptyItem: RpOrderItem = { description: '', qty: 1, unit_price: 0 };

const RepresentantePedidos = () => {
  const [orders, setOrders] = useState<RpOrder[]>([]);
  const [companies, setCompanies] = useState<RpCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [companyId, setCompanyId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [status, setStatus] = useState('draft');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RpOrderItem[]>([{ ...emptyItem }]);

  const load = () => {
    setLoading(true);
    Promise.all([representantesApi.listOrders(), representantesApi.listCompanies()])
      .then(([ordersRes, companiesRes]) => {
        setOrders(ordersRes.orders);
        setCompanies(companiesRes.companies.filter((c) => c.is_active));
      })
      .catch((error) => toast({ title: 'Erro ao carregar pedidos', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setCompanyId('');
    setOrderNumber('');
    setStatus('draft');
    setOrderDate(new Date().toISOString().slice(0, 10));
    setNotes('');
    setItems([{ ...emptyItem }]);
    setDialogOpen(true);
  };

  const updateItem = (index: number, patch: Partial<RpOrderItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const totalAmount = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unit_price) || 0), 0);

  const handleSave = async () => {
    if (!companyId) {
      toast({ title: 'Selecione uma empresa', variant: 'destructive' });
      return;
    }
    const validItems = items.filter((i) => i.description.trim());
    setSaving(true);
    try {
      await representantesApi.createOrder({
        company_id: companyId,
        order_number: orderNumber || undefined,
        status: status as RpOrder['status'],
        order_date: orderDate,
        notes: notes || undefined,
        items: validItems,
        total_amount: totalAmount,
      });
      toast({ title: 'Pedido registrado' });
      setDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao salvar pedido', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <RepresentanteLayout>
      {() => (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Pedidos</h1>
              <p className="text-muted-foreground text-sm">Suas vendas e pedidos registrados</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openCreate} disabled={companies.length === 0}>
                  <Plus className="h-4 w-4 mr-1" />
                  Novo pedido
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Novo pedido</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  <div className="space-y-1">
                    <Label>Empresa *</Label>
                    <Select value={companyId} onValueChange={setCompanyId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Número do pedido</Label>
                      <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Data</Label>
                      <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="confirmed">Confirmado</SelectItem>
                        <SelectItem value="canceled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Itens</Label>
                    {items.map((item, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <Input
                          placeholder="Descrição"
                          value={item.description}
                          onChange={(e) => updateItem(index, { description: e.target.value })}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          placeholder="Qtd"
                          value={item.qty}
                          onChange={(e) => updateItem(index, { qty: Number(e.target.value) })}
                          className="w-20"
                        />
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Valor un."
                          value={item.unit_price}
                          onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                          className="w-28"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                          disabled={items.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setItems((prev) => [...prev, { ...emptyItem }])}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Adicionar item
                    </Button>
                    <p className="text-right text-sm font-medium">Total: {formatCurrency(totalAmount)}</p>
                  </div>

                  <div className="space-y-1">
                    <Label>Observações</Label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Salvar pedido
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {companies.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground">
              Cadastre uma empresa na sua carteira antes de registrar pedidos.
            </p>
          )}

          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShoppingCart className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum pedido registrado ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.company_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{order.order_number || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(order.order_date).toLocaleDateString('pt-BR')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{statusLabel[order.status] || order.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(order.total_amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </RepresentanteLayout>
  );
};

export default RepresentantePedidos;
