import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ComercialCustomer, ComercialOpportunity, ComercialOpportunityStage,
} from '@/lib/comercial-api';
import { Loader2, Plus, Handshake } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

interface Props {
  basePath: string;
  listStages: () => Promise<{ stages: ComercialOpportunityStage[] }>;
  listOpportunities: () => Promise<{ opportunities: ComercialOpportunity[] }>;
  createOpportunity: (body: Partial<ComercialOpportunity>) => Promise<{ opportunity: ComercialOpportunity }>;
  updateOpportunity: (id: string, body: Partial<ComercialOpportunity>) => Promise<{ opportunity: ComercialOpportunity }>;
  listCustomers: () => Promise<{ customers: ComercialCustomer[] }>;
}

const emptyForm = { customer_id: '', title: '', estimated_value: '', probability_percent: '', expected_close_date: '', origin: '' };

export default function ComercialOportunidadesView({
  basePath, listStages, listOpportunities, createOpportunity, updateOpportunity, listCustomers,
}: Props) {
  const [stages, setStages] = useState<ComercialOpportunityStage[]>([]);
  const [opportunities, setOpportunities] = useState<ComercialOpportunity[]>([]);
  const [customers, setCustomers] = useState<ComercialCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    Promise.all([listStages(), listOpportunities()])
      .then(([stagesRes, oppsRes]) => {
        setStages(stagesRes.stages);
        setOpportunities(oppsRes.opportunities);
      })
      .catch((error) => toast({ title: 'Erro ao carregar oportunidades', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openDialog = () => {
    setForm(emptyForm);
    setDialogOpen(true);
    if (customers.length === 0) listCustomers().then((res) => setCustomers(res.customers)).catch(() => {});
  };

  const handleCreate = async () => {
    if (!form.customer_id || !form.title.trim()) {
      toast({ title: 'Cliente e título são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createOpportunity({
        customer_id: form.customer_id,
        title: form.title.trim(),
        estimated_value: form.estimated_value ? Number(form.estimated_value) : 0,
        probability_percent: form.probability_percent ? Number(form.probability_percent) : undefined,
        expected_close_date: form.expected_close_date || undefined,
        origin: form.origin || undefined,
      });
      setDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar oportunidade', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMove = async (opp: ComercialOpportunity, stageId: string) => {
    setMovingId(opp.id);
    try {
      await updateOpportunity(opp.id, { stage_id: stageId });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao mover', description: message, variant: 'destructive' });
    } finally {
      setMovingId(null);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Oportunidades</h1>
          <p className="text-sm text-muted-foreground">Funil comercial — acompanhe cada negociação por etapa.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Nova oportunidade
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova oportunidade</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Cliente *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um cliente" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Título *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Projeto 50 luminárias" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Valor estimado</Label>
                  <Input type="number" step="0.01" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Probabilidade (%)</Label>
                  <Input type="number" min="0" max="100" value={form.probability_percent} onChange={(e) => setForm({ ...form, probability_percent: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Previsão de fechamento</Label>
                  <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Origem</Label>
                  <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Indicação, site..." />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {opportunities.length === 0 && stages.length > 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">
            <Handshake className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>Nenhuma oportunidade criada ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const stageOpps = opportunities.filter((o) => o.stage_id === stage.id);
            const stageTotal = stageOpps.reduce((s, o) => s + Number(o.estimated_value || 0), 0);
            return (
              <div key={stage.id} className="min-w-[260px] w-[260px] flex-shrink-0">
                <div className="flex items-center justify-between px-1 mb-2">
                  <p className="text-sm font-medium">{stage.name}</p>
                  <p className="text-xs text-muted-foreground">{stageOpps.length} · {formatCurrency(stageTotal)}</p>
                </div>
                <div className="space-y-2">
                  {stageOpps.map((opp) => (
                    <Card key={opp.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="p-3 space-y-2" onClick={() => navigate(`${basePath}/${opp.id}`)}>
                        <p className="text-sm font-medium leading-tight">{opp.title}</p>
                        <p className="text-xs text-muted-foreground">{opp.customer_name}</p>
                        <p className="text-sm font-semibold">{formatCurrency(opp.estimated_value)}</p>
                        {opp.actor_name && <p className="text-[11px] text-muted-foreground">{opp.actor_name}</p>}
                      </CardContent>
                      <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                        <Select value={stage.id} onValueChange={(v) => handleMove(opp, v)} disabled={movingId === opp.id}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {stages.map((s) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
