import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  comercialAdminApi, ComercialAdminActor, ComercialAdminPriceList, ComercialCommissionRule, ComercialAdminCommission,
} from '@/lib/comercial-api';
import { Loader2, Plus, Percent } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

const statusLabel: Record<string, string> = { previsto: 'Prevista', liberado: 'Liberada', pago: 'Paga' };
const statusVariant: Record<string, 'secondary' | 'default' | 'outline'> = { previsto: 'secondary', liberado: 'default', pago: 'outline' };

interface Props {
  actors: ComercialAdminActor[];
  priceLists: ComercialAdminPriceList[];
}

export default function AdminComercialCommissionsTab({ actors, priceLists }: Props) {
  const [rules, setRules] = useState<ComercialCommissionRule[]>([]);
  const [commissions, setCommissions] = useState<ComercialAdminCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ actor_id: string; price_list_id: string; percent: string }>({ actor_id: 'all', price_list_id: 'all', percent: '' });
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([comercialAdminApi.listCommissionRules(), comercialAdminApi.listCommissions()])
      .then(([rulesRes, commissionsRes]) => { setRules(rulesRes.rules); setCommissions(commissionsRes.commissions); })
      .catch((error) => toast({ title: 'Erro ao carregar comissões', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateRule = async () => {
    if (!form.percent) {
      toast({ title: 'Percentual é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.createCommissionRule({
        actor_id: form.actor_id === 'all' ? undefined : form.actor_id,
        price_list_id: form.price_list_id === 'all' ? undefined : form.price_list_id,
        percent: Number(form.percent),
      });
      toast({ title: 'Regra criada' });
      setForm({ actor_id: 'all', price_list_id: 'all', percent: '' });
      setDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar regra', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRule = async (rule: ComercialCommissionRule) => {
    try {
      await comercialAdminApi.updateCommissionRule(rule.id, { is_active: !rule.is_active });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar regra', description: message, variant: 'destructive' });
    }
  };

  const handleDeleteRule = async (id: string) => {
    try {
      await comercialAdminApi.deleteCommissionRule(id);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao remover regra', description: message, variant: 'destructive' });
    }
  };

  const handleUpdateStatus = async (id: string, status: 'previsto' | 'liberado' | 'pago') => {
    try {
      await comercialAdminApi.updateCommissionStatus(id, status);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar status', description: message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Regras de comissão</h3>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova regra</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nova regra de comissão</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Deixe "Qualquer" para uma regra padrão. Prioridade: vendedor+tabela específicos vencem regras mais genéricas.
                </p>
                <div className="space-y-1">
                  <Label>Vendedor</Label>
                  <Select value={form.actor_id} onValueChange={(v) => setForm({ ...form, actor_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Qualquer vendedor</SelectItem>
                      {actors.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tabela de preço</Label>
                  <Select value={form.price_list_id} onValueChange={(v) => setForm({ ...form, price_list_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Qualquer tabela</SelectItem>
                      {priceLists.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Percentual (%)</Label>
                  <Input type="number" step="0.01" value={form.percent} onChange={(e) => setForm({ ...form, percent: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreateRule} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Criar regra
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Card>
          <CardContent className="p-0">
            {rules.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Percent className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Nenhuma regra cadastrada — sem regra, nenhuma comissão é calculada.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Vendedor</TableHead><TableHead>Tabela</TableHead><TableHead>%</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.actor_name || 'Qualquer'}</TableCell>
                      <TableCell>{r.price_list_name || 'Qualquer'}</TableCell>
                      <TableCell>{r.percent}%</TableCell>
                      <TableCell><Badge variant={r.is_active ? 'default' : 'secondary'}>{r.is_active ? 'Ativa' : 'Inativa'}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => handleToggleRule(r)}>{r.is_active ? 'Desativar' : 'Ativar'}</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteRule(r.id)}>Remover</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Comissões geradas</h3>
        <Card>
          <CardContent className="p-0">
            {commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma comissão gerada ainda (criadas automaticamente ao converter um orçamento em venda).</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Venda</TableHead><TableHead>Vendedor</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">%</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.sale_number || '—'}</TableCell>
                      <TableCell>{c.actor_name || '—'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.base_value)}</TableCell>
                      <TableCell className="text-right">{c.percent_applied}%</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(c.amount)}</TableCell>
                      <TableCell>
                        <Select value={c.status} onValueChange={(v) => handleUpdateStatus(c.id, v as 'previsto' | 'liberado' | 'pago')}>
                          <SelectTrigger className="h-8 w-[120px] text-xs">
                            <SelectValue><Badge variant={statusVariant[c.status]}>{statusLabel[c.status]}</Badge></SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="previsto">Prevista</SelectItem>
                            <SelectItem value="liberado">Liberada</SelectItem>
                            <SelectItem value="pago">Paga</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
