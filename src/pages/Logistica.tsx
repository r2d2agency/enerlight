import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus, Search, Trash2, Edit, Truck, Package, Calendar,
  DollarSign, Upload, Loader2, BarChart3, TrendingUp, TrendingDown,
  Filter, FileSpreadsheet, ArrowUpDown, Eye
} from "lucide-react";
import {
  useLogisticsShipments, useLogisticsDashboard, useLogisticsMembers,
  useCreateShipment, useUpdateShipment, useDeleteShipment, useImportShipments,
  LogisticsShipment,
} from "@/hooks/use-logistics";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

const STATUSES = ["Pendente", "Em trânsito", "Entregue no prazo", "Entregue com atraso", "Cancelado"];
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);

type DatePreset = "month" | "week" | "all" | "custom";

export default function Logistica() {
  const [activeTab, setActiveTab] = useState("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [editingShipment, setEditingShipment] = useState<LogisticsShipment | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewShipment, setViewShipment] = useState<LogisticsShipment | null>(null);
  const { toast } = useToast();

  const dateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === "month") return { start_date: format(startOfMonth(now), "yyyy-MM-dd"), end_date: format(endOfMonth(now), "yyyy-MM-dd") };
    if (datePreset === "week") return { start_date: format(startOfWeek(now, { locale: ptBR }), "yyyy-MM-dd"), end_date: format(endOfWeek(now, { locale: ptBR }), "yyyy-MM-dd") };
    if (datePreset === "custom" && customStart && customEnd) return { start_date: customStart, end_date: customEnd };
    return {};
  }, [datePreset, customStart, customEnd]);

  const { data: shipments, isLoading } = useLogisticsShipments({ search, status: statusFilter, ...dateRange });
  const { data: dashboard } = useLogisticsDashboard(dateRange);
  const { data: members } = useLogisticsMembers();
  const createMut = useCreateShipment();
  const updateMut = useUpdateShipment();
  const deleteMut = useDeleteShipment();
  const importMut = useImportShipments();

  const handleSave = (data: Partial<LogisticsShipment>) => {
    if (editingShipment) {
      updateMut.mutate({ id: editingShipment.id, ...data }, { onSuccess: () => { setShowForm(false); setEditingShipment(null); } });
    } else {
      createMut.mutate(data, { onSuccess: () => { setShowForm(false); } });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(sheet);

      const items = rows.map((r) => ({
        company_name: r["EMPRESA"] || "",
        client_name: r["CLIENTE"] || "",
        invoice_number: String(r["NOTA FISCAL"] || ""),
        order_number: String(r["PEDIDO"] || ""),
        requested_date: r["DATA SOLICITADA"] ? format(new Date(r["DATA SOLICITADA"]), "yyyy-MM-dd") : null,
        departure_date: r["DATA SAIDA"] ? format(new Date(r["DATA SAIDA"]), "yyyy-MM-dd") : null,
        estimated_delivery: r["PREVISÃO DE ENTREGA"] ? format(new Date(r["PREVISÃO DE ENTREGA"]), "yyyy-MM-dd") : null,
        actual_delivery: r["DATA DE ENTREGA "] || r["DATA DE ENTREGA"] ? format(new Date(r["DATA DE ENTREGA "] || r["DATA DE ENTREGA"]), "yyyy-MM-dd") : null,
        carrier: r["TRANSPORTADORA"] || "",
        volumes: Number(r["QDE VOLUMES"]) || 0,
        freight_paid: Number(r["VALOR PAGO FRETE"]) || 0,
        freight_invoiced: Number(r["VALOR COBRADO NF"]) || 0,
        status: r["SITUAÇÃO"] || "Pendente",
        channel: r["CANAL"] || "",
      }));

      importMut.mutate(items as any, { onSuccess: () => setShowImport(false) });
    } catch (err: any) {
      toast({ title: "Erro ao importar", description: err.message, variant: "destructive" });
    }
  };

  const statusColor = (s: string) => {
    if (s === "Entregue no prazo") return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (s === "Entregue com atraso") return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (s === "Em trânsito") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    if (s === "Pendente") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-muted text-muted-foreground";
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Truck className="h-6 w-6" /> Logística
            </h1>
            <p className="text-sm text-muted-foreground">Controle de remessas, fretes e entregas</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4 mr-1" /> Importar XLSX
            </Button>
            <Button size="sm" onClick={() => { setEditingShipment(null); setShowForm(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nova Remessa
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="list"><Package className="h-4 w-4 mr-1" /> Remessas</TabsTrigger>
            <TabsTrigger value="dashboard"><BarChart3 className="h-4 w-4 mr-1" /> Dashboard</TabsTrigger>
            <TabsTrigger value="wallet"><DollarSign className="h-4 w-4 mr-1" /> Carteira</TabsTrigger>
          </TabsList>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo Período</SelectItem>
                <SelectItem value="month">Mês Atual</SelectItem>
                <SelectItem value="week">Semana</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {datePreset === "custom" && (
              <>
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-[140px] h-9" />
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-[140px] h-9" />
              </>
            )}
          </div>

          <TabsContent value="list" className="mt-3">
            {isLoading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : !shipments?.length ? (
              <div className="text-center py-20 text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Nenhuma remessa encontrada</p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium">NF</th>
                        <th className="text-left p-2 font-medium">Pedido</th>
                        <th className="text-left p-2 font-medium">Cliente</th>
                        <th className="text-left p-2 font-medium">Transportadora</th>
                        <th className="text-left p-2 font-medium">Cód. Cotação</th>
                        <th className="text-right p-2 font-medium">Frete Pago</th>
                        <th className="text-right p-2 font-medium">Cobrado NF</th>
                        <th className="text-right p-2 font-medium">Imposto</th>
                        <th className="text-right p-2 font-medium">Custo Real</th>
                        <th className="text-center p-2 font-medium">Status</th>
                        <th className="text-center p-2 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.map((s) => (
                        <tr key={s.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setViewShipment(s)}>
                          <td className="p-2 font-mono text-xs">{s.invoice_number}</td>
                          <td className="p-2 font-mono text-xs">{s.order_number}</td>
                          <td className="p-2 max-w-[200px] truncate">{s.client_name}</td>
                          <td className="p-2">{s.carrier}</td>
                          <td className="p-2 font-mono text-xs">{s.carrier_quote_code || "—"}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(s.freight_paid))}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(s.freight_invoiced))}</td>
                          <td className="p-2 text-right font-mono">{formatCurrency(Number(s.tax_value))}</td>
                          <td className="p-2 text-right font-mono font-semibold">{formatCurrency(Number(s.real_cost))}</td>
                          <td className="p-2 text-center">
                            <Badge className={cn("text-[10px]", statusColor(s.status))}>{s.status}</Badge>
                          </td>
                          <td className="p-2 text-center">
                            <div className="flex gap-1 justify-center" onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingShipment(s); setShowForm(true); }}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(s.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="dashboard" className="mt-3">
            <DashboardTab dashboard={dashboard} />
          </TabsContent>

          <TabsContent value="wallet" className="mt-3">
            <WalletTab dashboard={dashboard} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Form Dialog */}
      <ShipmentFormDialog
        open={showForm}
        onOpenChange={(v) => { setShowForm(v); if (!v) setEditingShipment(null); }}
        shipment={editingShipment}
        members={members || []}
        onSave={handleSave}
        isSaving={createMut.isPending || updateMut.isPending}
      />

      {/* View Dialog */}
      {viewShipment && (
        <Dialog open={!!viewShipment} onOpenChange={() => setViewShipment(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> Remessa #{viewShipment.invoice_number}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Cliente:</span> <strong>{viewShipment.client_name}</strong></div>
              <div><span className="text-muted-foreground">Empresa:</span> {viewShipment.company_name}</div>
              <div><span className="text-muted-foreground">Pedido:</span> {viewShipment.order_number}</div>
              <div><span className="text-muted-foreground">Canal:</span> {viewShipment.channel}</div>
              <div><span className="text-muted-foreground">Transportadora:</span> {viewShipment.carrier}</div>
              <div><span className="text-muted-foreground">Cód. Cotação:</span> {viewShipment.carrier_quote_code || "—"}</div>
              <div><span className="text-muted-foreground">Volumes:</span> {viewShipment.volumes}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge className={cn("text-[10px]", statusColor(viewShipment.status))}>{viewShipment.status}</Badge></div>
              <div><span className="text-muted-foreground">Solicitada:</span> {viewShipment.requested_date?.split("T")[0] || "—"}</div>
              <div><span className="text-muted-foreground">Saída:</span> {viewShipment.departure_date?.split("T")[0] || "—"}</div>
              <div><span className="text-muted-foreground">Prev. Entrega:</span> {viewShipment.estimated_delivery?.split("T")[0] || "—"}</div>
              <div><span className="text-muted-foreground">Entregue:</span> {viewShipment.actual_delivery?.split("T")[0] || "—"}</div>
              <div className="col-span-2 border-t pt-2 grid grid-cols-4 gap-2">
                <div><span className="text-muted-foreground text-xs block">Frete Pago</span><strong>{formatCurrency(Number(viewShipment.freight_paid))}</strong></div>
                <div><span className="text-muted-foreground text-xs block">Cobrado NF</span><strong>{formatCurrency(Number(viewShipment.freight_invoiced))}</strong></div>
                <div><span className="text-muted-foreground text-xs block">Imposto</span><strong>{formatCurrency(Number(viewShipment.tax_value))}</strong></div>
                <div><span className="text-muted-foreground text-xs block">Custo Real</span><strong className="text-primary">{formatCurrency(Number(viewShipment.real_cost))}</strong></div>
              </div>
              {viewShipment.requester_name && <div className="col-span-2"><span className="text-muted-foreground">Solicitante:</span> {viewShipment.requester_name}</div>}
              {viewShipment.notes && <div className="col-span-2"><span className="text-muted-foreground">Obs:</span> {viewShipment.notes}</div>}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Import Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent>
          <DialogHeader><DialogTitle>Importar Planilha XLSX</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione um arquivo .xlsx com as colunas: EMPRESA, CLIENTE, NOTA FISCAL, PEDIDO, etc.</p>
          <Input type="file" accept=".xlsx,.xls" onChange={handleImportFile} disabled={importMut.isPending} />
          {importMut.isPending && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Importando...</div>}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir remessa?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteId) deleteMut.mutate(deleteId); setDeleteId(null); }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}

// ===================== FORM DIALOG =====================
function ShipmentFormDialog({ open, onOpenChange, shipment, members, onSave, isSaving }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: LogisticsShipment | null;
  members: Array<{ id: string; name: string }>;
  onSave: (data: Partial<LogisticsShipment>) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<any>({});

  const resetForm = () => {
    if (shipment) {
      setForm({
        company_name: shipment.company_name || "",
        client_name: shipment.client_name || "",
        invoice_number: shipment.invoice_number || "",
        order_number: shipment.order_number || "",
        requested_date: shipment.requested_date?.split("T")[0] || "",
        departure_date: shipment.departure_date?.split("T")[0] || "",
        estimated_delivery: shipment.estimated_delivery?.split("T")[0] || "",
        actual_delivery: shipment.actual_delivery?.split("T")[0] || "",
        carrier: shipment.carrier || "",
        carrier_quote_code: shipment.carrier_quote_code || "",
        volumes: shipment.volumes || 0,
        freight_paid: shipment.freight_paid || 0,
        freight_invoiced: shipment.freight_invoiced || 0,
        tax_value: shipment.tax_value || 0,
        status: shipment.status || "Pendente",
        channel: shipment.channel || "",
        requester_id: shipment.requester_id || "",
        notes: shipment.notes || "",
      });
    } else {
      setForm({
        company_name: "", client_name: "", invoice_number: "", order_number: "",
        requested_date: "", departure_date: "", estimated_delivery: "", actual_delivery: "",
        carrier: "", carrier_quote_code: "", volumes: 0,
        freight_paid: 0, freight_invoiced: 0, tax_value: 0,
        status: "Pendente", channel: "", requester_id: "", notes: "",
      });
    }
  };

  // Reset when dialog opens
  useState(() => { resetForm(); });
  // Also reset when shipment changes
  const [prevShipment, setPrevShipment] = useState(shipment);
  if (shipment !== prevShipment) { setPrevShipment(shipment); resetForm(); }

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{shipment ? "Editar Remessa" : "Nova Remessa"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Empresa</Label>
            <Input value={form.company_name || ""} onChange={(e) => upd("company_name", e.target.value)} />
          </div>
          <div>
            <Label>Cliente *</Label>
            <Input value={form.client_name || ""} onChange={(e) => upd("client_name", e.target.value)} />
          </div>
          <div>
            <Label>Nota Fiscal</Label>
            <Input value={form.invoice_number || ""} onChange={(e) => upd("invoice_number", e.target.value)} />
          </div>
          <div>
            <Label>Pedido</Label>
            <Input value={form.order_number || ""} onChange={(e) => upd("order_number", e.target.value)} />
          </div>
          <div>
            <Label>Transportadora</Label>
            <Input value={form.carrier || ""} onChange={(e) => upd("carrier", e.target.value)} />
          </div>
          <div>
            <Label>Código Cotação</Label>
            <Input value={form.carrier_quote_code || ""} onChange={(e) => upd("carrier_quote_code", e.target.value)} placeholder="Código da transportadora" />
          </div>
          <div>
            <Label>Volumes</Label>
            <Input type="number" value={form.volumes || 0} onChange={(e) => upd("volumes", Number(e.target.value))} />
          </div>
          <div>
            <Label>Canal</Label>
            <Input value={form.channel || ""} onChange={(e) => upd("channel", e.target.value)} />
          </div>
          <div>
            <Label>Data Solicitada</Label>
            <Input type="date" value={form.requested_date || ""} onChange={(e) => upd("requested_date", e.target.value)} />
          </div>
          <div>
            <Label>Data Saída</Label>
            <Input type="date" value={form.departure_date || ""} onChange={(e) => upd("departure_date", e.target.value)} />
          </div>
          <div>
            <Label>Previsão Entrega</Label>
            <Input type="date" value={form.estimated_delivery || ""} onChange={(e) => upd("estimated_delivery", e.target.value)} />
          </div>
          <div>
            <Label>Data Entrega</Label>
            <Input type="date" value={form.actual_delivery || ""} onChange={(e) => upd("actual_delivery", e.target.value)} />
          </div>
          <div>
            <Label>Frete Pago (R$)</Label>
            <Input type="number" step="0.01" value={form.freight_paid || 0} onChange={(e) => upd("freight_paid", Number(e.target.value))} />
          </div>
          <div>
            <Label>Valor Cobrado NF (R$)</Label>
            <Input type="number" step="0.01" value={form.freight_invoiced || 0} onChange={(e) => upd("freight_invoiced", Number(e.target.value))} />
          </div>
          <div>
            <Label>Imposto (R$)</Label>
            <Input type="number" step="0.01" value={form.tax_value || 0} onChange={(e) => upd("tax_value", Number(e.target.value))} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status || "Pendente"} onValueChange={(v) => upd("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Solicitante</Label>
            <Select value={form.requester_id || "none"} onValueChange={(v) => upd("requester_id", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.notes || ""} onChange={(e) => upd("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => onSave(form)} disabled={isSaving || !form.client_name}>
            {isSaving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {shipment ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================== DASHBOARD TAB =====================
function DashboardTab({ dashboard }: { dashboard?: any }) {
  if (!dashboard) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const s = dashboard.summary;
  const balance = Number(s.balance);

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total Remessas</p>
          <p className="text-2xl font-bold">{s.total_shipments}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Frete Pago</p>
          <p className="text-lg font-bold text-destructive">{formatCurrency(Number(s.total_freight_paid))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Cobrado NF</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(Number(s.total_freight_invoiced))}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Custo Real (c/ imposto)</p>
          <p className="text-lg font-bold">{formatCurrency(Number(s.total_real_cost))}</p>
        </Card>
        <Card className={cn("p-3", balance >= 0 ? "border-green-500" : "border-red-500")}>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Saldo {balance >= 0 ? <TrendingUp className="h-3 w-3 text-green-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
          </p>
          <p className={cn("text-lg font-bold", balance >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(balance)}</p>
        </Card>
      </div>

      {/* Status + Carrier charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Por Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={dashboard.byStatus} dataKey="total" nameKey="status" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.status}: ${e.total}`}>
                {dashboard.byStatus.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Frete por Transportadora</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dashboard.byCarrier.slice(0, 8)}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="carrier" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="freight_paid" fill="hsl(var(--primary))" name="Frete Pago" />
              <Bar dataKey="freight_invoiced" fill="hsl(var(--chart-2))" name="Cobrado NF" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Monthly Trend */}
      {dashboard.monthlyTrend?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Evolução Mensal</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dashboard.monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="freight_paid" stroke="hsl(var(--destructive))" name="Frete Pago" />
              <Line type="monotone" dataKey="freight_invoiced" stroke="hsl(var(--chart-2))" name="Cobrado NF" />
              <Line type="monotone" dataKey="real_cost" stroke="hsl(var(--primary))" name="Custo Real" />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ===================== WALLET TAB =====================
function WalletTab({ dashboard }: { dashboard?: any }) {
  if (!dashboard) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Carteira por Solicitante</h3>
      <p className="text-xs text-muted-foreground">Saldo = Cobrado NF − Frete Pago. Positivo = crédito. Negativo = débito (vermelho).</p>

      <div className="grid gap-3">
        {dashboard.byRequester?.length === 0 && (
          <p className="text-center text-muted-foreground py-10">Nenhum solicitante vinculado</p>
        )}
        {dashboard.byRequester?.map((r: any) => {
          const bal = Number(r.balance);
          return (
            <Card key={r.requester_id} className={cn("p-4 flex items-center justify-between", bal < 0 && "border-red-500/50")}>
              <div>
                <p className="font-semibold">{r.requester_name || "Sem nome"}</p>
                <p className="text-xs text-muted-foreground">{r.total_shipments} remessas</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Frete Pago: {formatCurrency(Number(r.total_freight_paid))}</p>
                <p className="text-xs text-muted-foreground">Cobrado: {formatCurrency(Number(r.total_invoiced))}</p>
                <p className={cn("font-bold text-lg", bal >= 0 ? "text-green-600" : "text-red-600")}>
                  {bal >= 0 ? "+" : ""}{formatCurrency(bal)}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* By Channel */}
      {dashboard.byChannel?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Por Canal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dashboard.byChannel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="channel" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="freight_paid" fill="hsl(var(--destructive))" name="Frete Pago" />
              <Bar dataKey="freight_invoiced" fill="hsl(var(--chart-2))" name="Cobrado NF" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
