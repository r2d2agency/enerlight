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
                <Card key={`${d.kind}-${d.id}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <ListChecks className="h-4 w-4" style={{ color: d.color || undefined }} />
                        <CardTitle className="text-base">{d.name}</CardTitle>
                        <Badge variant="outline" className="text-[10px]">
                          {d.kind === 'crm_funnel' ? 'CRM' : d.kind === 'homologation_board' ? 'Homologação' : 'Licitação'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant="secondary">{d.total} cards</Badge>
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{d.incomplete} incompletos</Badge>
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">{d.without_followup} sem follow-up</Badge>
                        <Badge className="bg-gray-200 text-gray-700 hover:bg-gray-200">{d.without_history} sem histórico</Badge>
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{d.stale} parados</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {d.problem_cards.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem alertas neste kanban. 👏</p>
                    ) : (
                      <ScrollArea className="max-h-[420px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Card</TableHead>
                              <TableHead>Etapa</TableHead>
                              <TableHead>Responsável</TableHead>
                              <TableHead>Problemas</TableHead>
                              <TableHead className="text-right">Parado</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {d.problem_cards.map(c => (
                              <TableRow key={c.id}>
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
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
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
    funnel_ids: [], homologation_board_ids: [], licitacao_board_ids: [], group_ids: [], user_ids: [],
    rule_require_company: true, rule_require_value: true, rule_require_owner: true,
    rule_require_contact: true, rule_require_followup: true, rule_require_history: true,
    stale_hours: 72,
  };

  const set = <K extends keyof SupervisorIAConfig>(key: K, val: SupervisorIAConfig[K]) => {
    setLocal({ ...(local ?? config!), [key]: val });
  };

  const toggleId = (key: 'funnel_ids' | 'homologation_board_ids' | 'licitacao_board_ids' | 'group_ids' | 'user_ids', id: string) => {
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

        <ScrollArea className="flex-1 -mx-6 px-6">
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
              <p className="text-xs text-muted-foreground">
                Se nenhum grupo/usuário for selecionado, o supervisor analisa todos os usuários da organização nos kanbans escolhidos.
              </p>
            </TabsContent>

            <TabsContent value="regras" className="space-y-4">
              <RuleRow label="Sem empresa vinculada" checked={draft.rule_require_company} onChange={(v) => set('rule_require_company', v)} />
              <RuleRow label="Sem valor preenchido" checked={draft.rule_require_value} onChange={(v) => set('rule_require_value', v)} />
              <RuleRow label="Sem responsável" checked={draft.rule_require_owner} onChange={(v) => set('rule_require_owner', v)} />
              <RuleRow label="Sem contato vinculado" checked={draft.rule_require_contact} onChange={(v) => set('rule_require_contact', v)} />
              <RuleRow label="Sem follow-up agendado" checked={draft.rule_require_followup} onChange={(v) => set('rule_require_followup', v)} />
              <RuleRow label="Sem histórico de movimentação" checked={draft.rule_require_history} onChange={(v) => set('rule_require_history', v)} />
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
        </ScrollArea>

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
