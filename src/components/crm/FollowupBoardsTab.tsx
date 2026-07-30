import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Briefcase, CheckCircle2, Clock, Filter, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface Props {
  startDate: string;
  endDate: string;
  userId?: string;
  channel?: string;
  groupId?: string;
}

type BoardKey = "carteira" | "prontos" | "aguardando";

const BOARDS: { key: BoardKey; label: string; icon: any }[] = [
  { key: "carteira", label: "Pedidos em Carteira", icon: Briefcase },
  { key: "prontos", label: "Pedidos Prontos", icon: CheckCircle2 },
  { key: "aguardando", label: "Pedidos Aguardando Informação", icon: Clock },
];

const STORAGE_KEY = "crm-followup-boards-v1";

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function safeDate(v: any) {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : format(d, "dd/MM/yyyy");
}

export function FollowupBoardsTab({ startDate, endDate, userId, channel, groupId }: Props) {
  const { user } = useAuth();
  const canEditFilters = !!(user?.is_superadmin || user?.role === "owner" || user?.role === "admin");
  const [active, setActive] = useState<BoardKey>("carteira");
  const [selection, setSelection] = useState<Record<BoardKey, string[]>>({
    carteira: [],
    prontos: [],
    aguardando: [],
  });
  const [search, setSearch] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSelection((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch (_) { /* ignore */ }
    // Server config (usado também no relatório de WhatsApp)
    api<any>("/api/crm/goals/followup-config")
      .then((cfg) => {
        setSelection((prev) => ({
          ...prev,
          carteira: cfg?.carteira_values?.length ? cfg.carteira_values : prev.carteira,
          prontos: cfg?.prontos_values?.length ? cfg.prontos_values : prev.prontos,
          aguardando: cfg?.waiting_values?.length ? cfg.waiting_values : prev.aguardando,
        }));
      })
      .catch(() => { /* ignore */ });
  }, []);

  const persist = (next: Record<BoardKey, string[]>) => {
    setSelection(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) { /* ignore */ }
    api("/api/crm/goals/followup-config", {
      method: "PUT",
      body: JSON.stringify({
        carteira_values: next.carteira,
        prontos_values: next.prontos,
        waiting_values: next.aguardando,
      }),
    }).catch(() => { /* ignore */ });
  };


  const { data: followups } = useQuery({
    queryKey: ["crm-goals-followups"],
    queryFn: () => api<{ followup: string; count: number }[]>("/api/crm/goals/followups"),
  });

  const selected = selection[active];

  const { data, isLoading } = useQuery({
    queryKey: ["crm-followup-board", active, selected, startDate, endDate, userId, channel, groupId, search],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", startDate);
      sp.set("end_date", endDate);
      sp.set("data_type", "pedido");
      sp.set("limit", "200");
      sp.set("page", "1");
      sp.set("followups", selected.join("|"));
      if (userId && userId !== "all") sp.set("user_id", userId);
      if (channel && channel !== "all") sp.set("channel", channel);
      if (groupId && groupId !== "all") sp.set("group_id", groupId);
      if (search) sp.set("search", search);
      return api<any>(`/api/crm/goals/data-records?${sp.toString()}`);
    },
    enabled: selected.length > 0,
  });

  const records: any[] = data?.records || [];
  const totalValue = data?.totals?.total_value || 0;
  const total = data?.total || 0;

  const byFollowup = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    for (const r of records) {
      const key = (r.followup || "—").trim() || "—";
      if (!map[key]) map[key] = { count: 0, value: 0 };
      map[key].count++;
      map[key].value += Number(r.value || 0);
    }
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [records]);

  const toggle = (value: string) => {
    const next = { ...selection };
    next[active] = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    persist(next);
  };

  return (
    <Tabs value={active} onValueChange={(v) => setActive(v as BoardKey)} className="space-y-4">
      <TabsList className="flex-wrap h-auto">
        {BOARDS.map((b) => {
          const Icon = b.icon;
          return (
            <TabsTrigger key={b.key} value={b.key} className="gap-2 text-xs sm:text-sm">
              <Icon className="h-4 w-4" /> {b.label}
              {selection[b.key].length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px]">{selection[b.key].length}</Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {BOARDS.map((b) => (
        <TabsContent key={b.key} value={b.key} className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-base">{b.label}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Buscar cliente, pedido, vendedor..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9 w-[240px]"
                  />
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Filter className="h-4 w-4" />
                        FollowUps ({selected.length})
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[320px] p-0">
                      <div className="flex items-center justify-between border-b px-3 py-2">
                        <span className="text-sm font-medium">Selecionar FollowUps</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => persist({ ...selection, [b.key]: [] })}
                        >
                          Limpar
                        </Button>
                      </div>
                      <ScrollArea className="h-[300px]">
                        <div className="p-2 space-y-1">
                          {(followups || []).length === 0 && (
                            <p className="p-3 text-sm text-muted-foreground">
                              Nenhum FollowUp encontrado nas importações.
                            </p>
                          )}
                          {(followups || []).map((f) => (
                            <label
                              key={f.followup}
                              className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={selected.includes(f.followup)}
                                onCheckedChange={() => toggle(f.followup)}
                                className="mt-0.5"
                              />
                              <span className="flex-1">{f.followup}</span>
                              <span className="text-xs text-muted-foreground">{f.count}</span>
                            </label>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2">
                  {selected.map((s) => (
                    <Badge key={s} variant="outline" className="text-[11px]">{s}</Badge>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {selected.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Selecione os FollowUps que compõem esta guia.
                </p>
              ) : isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Pedidos</p>
                      <p className="text-xl font-semibold">{total}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Valor total</p>
                      <p className="text-xl font-semibold text-emerald-600">{fmt(totalValue)}</p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs text-muted-foreground">Ticket médio</p>
                      <p className="text-xl font-semibold">{fmt(total > 0 ? totalValue / total : 0)}</p>
                    </div>
                  </div>

                  {byFollowup.length > 0 && (
                    <div className="rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>FollowUp</TableHead>
                            <TableHead className="text-right">Qtd</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byFollowup.map(([key, v]) => (
                            <TableRow key={key}>
                              <TableCell className="text-sm">{key}</TableCell>
                              <TableCell className="text-right text-sm">{v.count}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{fmt(v.value)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Vendedor</TableHead>
                          <TableHead>Canal</TableHead>
                          <TableHead>FollowUp</TableHead>
                          <TableHead>Emissão</TableHead>
                          <TableHead>Entrega</TableHead>
                          <TableHead>UF</TableHead>
                          <TableHead className="text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                              Nenhum pedido encontrado para os FollowUps selecionados.
                            </TableCell>
                          </TableRow>
                        )}
                        {records.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-sm">{r.number || "—"}</TableCell>
                            <TableCell className="max-w-[220px] truncate">{r.client_name || "—"}</TableCell>
                            <TableCell className="text-sm">{r.seller_name || "—"}</TableCell>
                            <TableCell className="text-sm">
                              {r.channel ? <Badge variant="outline" className="text-[11px]">{r.channel}</Badge> : "—"}
                            </TableCell>
                            <TableCell className="max-w-[220px] truncate text-sm" title={r.followup || ""}>
                              {r.followup || "—"}
                            </TableCell>
                            <TableCell className="text-sm">{safeDate(r.emission_date)}</TableCell>
                            <TableCell className="text-sm">{safeDate(r.delivery_date)}</TableCell>
                            <TableCell className="text-sm">{r.state || "—"}</TableCell>
                            <TableCell className="text-right font-medium">{fmt(Number(r.value || 0))}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      {records.length > 0 && (
                        <TableBody>
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell colSpan={8}>Total{total > records.length ? ` (exibindo ${records.length} de ${total})` : ""}</TableCell>
                            <TableCell className="text-right text-emerald-600">{fmt(totalValue)}</TableCell>
                          </TableRow>
                        </TableBody>
                      )}
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
