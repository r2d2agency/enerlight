import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { comercialAdminApi, ComercialAdminActor, ComercialAdminDashboard } from '@/lib/comercial-api';
import { Loader2 } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

interface Props {
  actors: ComercialAdminActor[];
}

export default function AdminComercialDashboardTab({ actors }: Props) {
  const [data, setData] = useState<ComercialAdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);
  const [actorId, setActorId] = useState('all');
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    comercialAdminApi.getDashboard({ date_from: dateFrom, date_to: dateTo, actor_id: actorId === 'all' ? undefined : actorId })
      .then(setData)
      .catch((error) => toast({ title: 'Erro ao carregar dashboard', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [dateFrom, dateTo, actorId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">De</Label>
          <Input type="date" className="h-9 w-[150px]" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Até</Label>
          <Input type="date" className="h-9 w-[150px]" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Vendedor</Label>
          <Select value={actorId} onValueChange={setActorId}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {actors.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Faturamento</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{formatCurrency(data.revenue)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Vendas</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{data.sales_count}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Ticket médio</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{formatCurrency(data.avg_ticket)}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Orçamentos emitidos</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{data.quotes_emitted}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Conversão</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{data.conversion_rate}%</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">Vendedores ativos</CardTitle></CardHeader>
              <CardContent><div className="text-lg font-bold">{data.active_vendors}</div></CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Ranking de vendedores</CardTitle></CardHeader>
              <CardContent className="p-0">
                {data.by_actor.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Nenhuma venda no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Vendedor</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.by_actor.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell className="text-right">{a.count}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(a.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Por tabela de preço</CardTitle></CardHeader>
              <CardContent className="p-0">
                {data.by_price_list.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Tabela</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.by_price_list.map((p, idx) => (
                        <TableRow key={p.id || idx}>
                          <TableCell>{p.name || '—'}</TableCell>
                          <TableCell className="text-right">{p.count}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(p.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Por região</CardTitle></CardHeader>
              <CardContent className="p-0">
                {data.by_region.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Estado</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.by_region.map((r) => (
                        <TableRow key={r.state}>
                          <TableCell>{r.state}</TableCell>
                          <TableCell className="text-right">{r.count}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Produtos mais vendidos</CardTitle></CardHeader>
              <CardContent className="p-0">
                {data.by_product.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sem dados no período.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Produto</TableHead><TableHead className="text-right">Qtd</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {data.by_product.map((p) => (
                        <TableRow key={p.product_name}>
                          <TableCell>{p.product_name}</TableCell>
                          <TableCell className="text-right">{p.quantity}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(p.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Funil comercial</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {data.funnel.map((s) => (
                <div key={s.id} className="min-w-[120px]">
                  <p className="text-xs text-muted-foreground">{s.name}</p>
                  <p className="text-base font-semibold">{s.count}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(s.value)}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
