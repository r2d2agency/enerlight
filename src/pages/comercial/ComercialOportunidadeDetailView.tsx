import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { ComercialOpportunityDetail, ComercialQuote } from '@/lib/comercial-api';
import { Loader2, ArrowLeft, FileText, Plus } from 'lucide-react';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

interface Props {
  basePath: string;
  quotesBasePath: string;
  getOpportunity: (id: string) => Promise<ComercialOpportunityDetail>;
  updateOpportunity: (id: string, body: Record<string, unknown>) => Promise<{ opportunity: unknown }>;
  createQuote: (body: { customer_id: string; opportunity_id?: string }) => Promise<{ quote: ComercialQuote }>;
}

export default function ComercialOportunidadeDetailView({ basePath, quotesBasePath, getOpportunity, updateOpportunity, createQuote }: Props) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [detail, setDetail] = useState<ComercialOpportunityDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [form, setForm] = useState({
    estimated_value: '', probability_percent: '', expected_close_date: '', next_action: '', next_action_date: '', notes: '',
  });

  const load = () => {
    if (!id) return;
    setLoading(true);
    getOpportunity(id)
      .then((res) => {
        setDetail(res);
        setForm({
          estimated_value: String(res.opportunity.estimated_value ?? ''),
          probability_percent: res.opportunity.probability_percent != null ? String(res.opportunity.probability_percent) : '',
          expected_close_date: res.opportunity.expected_close_date ? res.opportunity.expected_close_date.slice(0, 10) : '',
          next_action: res.opportunity.next_action || '',
          next_action_date: res.opportunity.next_action_date ? res.opportunity.next_action_date.slice(0, 10) : '',
          notes: res.opportunity.notes || '',
        });
      })
      .catch((error) => toast({ title: 'Erro ao carregar oportunidade', description: error?.message, variant: 'destructive' }))
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

  const { opportunity, history, quotes } = detail;

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await updateOpportunity(id, {
        estimated_value: Number(form.estimated_value) || 0,
        probability_percent: form.probability_percent ? Number(form.probability_percent) : undefined,
        expected_close_date: form.expected_close_date || undefined,
        next_action: form.next_action || undefined,
        next_action_date: form.next_action_date || undefined,
        notes: form.notes || undefined,
      });
      toast({ title: 'Oportunidade atualizada' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao salvar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateQuote = async () => {
    if (!id) return;
    setCreatingQuote(true);
    try {
      const res = await createQuote({ customer_id: opportunity.customer_id, opportunity_id: id });
      navigate(`${quotesBasePath}/${res.quote.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar orçamento', description: message, variant: 'destructive' });
    } finally {
      setCreatingQuote(false);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(basePath)}>
        <ArrowLeft className="h-4 w-4 mr-1" />
        Voltar
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{opportunity.title}</h1>
          <p className="text-sm text-muted-foreground">{opportunity.customer_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={opportunity.status === 'won' ? 'default' : opportunity.status === 'lost' ? 'destructive' : 'secondary'}>
            {opportunity.stage_name || opportunity.status}
          </Badge>
          {opportunity.status === 'open' && (
            <Button size="sm" onClick={handleCreateQuote} disabled={creatingQuote}>
              {creatingQuote ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar orçamento
            </Button>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Detalhes</CardTitle></CardHeader>
            <CardContent className="space-y-3">
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
              <div className="space-y-1">
                <Label>Previsão de fechamento</Label>
                <Input type="date" value={form.expected_close_date} onChange={(e) => setForm({ ...form, expected_close_date: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Próxima ação</Label>
                  <Input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} placeholder="Ex: Ligar para o cliente" />
                </div>
                <div className="space-y-1">
                  <Label>Data da próxima ação</Label>
                  <Input type="date" value={form.next_action_date} onChange={(e) => setForm({ ...form, next_action_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Salvar
              </Button>
            </CardContent>
          </Card>

          {quotes.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Orçamentos</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {quotes.map((q) => (
                  <Link key={q.id} to={`${quotesBasePath}/${q.id}`} className="flex items-center justify-between text-sm border-b last:border-0 py-2 hover:text-primary">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4" />{q.quote_number || 'Orçamento'}</span>
                    <span>{formatCurrency(q.total_value)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {history.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Histórico</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {history.map((h) => (
                  <div key={h.id} className="border-b last:border-0 pb-2 last:pb-0">
                    <p>{h.note || `${h.field}: ${h.old_value || '—'} → ${h.new_value || '—'}`}{h.actor_name ? ` · ${h.actor_name}` : ''}</p>
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
