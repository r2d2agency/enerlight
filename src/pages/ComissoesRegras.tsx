import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Settings2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCommissionRules, useCommissionRulesMutations, useCommissionOrgUsers,
  Tier, CommissionRule,
} from "@/hooks/use-commission";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function ComissoesRegras() {
  const { data: rules, isLoading } = useCommissionRules();
  const { data: users } = useCommissionOrgUsers();
  const [editing, setEditing] = useState<Partial<CommissionRule> & { user_id?: string } | null>(null);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Settings2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Regras de Comissão</h1>
        </div>
        <Button onClick={() => setEditing({ base_percent: 0, tiers: [], active: true })}>
          <Plus className="h-4 w-4 mr-1" /> Nova regra
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Configure o percentual base e faixas de bônus por vendedor. Ex.: base 1% + faixa "Meta 300k" com bônus R$ 300 fixos; faixa "Meta 400k" com bônus adicional 0,01%.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead>Faixas</TableHead>
                  <TableHead>Ativa</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rules || []).map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{r.user_name}</div>
                      <div className="text-xs text-muted-foreground">{r.user_email}</div>
                    </TableCell>
                    <TableCell className="text-right">{Number(r.base_percent)}%</TableCell>
                    <TableCell className="text-sm">
                      {r.tiers?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {r.tiers.map((t, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {fmt(t.target)}{t.extra_percent > 0 && ` +${t.extra_percent}%`}{t.extra_fixed > 0 && ` +${fmt(t.extra_fixed)}`}
                            </Badge>
                          ))}
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                      {r.redbar_enabled && (
                        <div className="mt-1">
                          <Badge className="bg-red-100 text-red-700 text-xs">Red Bar: {Number(r.redbar_base_percent || 0)}%{r.redbar_tiers?.length ? ` • ${r.redbar_tiers.length} faixa(s)` : ""}</Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={r.active ? "bg-green-100 text-green-700" : "bg-gray-200"}>{r.active ? "Sim" : "Não"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!rules?.length && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Nenhuma regra cadastrada</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <RuleDialog rule={editing} onClose={() => setEditing(null)} users={users || []} existing={rules || []} />
    </div>
  );
}

function RuleDialog({ rule, onClose, users, existing }: {
  rule: (Partial<CommissionRule> & { user_id?: string }) | null;
  onClose: () => void; users: any[]; existing: CommissionRule[];
}) {
  const { upsert, remove } = useCommissionRulesMutations();
  const [userId, setUserId] = useState("");
  const [basePercent, setBasePercent] = useState("0");
  const [active, setActive] = useState(true);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [redbarEnabled, setRedbarEnabled] = useState(false);
  const [redbarBasePercent, setRedbarBasePercent] = useState("0");
  const [redbarTiers, setRedbarTiers] = useState<Tier[]>([]);

  useEffect(() => {
    if (rule) {
      setUserId(rule.user_id || "");
      setBasePercent(String(rule.base_percent ?? 0));
      setActive(rule.active !== false);
      setTiers(Array.isArray(rule.tiers) ? [...rule.tiers] : []);
      setRedbarEnabled(!!rule.redbar_enabled);
      setRedbarBasePercent(String(rule.redbar_base_percent ?? 0));
      setRedbarTiers(Array.isArray(rule.redbar_tiers) ? [...rule.redbar_tiers] : []);
    }
  }, [rule]);

  const isNew = !rule?.id;
  const existingUserIds = new Set(existing.map(r => r.user_id));

  const addTier = () => setTiers([...tiers, { label: `Meta ${tiers.length + 1}`, target: 0, extra_percent: 0, extra_fixed: 0 }]);
  const updateTier = (i: number, patch: Partial<Tier>) => setTiers(tiers.map((t, ix) => ix === i ? { ...t, ...patch } : t));
  const removeTier = (i: number) => setTiers(tiers.filter((_, ix) => ix !== i));

  const addRedTier = () => setRedbarTiers([...redbarTiers, { label: `Red Bar ${redbarTiers.length + 1}`, target: 0, extra_percent: 0, extra_fixed: 0 }]);
  const updateRedTier = (i: number, patch: Partial<Tier>) => setRedbarTiers(redbarTiers.map((t, ix) => ix === i ? { ...t, ...patch } : t));
  const removeRedTier = (i: number) => setRedbarTiers(redbarTiers.filter((_, ix) => ix !== i));

  const save = async () => {
    if (!userId) { toast.error("Selecione o vendedor"); return; }
    await upsert.mutateAsync({
      user_id: userId,
      base_percent: Number(basePercent) || 0,
      tiers,
      active,
      redbar_enabled: redbarEnabled,
      redbar_base_percent: Number(redbarBasePercent) || 0,
      redbar_tiers: redbarTiers,
    });
    toast.success("Regra salva");
    onClose();
  };

  const doDelete = async () => {
    if (!rule?.user_id || !rule?.id) return;
    if (!confirm("Excluir regra deste vendedor?")) return;
    await remove.mutateAsync(rule.user_id);
    toast.success("Regra removida");
    onClose();
  };

  return (
    <Dialog open={!!rule} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isNew ? "Nova regra de comissão" : "Editar regra"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Vendedor</Label>
            <Select value={userId} onValueChange={setUserId} disabled={!isNew}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {users
                  .filter(u => isNew ? !existingUserIds.has(u.id) : u.id === userId)
                  .map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>% base sobre faturamento validado</Label>
              <Input type="number" step="0.001" value={basePercent} onChange={e => setBasePercent(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Ex.: 1 = 1%. Deixe 0 se comissiona só por bônus.</p>
            </div>
            <div className="flex items-end gap-2">
              <Switch checked={active} onCheckedChange={setActive} />
              <Label>Ativa</Label>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Faixas de bônus (metas)</Label>
              <Button size="sm" variant="outline" onClick={addTier}><Plus className="h-3 w-3 mr-1" /> Adicionar faixa</Button>
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
                <div className="col-span-3">
                  <Label className="text-xs">Rótulo</Label>
                  <Input value={t.label} onChange={e => updateTier(i, { label: e.target.value })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Meta (R$)</Label>
                  <Input type="number" value={t.target} onChange={e => updateTier(i, { target: Number(e.target.value) })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Bônus %</Label>
                  <Input type="number" step="0.001" value={t.extra_percent} onChange={e => updateTier(i, { extra_percent: Number(e.target.value) })} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Bônus fixo (R$)</Label>
                  <Input type="number" step="0.01" value={t.extra_fixed} onChange={e => updateTier(i, { extra_fixed: Number(e.target.value) })} />
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeTier(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            {!tiers.length && <p className="text-xs text-muted-foreground">Nenhuma faixa. O vendedor receberá apenas o % base.</p>}
          </div>

          {/* Red Bar */}
          <div className="rounded-lg border border-red-300/60 bg-red-50/40 dark:bg-red-950/10 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold text-red-700 dark:text-red-400">Regra específica Red Bar</Label>
                <p className="text-xs text-muted-foreground">Pedidos identificados como "Red Bar" (canal/cliente/grupo/pedido contém "red bar") usarão o percentual e faixas abaixo em vez da regra padrão.</p>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={redbarEnabled} onCheckedChange={setRedbarEnabled} />
                <Label className="text-xs">Ativar</Label>
              </div>
            </div>
            {redbarEnabled && (
              <>
                <div>
                  <Label className="text-xs">% base sobre faturamento Red Bar validado</Label>
                  <Input type="number" step="0.001" value={redbarBasePercent} onChange={e => setRedbarBasePercent(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Faixas de bônus Red Bar</Label>
                    <Button size="sm" variant="outline" onClick={addRedTier}><Plus className="h-3 w-3 mr-1" /> Adicionar faixa</Button>
                  </div>
                  {redbarTiers.map((t, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2 bg-background">
                      <div className="col-span-3">
                        <Label className="text-xs">Rótulo</Label>
                        <Input value={t.label} onChange={e => updateRedTier(i, { label: e.target.value })} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs">Meta (R$)</Label>
                        <Input type="number" value={t.target} onChange={e => updateRedTier(i, { target: Number(e.target.value) })} />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Bônus %</Label>
                        <Input type="number" step="0.001" value={t.extra_percent} onChange={e => updateRedTier(i, { extra_percent: Number(e.target.value) })} />
                      </div>
                      <div className="col-span-3">
                        <Label className="text-xs">Bônus fixo (R$)</Label>
                        <Input type="number" step="0.01" value={t.extra_fixed} onChange={e => updateRedTier(i, { extra_fixed: Number(e.target.value) })} />
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => removeRedTier(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                  {!redbarTiers.length && <p className="text-xs text-muted-foreground">Sem faixas específicas para Red Bar — apenas o % base será aplicado.</p>}
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {!isNew && <Button variant="destructive" onClick={doDelete}><Trash2 className="h-4 w-4 mr-1" /> Excluir</Button>}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={upsert.isPending}>Salvar</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
