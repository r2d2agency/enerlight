import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Settings2, RefreshCw, AlertTriangle, Clock, FileWarning, Building2, TrendingUp, ListChecks } from "lucide-react";
import {
  useSupervisorIAConfig,
  useSupervisorIAScopeOptions,
  useSupervisorIAUpdateConfig,
  useSupervisorIAAnalysis,
  type SupervisorIAConfig,
} from "@/hooks/use-supervisor-ia";

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v || 0);

function todayBR(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  // YYYY-MM-DD local
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SupervisorIA() {
  const [startDate, setStartDate] = useState(() => todayBR(-7));
  const [endDate, setEndDate] = useState(() => todayBR(0));
  const [configOpen, setConfigOpen] = useState(false);

  const cfgQuery = useSupervisorIAConfig();
  const optsQuery = useSupervisorIAScopeOptions();
  const analysis = useSupervisorIAAnalysis({ startDate, endDate });

  const hasScope = useMemo(() => {
    const c = cfgQuery.data;
    if (!c) return false;
    return (c.funnel_ids.length + c.homologation_board_ids.length + c.licitacao_board_ids.length) > 0;
  }, [cfgQuery.data]);

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Supervisor IA</h1>
              <p className="text-sm text-muted-foreground">Análise consolidada dos kanbans, vendedores e cards problemáticos.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Label htmlFor="start" className="text-xs text-muted-foreground">De</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[140px]" />
              <Label htmlFor="end" className="text-xs text-muted-foreground">Até</Label>
              <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[140px]" />
            </div>
            <Button variant="outline" size="icon" onClick={() => analysis.refetch()} title="Atualizar">
              <RefreshCw className={`h-4 w-4 ${analysis.isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <ConfigDialog
              open={configOpen}
              onOpenChange={setConfigOpen}
              config={cfgQuery.data}
              options={optsQuery.data}
            />
          </div>
        </div>

        {/* Estado: nenhum escopo configurado */}
        {!cfgQuery.isLoading && !hasScope && (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center space-y-3">
              <Settings2 className="h-8 w-8 text-muted-foreground mx-auto" />
              <div>
                <p className="font-medium">Configure o escopo do Supervisor</p>
                <p className="text-sm text-muted-foreground">Selecione os kanbans (funis CRM, homologação, licitação), grupos e usuários que ele deve monitorar.</p>
              </div>
              <Button onClick={() => setConfigOpen(true)}><Settings2 className="h-4 w-4 mr-2" />Abrir configuração</Button>
            </CardContent>
          </Card>
        )}

        {/* Resumo */}
        {analysis.isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : analysis.data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard icon={TrendingUp} label="Negociações criadas" value={analysis.data.summary.total_deals_created} accent="text-emerald-600" />
            <SummaryCard icon={Building2} label="Empresas novas" value={analysis.data.summary.total_companies_created} accent="text-sky-600" />
            <SummaryCard icon={FileWarning} label="Cards incompletos" value={analysis.data.summary.total_incomplete} accent="text-amber-600" />
            <SummaryCard icon={Clock} label={`Parados há ≥ ${analysis.data.period.stale_hours}h`} value={analysis.data.summary.total_stale} accent="text-red-600" />
          </div>
        )}

        {/* Conteúdo */}
        {analysis.data && (
          <Tabs defaultValue="vendedores" className="space-y-4">
            <TabsList>
              <TabsTrigger value="vendedores">Por vendedor</TabsTrigger>
              <TabsTrigger value="kanbans">Por kanban</TabsTrigger>
              <TabsTrigger value="empresas">Empresas novas</TabsTrigger>
            </TabsList>

            <TabsContent value="vendedores">
              <Card>
                <CardHeader>
                  <CardTitle>Negociações criadas por vendedor</CardTitle>
                  <CardDescription>Período: {analysis.data.period.start_date} → {analysis.data.period.end_date}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendedor</TableHead>
                        <TableHead className="text-right">Negociações</TableHead>
                        <TableHead className="text-right">Valor total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.data.deals_by_owner.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma negociação no período.</TableCell></TableRow>
                      ) : analysis.data.deals_by_owner.map(r => (
                        <TableRow key={r.owner_id}>
                          <TableCell>{r.owner_name}</TableCell>
                          <TableCell className="text-right font-medium">{r.deals_created}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.total_value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="kanbans" className="space-y-4">
              {analysis.data.diagnostics.length === 0 ? (
                <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum kanban selecionado no escopo.</CardContent></Card>
              ) : analysis.data.diagnostics.map(d => (
                <KanbanDiagnosticCard key={`${d.kind}-${d.id}`} diagnostic={d} />
              ))}
            </TabsContent>


            <TabsContent value="empresas">
              <Card>
                <CardHeader>
                  <CardTitle>Empresas cadastradas por usuário</CardTitle>
                  <CardDescription>Período: {analysis.data.period.start_date} → {analysis.data.period.end_date}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead className="text-right">Empresas novas</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.data.new_companies_by_user.length === 0 ? (
                        <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-6">Nenhuma empresa nova no período.</TableCell></TableRow>
                      ) : analysis.data.new_companies_by_user.map(r => (
                        <TableRow key={r.created_by}>
                          <TableCell>{r.created_by_name}</TableCell>
                          <TableCell className="text-right font-medium">{r.companies_created}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${accent || ''}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

type ProblemCard = SupervisorIAAnalysis['diagnostics'][number]['problem_cards'][number];
type Diagnostic = SupervisorIAAnalysis['diagnostics'][number];
type FilterKey = 'all' | 'incomplete' | 'without_followup' | 'without_history' | 'stale';

function cardMatchesFilter(c: ProblemCard, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'incomplete') return c.issues.some(i => ['Sem empresa','Sem valor','Sem responsável','Sem contato','Sem CNPJ','Sem órgão'].includes(i));
  if (f === 'without_followup') return c.issues.includes('Sem follow-up');
  if (f === 'without_history') return c.issues.includes('Sem histórico');
  if (f === 'stale') return c.issues.some(i => i.startsWith('Parado há'));
  return true;
}

function KanbanDiagnosticCard({ diagnostic: d }: { diagnostic: Diagnostic }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [selected, setSelected] = useState<ProblemCard | null>(null);

  const filtered = useMemo(() => d.problem_cards.filter(c => cardMatchesFilter(c, filter)), [d.problem_cards, filter]);

  const chip = (key: FilterKey, count: number, label: string, cls: string) => (
    <button
      type="button"
      onClick={() => setFilter(prev => prev === key ? 'all' : key)}
      className={`px-2 py-1 rounded-md text-xs font-medium transition ${cls} ${filter === key ? 'ring-2 ring-offset-1 ring-primary' : 'opacity-90 hover:opacity-100'}`}
    >
      {count} {label}
    </button>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4" style={{ color: d.color || undefined }} />
            <CardTitle className="text-base">{d.name}</CardTitle>
            <Badge variant="outline" className="text-[10px]">
              {d.kind === 'crm_funnel' ? 'CRM' : d.kind === 'homologation_board' ? 'Homologação' : 'Licitação'}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-2 py-1 rounded-md text-xs font-medium bg-secondary text-secondary-foreground transition ${filter === 'all' ? 'ring-2 ring-offset-1 ring-primary' : 'opacity-90 hover:opacity-100'}`}
            >
              {d.total} cards
            </button>
            {chip('incomplete', d.incomplete, 'incompletos', 'bg-amber-100 text-amber-700')}
            {chip('without_followup', d.without_followup, 'sem follow-up', 'bg-orange-100 text-orange-700')}
            {chip('without_history', d.without_history, 'sem histórico', 'bg-gray-200 text-gray-700')}
            {chip('stale', d.stale, 'parados', 'bg-red-100 text-red-700')}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {d.problem_cards.length === 0 ? 'Sem alertas neste kanban. 👏' : 'Nenhum card neste filtro.'}
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Card</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Problemas</TableHead>
                  <TableHead className="text-right">Parado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/60"
                    onClick={() => setSelected(c)}
                  >
                    <TableCell className="max-w-[280px]">
                      <div className="font-medium truncate">{c.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.company_name || '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs">{c.stage_name || '—'}</TableCell>
                    <TableCell className="text-xs">{c.owner_name || <span className="text-red-600">Sem dono</span>}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.issues.map(i => (
                          <Badge key={i} variant="outline" className="text-[10px] gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" /> {i}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs">{c.hours_idle}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg" aria-describedby="supervisor-card-desc">
          <DialogHeader>
            <DialogTitle className="pr-6">{selected?.title || 'Card'}</DialogTitle>
            <DialogDescription id="supervisor-card-desc">
              Resumo do card identificado pelo Supervisor IA em <strong>{d.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Empresa</p>
                  <p className="font-medium">{selected.company_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Etapa</p>
                  <p className="font-medium">{selected.stage_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Responsável</p>
                  <p className="font-medium">{selected.owner_name || <span className="text-red-600">Sem dono</span>}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="font-medium">{formatCurrency(selected.value)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Parado há</p>
                  <p className="font-medium">{selected.hours_idle}h</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Kanban</p>
                  <p className="font-medium">{d.name}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Problemas detectados</p>
                <div className="flex flex-wrap gap-1">
                  {selected.issues.length === 0 ? (
                    <span className="text-xs text-muted-foreground">Nenhum</span>
                  ) : selected.issues.map(i => (
                    <Badge key={i} variant="outline" className="text-[10px] gap-1">
                      <AlertTriangle className="h-2.5 w-2.5" /> {i}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                Este card foi sinalizado porque {selected.issues.length > 0
                  ? `apresenta: ${selected.issues.join(', ').toLowerCase()}.`
                  : 'está em alerta no kanban.'} Abra o módulo original para tratá-lo.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


// ---------------- CONFIG DIALOG ----------------
interface ConfigDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config?: SupervisorIAConfig;
  options?: any;
}
function ConfigDialog({ open, onOpenChange, config, options }: ConfigDialogProps) {
  const update = useSupervisorIAUpdateConfig();
  const [local, setLocal] = useState<SupervisorIAConfig | null>(null);

  // Sincroniza quando abrir
  const draft = local ?? config ?? {
    funnel_ids: [], homologation_board_ids: [], licitacao_board_ids: [], group_ids: [], user_ids: [], representative_ids: [],
    rule_require_company: true, rule_require_value: true, rule_require_owner: true,
    rule_require_contact: true, rule_require_followup: true, rule_require_history: true,
    rule_company_stage_ids: [], rule_value_stage_ids: [], rule_owner_stage_ids: [],
    rule_contact_stage_ids: [], rule_followup_stage_ids: [], rule_history_stage_ids: [],
    stale_hours: 72,
  };

  const set = <K extends keyof SupervisorIAConfig>(key: K, val: SupervisorIAConfig[K]) => {
    setLocal({ ...draft, [key]: val });
  };

  const toggleId = (key: 'funnel_ids' | 'homologation_board_ids' | 'licitacao_board_ids' | 'group_ids' | 'user_ids' | 'representative_ids' | 'rule_company_stage_ids' | 'rule_value_stage_ids' | 'rule_owner_stage_ids' | 'rule_contact_stage_ids' | 'rule_followup_stage_ids' | 'rule_history_stage_ids', id: string) => {
    const cur = new Set(draft[key]);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    set(key, Array.from(cur) as any);
  };

  const handleSave = async () => {
    await update.mutateAsync(draft);
    setLocal(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setLocal(null); onOpenChange(v); }}>
      <DialogTrigger asChild>
        <Button variant="default"><Settings2 className="h-4 w-4 mr-2" />Configurar escopo</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" aria-describedby="supervisor-cfg-desc">
        <DialogHeader>
          <DialogTitle>Escopo do Supervisor IA</DialogTitle>
          <DialogDescription id="supervisor-cfg-desc">
            Selecione os kanbans, grupos e usuários que o supervisor deve monitorar. Define também o que é considerado um "card incompleto".
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 -mx-6 px-6 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
          <Tabs defaultValue="kanbans" className="space-y-4">
            <TabsList>
              <TabsTrigger value="kanbans">Kanbans</TabsTrigger>
              <TabsTrigger value="pessoas">Pessoas</TabsTrigger>
              <TabsTrigger value="regras">Regras</TabsTrigger>
            </TabsList>

            <TabsContent value="kanbans" className="space-y-6">
              <PickerGroup
                title="Funis CRM"
                items={options?.funnels || []}
                selected={draft.funnel_ids}
                onToggle={(id) => toggleId('funnel_ids', id)}
              />
              <PickerGroup
                title="Quadros de Homologação"
                items={options?.homologation_boards || []}
                selected={draft.homologation_board_ids}
                onToggle={(id) => toggleId('homologation_board_ids', id)}
              />
              <PickerGroup
                title="Quadros de Licitação"
                items={options?.licitacao_boards || []}
                selected={draft.licitacao_board_ids}
                onToggle={(id) => toggleId('licitacao_board_ids', id)}
              />
            </TabsContent>

            <TabsContent value="pessoas" className="space-y-6">
              <PickerGroup
                title="Grupos (todos os membros entram no escopo)"
                items={options?.groups || []}
                selected={draft.group_ids}
                onToggle={(id) => toggleId('group_ids', id)}
              />
              <PickerGroup
                title="Usuários individuais"
                items={(options?.users || []).map((u: any) => ({ id: u.id, name: u.name }))}
                selected={draft.user_ids}
                onToggle={(id) => toggleId('user_ids', id)}
              />
              <PickerGroup
                title="Representantes"
                items={options?.representatives || []}
                selected={draft.representative_ids}
                onToggle={(id) => toggleId('representative_ids', id)}
              />
              <p className="text-xs text-muted-foreground">
                Se nenhum grupo/usuário for selecionado, o supervisor analisa todos os usuários da organização nos kanbans escolhidos. Representantes filtram apenas negociações vinculadas a eles.
              </p>
            </TabsContent>

            <TabsContent value="regras" className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Cada regra pode valer para o kanban inteiro (deixe sem etapa marcada) ou somente para etapas/colunas específicas. Ex.: marque "Negociação" na regra <em>Sem valor</em> para só cobrar valor preenchido nessa etapa.
              </p>
              <RuleRowWithStages label="Sem empresa vinculada" checked={draft.rule_require_company} onChange={(v) => set('rule_require_company', v)} stages={options?.stages} funnelIds={draft.funnel_ids} selectedStages={draft.rule_company_stage_ids} onToggleStage={(id) => toggleId('rule_company_stage_ids', id)} />
              <RuleRowWithStages label="Sem valor preenchido" checked={draft.rule_require_value} onChange={(v) => set('rule_require_value', v)} stages={options?.stages} funnelIds={draft.funnel_ids} selectedStages={draft.rule_value_stage_ids} onToggleStage={(id) => toggleId('rule_value_stage_ids', id)} />
              <RuleRowWithStages label="Sem responsável" checked={draft.rule_require_owner} onChange={(v) => set('rule_require_owner', v)} stages={options?.stages} funnelIds={draft.funnel_ids} selectedStages={draft.rule_owner_stage_ids} onToggleStage={(id) => toggleId('rule_owner_stage_ids', id)} />
              <RuleRowWithStages label="Sem contato vinculado" checked={draft.rule_require_contact} onChange={(v) => set('rule_require_contact', v)} stages={options?.stages} funnelIds={draft.funnel_ids} selectedStages={draft.rule_contact_stage_ids} onToggleStage={(id) => toggleId('rule_contact_stage_ids', id)} />
              <RuleRowWithStages label="Sem follow-up agendado" checked={draft.rule_require_followup} onChange={(v) => set('rule_require_followup', v)} stages={options?.stages} funnelIds={draft.funnel_ids} selectedStages={draft.rule_followup_stage_ids} onToggleStage={(id) => toggleId('rule_followup_stage_ids', id)} />
              <RuleRowWithStages label="Sem histórico de movimentação" checked={draft.rule_require_history} onChange={(v) => set('rule_require_history', v)} stages={options?.stages} funnelIds={draft.funnel_ids} selectedStages={draft.rule_history_stage_ids} onToggleStage={(id) => toggleId('rule_history_stage_ids', id)} />
              <div className="flex items-center justify-between border rounded-lg p-3">
                <div>
                  <p className="font-medium text-sm">Horas para considerar "parado"</p>
                  <p className="text-xs text-muted-foreground">Cards sem movimento por mais que este tempo viram alerta vermelho.</p>
                </div>
                <Input
                  type="number"
                  className="w-24"
                  value={draft.stale_hours}
                  onChange={(e) => set('stale_hours', Number(e.target.value) || 72)}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setLocal(null); onOpenChange(false); }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Salvando…' : 'Salvar configuração'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickerGroup({ title, items, selected, onToggle }: { title: string; items: { id: string; name: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">{title} <span className="text-xs text-muted-foreground">({selected.length}/{items.length})</span></p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nada disponível.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {items.map(it => {
            const checked = selected.includes(it.id);
            return (
              <label key={it.id} className="flex items-center gap-2 border rounded-md p-2 cursor-pointer hover:bg-muted/50">
                <Checkbox checked={checked} onCheckedChange={() => onToggle(it.id)} />
                <span className="text-sm truncate">{it.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RuleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between border rounded-lg p-3">
      <p className="text-sm">{label}</p>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function RuleRowWithStages({
  label, checked, onChange, stages, funnelIds, selectedStages, onToggleStage,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  stages?: { id: string; name: string; funnel_id: string }[];
  funnelIds: string[];
  selectedStages: string[];
  onToggleStage: (id: string) => void;
}) {
  const scopedStages = (stages || []).filter(s => funnelIds.includes(s.funnel_id));
  return (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
      {checked && (
        scopedStages.length === 0 ? (
          <p className="text-xs text-muted-foreground">Selecione funis em "Kanbans" para escolher etapas específicas. Sem etapa marcada = aplica em todas.</p>
        ) : (
          <div>
            <p className="text-[11px] text-muted-foreground mb-1">
              Aplicar somente nas etapas: <span className="font-medium">{selectedStages.length === 0 ? 'todas' : `${selectedStages.length} selecionada(s)`}</span>
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {scopedStages.map(s => {
                const on = selectedStages.includes(s.id);
                return (
                  <label key={s.id} className={`flex items-center gap-1.5 border rounded px-2 py-1 cursor-pointer hover:bg-muted/50 ${on ? 'bg-primary/5 border-primary/40' : ''}`}>
                    <Checkbox checked={on} onCheckedChange={() => onToggleStage(s.id)} />
                    <span className="text-xs truncate">{s.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )
      )}
    </div>
  );
}
