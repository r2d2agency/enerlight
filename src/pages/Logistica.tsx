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
  useLogisticsShipments, useLogisticsDashboard, useLogisticsMembers, useLogisticsCompanies,
  useLogisticsCarriers, useLogisticsChannels, useLogisticsChannelWallet, useLogisticsSellerWallet,
  useCreateShipment, useUpdateShipment, useDeleteShipment, useImportShipments,
  useLogisticsImportBatches, useDeleteImportBatch,
  LogisticsShipment, ChannelWalletItem, SellerWalletItem,
} from "@/hooks/use-logistics";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

const STATUSES = ["Pendente", "Em trânsito", "Entregue no prazo", "Entregue com atraso", "Cancelado"];
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];
const CHART_COLORS = { paid: "#ef4444", invoiced: "#22c55e", realCost: "#6366f1", primary: "#3b82f6" };
const TICK_STYLE = { fontSize: 10, fill: "#64748b" };

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);

type DatePreset = "month" | "week" | "all" | "custom";

export default function Logistica() {
  const [activeTab, setActiveTab] = useState("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
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

  const filteredParams = { search, status: statusFilter, company_name: companyFilter, ...dateRange };
  const { data: allShipments, isLoading } = useLogisticsShipments(filteredParams);
  const shipments = useMemo(() => {
    if (!allShipments) return [];
    if (channelFilter === "all") return allShipments;
    return allShipments.filter(s => s.channel === channelFilter);
  }, [allShipments, channelFilter]);
  const { data: dashboard } = useLogisticsDashboard({ ...dateRange, company_name: companyFilter });
  const { data: members } = useLogisticsMembers();
  const { data: companies } = useLogisticsCompanies();
  const { data: carriers } = useLogisticsCarriers();
  const { data: channels } = useLogisticsChannels();
  const { data: channelWallet } = useLogisticsChannelWallet(dateRange);
  const { data: sellerWallet } = useLogisticsSellerWallet(dateRange);
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
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Empresas</SelectItem>
                {companies?.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Canais</SelectItem>
                {channels?.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
                        <th className="text-left p-2 font-medium">Empresa</th>
                        <th className="text-left p-2 font-medium">NF</th>
                        <th className="text-left p-2 font-medium">Pedido</th>
                        <th className="text-left p-2 font-medium">Cliente</th>
                        <th className="text-left p-2 font-medium">Transportadora</th>
                        <th className="text-left p-2 font-medium">Cód. Cotação</th>
                        <th className="text-left p-2 font-medium">Canal</th>
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
                          <td className="p-2 text-xs font-medium">{s.company_name}</td>
                          <td className="p-2 font-mono text-xs">{s.invoice_number}</td>
                          <td className="p-2 font-mono text-xs">{s.order_number}</td>
                          <td className="p-2 max-w-[200px] truncate">{s.client_name}</td>
                          <td className="p-2">{s.carrier}</td>
                          <td className="p-2 font-mono text-xs">{s.carrier_quote_code || "—"}</td>
                          <td className="p-2 text-xs">{s.channel || "—"}</td>
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
            <WalletTab dashboard={dashboard} channelWallet={channelWallet} sellerWallet={sellerWallet} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Form Dialog */}
      <ShipmentFormDialog
        open={showForm}
        onOpenChange={(v) => { setShowForm(v); if (!v) setEditingShipment(null); }}
        shipment={editingShipment}
        members={members || []}
        companies={companies || []}
        carriers={carriers || []}
        channels={channels || []}
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Importar Planilha XLSX</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Selecione um arquivo .xlsx. Pedidos com mesmo número serão atualizados automaticamente.</p>
          <Input type="file" accept=".xlsx,.xls" onChange={handleImportFile} disabled={importMut.isPending} />
          {importMut.isPending && <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Importando...</div>}
          <ImportBatchHistory />
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
function ShipmentFormDialog({ open, onOpenChange, shipment, members, companies, carriers, channels, onSave, isSaving }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: LogisticsShipment | null;
  members: Array<{ id: string; name: string }>;
  companies: string[];
  carriers: string[];
  channels: string[];
  onSave: (data: Partial<LogisticsShipment>) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<any>({});
  const [customCompany, setCustomCompany] = useState(false);
  const [customCarrier, setCustomCarrier] = useState(false);
  const [customChannel, setCustomChannel] = useState(false);

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
      setCustomCompany(!companies.includes(shipment.company_name || ""));
      setCustomCarrier(!carriers.includes(shipment.carrier || ""));
      setCustomChannel(!channels.includes(shipment.channel || ""));
    } else {
      setForm({
        company_name: "", client_name: "", invoice_number: "", order_number: "",
        requested_date: "", departure_date: "", estimated_delivery: "", actual_delivery: "",
        carrier: "", carrier_quote_code: "", volumes: 0,
        freight_paid: 0, freight_invoiced: 0, tax_value: 0,
        status: "Pendente", channel: "", requester_id: "", notes: "",
      });
      setCustomCompany(false);
      setCustomCarrier(false);
      setCustomChannel(false);
    }
  };

  useState(() => { resetForm(); });
  const [prevShipment, setPrevShipment] = useState(shipment);
  if (shipment !== prevShipment) { setPrevShipment(shipment); resetForm(); }

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const renderSelectOrInput = (
    label: string, field: string, options: string[], isCustom: boolean, setIsCustom: (v: boolean) => void
  ) => (
    <div>
      <Label>{label}</Label>
      {!isCustom && options.length > 0 ? (
        <Select
          value={form[field] || "__select__"}
          onValueChange={(v) => {
            if (v === "__custom__") {
              setIsCustom(true);
              upd(field, "");
            } else if (v === "__select__") {
              upd(field, "");
            } else {
              upd(field, v);
            }
          }}
        >
          <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__select__">Selecionar...</SelectItem>
            {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
            <SelectItem value="__custom__">✏️ Digitar novo...</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-1">
          <Input
            value={form[field] || ""}
            onChange={(e) => upd(field, e.target.value)}
            placeholder={`Digitar ${label.toLowerCase()}`}
            className="flex-1"
          />
          {options.length > 0 && (
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => { setIsCustom(false); upd(field, ""); }} title="Selecionar existente">
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{shipment ? "Editar Remessa" : "Nova Remessa"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {renderSelectOrInput("Empresa", "company_name", companies, customCompany, setCustomCompany)}
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
          {renderSelectOrInput("Transportadora", "carrier", carriers, customCarrier, setCustomCarrier)}
          <div>
            <Label>Código Cotação</Label>
            <Input value={form.carrier_quote_code || ""} onChange={(e) => upd("carrier_quote_code", e.target.value)} placeholder="Código da transportadora" />
          </div>
          <div>
            <Label>Volumes</Label>
            <Input type="number" value={form.volumes || 0} onChange={(e) => upd("volumes", Number(e.target.value))} />
          </div>
          {renderSelectOrInput("Canal", "channel", channels, customChannel, setCustomChannel)}
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

      {/* Channel Cards Widget */}
      {dashboard.byChannel?.length > 0 && (
        <>
          <h3 className="font-semibold text-sm mt-2">Resumo por Canal</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {dashboard.byChannel.map((ch: any) => {
              const paid = Number(ch.freight_paid);
              const invoiced = Number(ch.freight_invoiced);
              const saldo = invoiced - paid;
              const markup = paid > 0 ? ((invoiced / paid) * 100).toFixed(0) : "—";
              return (
                <Card key={ch.channel} className={cn("p-4 space-y-1", saldo < 0 ? "border-destructive/50" : "border-green-500/50")}>
                  <p className="font-semibold text-sm">{ch.channel || "Sem canal"}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">Cobrado NF</span>
                    <span className="text-right font-mono font-medium text-green-600">{formatCurrency(invoiced)}</span>
                    <span className="text-muted-foreground">Valor Pago</span>
                    <span className="text-right font-mono font-medium text-destructive">{formatCurrency(paid)}</span>
                    <span className="text-muted-foreground">Saldo</span>
                    <span className={cn("text-right font-mono font-bold", saldo >= 0 ? "text-green-600" : "text-destructive")}>{formatCurrency(saldo)}</span>
                    <span className="text-muted-foreground">Markup</span>
                    <span className="text-right font-mono font-semibold">{markup}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{ch.total} remessas</p>
                </Card>
              );
            })}
          </div>
        </>
      )}

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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="carrier" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="freight_paid" fill={CHART_COLORS.paid} name="Frete Pago" />
              <Bar dataKey="freight_invoiced" fill={CHART_COLORS.invoiced} name="Cobrado NF" />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="month" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="freight_paid" stroke={CHART_COLORS.paid} name="Frete Pago" strokeWidth={2} />
              <Line type="monotone" dataKey="freight_invoiced" stroke={CHART_COLORS.invoiced} name="Cobrado NF" strokeWidth={2} />
              <Line type="monotone" dataKey="real_cost" stroke={CHART_COLORS.realCost} name="Custo Real" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* By Company */}
      {dashboard.byCompany?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Por Empresa</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dashboard.byCompany}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="company_name" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Bar dataKey="freight_paid" fill={CHART_COLORS.paid} name="Frete Pago" />
              <Bar dataKey="freight_invoiced" fill={CHART_COLORS.invoiced} name="Cobrado NF" />
              <Bar dataKey="real_cost" fill={CHART_COLORS.realCost} name="Custo Real" />
            </BarChart>
          </ResponsiveContainer>
          {/* Company summary table */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-1.5 font-medium">Empresa</th>
                  <th className="text-right p-1.5 font-medium">Remessas</th>
                  <th className="text-right p-1.5 font-medium">Frete Pago</th>
                  <th className="text-right p-1.5 font-medium">Cobrado NF</th>
                  <th className="text-right p-1.5 font-medium">Custo Real</th>
                  <th className="text-right p-1.5 font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byCompany.map((c: any) => {
                  const bal = Number(c.balance);
                  return (
                    <tr key={c.company_name} className="border-b">
                      <td className="p-1.5 font-medium">{c.company_name}</td>
                      <td className="p-1.5 text-right">{c.total}</td>
                      <td className="p-1.5 text-right font-mono">{formatCurrency(Number(c.freight_paid))}</td>
                      <td className="p-1.5 text-right font-mono">{formatCurrency(Number(c.freight_invoiced))}</td>
                      <td className="p-1.5 text-right font-mono">{formatCurrency(Number(c.real_cost))}</td>
                      <td className={cn("p-1.5 text-right font-mono font-semibold", bal >= 0 ? "text-green-600" : "text-destructive")}>{formatCurrency(bal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Carrier Status Tracking */}
      {dashboard.byCarrierStatus?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm flex items-center gap-2">
            <Truck className="h-4 w-4" /> Status por Transportadora
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">Transportadora</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="text-right p-2 font-medium">Qtd</th>
                  <th className="text-left p-2 font-medium">Próx. Entrega</th>
                  <th className="text-right p-2 font-medium">Futuras</th>
                  <th className="text-right p-2 font-medium">Atrasadas</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byCarrierStatus.map((r: any, i: number) => {
                  const deliveryDate = r.nearest_delivery ? new Date(r.nearest_delivery) : null;
                  const now = new Date();
                  const daysUntil = deliveryDate ? Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

                  let rowColor = "";
                  if (r.status === "Entregue no prazo") rowColor = "bg-green-50 dark:bg-green-950/20";
                  else if (r.status === "Entregue com atraso") rowColor = "bg-amber-50 dark:bg-amber-950/20";
                  else if (Number(r.overdue) > 0) rowColor = "bg-red-50 dark:bg-red-950/20";
                  else if (daysUntil !== null && daysUntil <= 2) rowColor = "bg-orange-50 dark:bg-orange-950/20";
                  else if (daysUntil !== null && daysUntil <= 7) rowColor = "bg-yellow-50 dark:bg-yellow-950/20";
                  else if (daysUntil !== null && daysUntil > 7) rowColor = "bg-blue-50 dark:bg-blue-950/20";

                  let dateColor = "text-muted-foreground";
                  if (daysUntil !== null) {
                    if (daysUntil < 0) dateColor = "text-red-600 font-bold";
                    else if (daysUntil <= 2) dateColor = "text-orange-600 font-bold";
                    else if (daysUntil <= 7) dateColor = "text-amber-600 font-semibold";
                    else dateColor = "text-blue-600";
                  }

                  return (
                    <tr key={`${r.carrier}-${r.status}-${i}`} className={cn("border-b", rowColor)}>
                      <td className="p-2 font-medium">{r.carrier}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={cn("text-[10px]",
                          r.status === "Entregue no prazo" && "border-green-500 text-green-700",
                          r.status === "Entregue com atraso" && "border-amber-500 text-amber-700",
                          r.status === "Em trânsito" && "border-blue-500 text-blue-700",
                          r.status === "Pendente" && "border-orange-500 text-orange-700",
                          r.status === "Cancelado" && "border-red-500 text-red-700",
                        )}>{r.status}</Badge>
                      </td>
                      <td className="p-2 text-right font-mono">{r.total}</td>
                      <td className={cn("p-2", dateColor)}>
                        {deliveryDate ? (
                          <>
                            {format(deliveryDate, "dd/MM/yyyy")}
                            {daysUntil !== null && (
                              <span className="ml-1 text-[10px]">
                                ({daysUntil < 0 ? `${Math.abs(daysUntil)}d atraso` : daysUntil === 0 ? "Hoje" : `${daysUntil}d`})
                              </span>
                            )}
                          </>
                        ) : "—"}
                      </td>
                      <td className="p-2 text-right font-mono">{r.future_deliveries || 0}</td>
                      <td className={cn("p-2 text-right font-mono", Number(r.overdue) > 0 && "text-red-600 font-bold")}>{r.overdue || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 dark:bg-red-950/40 border border-red-300" /> Atrasado</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100 dark:bg-orange-950/40 border border-orange-300" /> 1-2 dias</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-300" /> 3-7 dias</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 dark:bg-blue-950/40 border border-blue-300" /> +7 dias</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 dark:bg-green-950/40 border border-green-300" /> Entregue</span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ===================== WALLET TAB =====================
function WalletTab({ dashboard, channelWallet, sellerWallet }: { dashboard?: any; channelWallet?: ChannelWalletItem[]; sellerWallet?: SellerWalletItem[] }) {
  if (!dashboard) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  // Group seller wallet by channel
  const sellerByChannel = useMemo(() => {
    if (!sellerWallet) return {};
    const groups: Record<string, { sellers: SellerWalletItem[]; totals: { freight_paid: number; freight_invoiced: number; balance: number; total_order_value: number; total_shipments: number } }> = {};
    for (const s of sellerWallet) {
      if (!groups[s.channel]) {
        groups[s.channel] = { sellers: [], totals: { freight_paid: 0, freight_invoiced: 0, balance: 0, total_order_value: 0, total_shipments: 0 } };
      }
      groups[s.channel].sellers.push(s);
      groups[s.channel].totals.freight_paid += Number(s.freight_paid);
      groups[s.channel].totals.freight_invoiced += Number(s.freight_invoiced);
      groups[s.channel].totals.balance += Number(s.balance);
      groups[s.channel].totals.total_order_value += Number(s.total_order_value);
      groups[s.channel].totals.total_shipments += Number(s.total_shipments);
    }
    return groups;
  }, [sellerWallet]);

  return (
    <div className="space-y-6">
      {/* Channel Wallet from Metas cross-reference */}
      <div>
        <h3 className="font-semibold text-sm mb-1">Carteira por Canal (Metas)</h3>
        <p className="text-xs text-muted-foreground mb-3">Cruzamento do nº do pedido da logística com os pedidos importados nas metas para identificar o canal.</p>

        {(!channelWallet || channelWallet.length === 0) ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            Nenhum dado encontrado. Certifique-se de que os pedidos importados nas Metas possuem o mesmo número de pedido das remessas.
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {channelWallet.map((ch) => {
              const paid = Number(ch.freight_paid);
              const invoiced = Number(ch.freight_invoiced);
              const saldo = Number(ch.balance);
              const tax = Number(ch.tax_value);
              const realCost = Number(ch.real_cost);
              const markup = paid > 0 ? ((invoiced / paid) * 100).toFixed(0) : "—";
              return (
                <Card key={ch.metas_channel} className={cn("p-4 space-y-2", saldo < 0 ? "border-destructive/60 bg-destructive/5" : "border-green-500/50 bg-green-500/5")}>
                  <p className="font-bold text-base">{ch.metas_channel}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Cobrado NF</span>
                    <span className="text-right font-mono font-semibold text-green-600">{formatCurrency(invoiced)}</span>
                    <span className="text-muted-foreground">Valor Pago</span>
                    <span className="text-right font-mono font-semibold text-destructive">{formatCurrency(paid)}</span>
                    <span className="text-muted-foreground">Impostos</span>
                    <span className="text-right font-mono">{formatCurrency(tax)}</span>
                    <span className="text-muted-foreground">Custo Real</span>
                    <span className="text-right font-mono">{formatCurrency(realCost)}</span>
                    <span className="text-muted-foreground font-semibold">Saldo</span>
                    <span className={cn("text-right font-mono font-bold text-sm", saldo >= 0 ? "text-green-600" : "text-destructive")}>
                      {saldo >= 0 ? "+" : ""}{formatCurrency(saldo)}
                    </span>
                    <span className="text-muted-foreground">Markup</span>
                    <span className="text-right font-mono font-semibold">{markup}%</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{ch.total_shipments} remessas vinculadas</p>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Seller Wallet by Channel + Seller */}
      <div>
        <h3 className="font-semibold text-sm mb-1">Carteira por Grupo/Vendedor</h3>
        <p className="text-xs text-muted-foreground mb-3">Cruzamento do nº do pedido com metas para identificar canal e vendedor. Mostra quanto cada vendedor gastou em logística por canal.</p>

        {Object.keys(sellerByChannel).length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground text-sm">
            Nenhum dado encontrado. Verifique se os pedidos das metas possuem o mesmo número de pedido das remessas.
          </Card>
        ) : (
          <div className="space-y-4">
            {Object.entries(sellerByChannel).map(([channel, data]) => {
              const t = data.totals;
              const markup = t.freight_paid > 0 ? ((t.freight_invoiced / t.freight_paid) * 100).toFixed(0) : "—";
              const pctFrete = t.total_order_value > 0 ? ((t.freight_paid / t.total_order_value) * 100).toFixed(1) : "—";
              return (
                <Card key={channel} className="overflow-hidden">
                  <div className={cn("px-4 py-3 flex items-center justify-between", t.balance >= 0 ? "bg-green-500/10" : "bg-destructive/10")}>
                    <div>
                      <p className="font-bold text-sm">{channel}</p>
                      <p className="text-xs text-muted-foreground">{t.total_shipments} remessas · Pedidos: {formatCurrency(t.total_order_value)}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("font-bold text-lg", t.balance >= 0 ? "text-green-600" : "text-destructive")}>
                        {t.balance >= 0 ? "+" : ""}{formatCurrency(t.balance)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">Markup: {markup}% · Frete/Pedido: {pctFrete}%</p>
                    </div>
                  </div>
                  <div className="divide-y divide-border">
                    {/* Header */}
                    <div className="grid grid-cols-6 gap-2 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase bg-muted/40">
                      <span className="col-span-2">Vendedor</span>
                      <span className="text-right">Cobrado NF</span>
                      <span className="text-right">Frete Pago</span>
                      <span className="text-right">Saldo</span>
                      <span className="text-right">%</span>
                    </div>
                    {data.sellers.map((s, i) => {
                      const sPaid = Number(s.freight_paid);
                      const sInvoiced = Number(s.freight_invoiced);
                      const sBal = Number(s.balance);
                      const sOrderVal = Number(s.total_order_value);
                      const sPct = sOrderVal > 0 ? ((sPaid / sOrderVal) * 100).toFixed(1) : "—";
                      return (
                        <div key={i} className="grid grid-cols-6 gap-2 px-4 py-2 text-xs items-center hover:bg-muted/30">
                          <span className="col-span-2 font-medium truncate">{s.seller_name}</span>
                          <span className="text-right font-mono text-green-600">{formatCurrency(sInvoiced)}</span>
                          <span className="text-right font-mono text-destructive">{formatCurrency(sPaid)}</span>
                          <span className={cn("text-right font-mono font-semibold", sBal >= 0 ? "text-green-600" : "text-destructive")}>
                            {sBal >= 0 ? "+" : ""}{formatCurrency(sBal)}
                          </span>
                          <span className="text-right font-mono text-muted-foreground">{sPct}%</span>
                        </div>
                      );
                    })}
                    {/* Channel total row */}
                    <div className="grid grid-cols-6 gap-2 px-4 py-2 text-xs font-bold bg-muted/20">
                      <span className="col-span-2">Total</span>
                      <span className="text-right font-mono text-green-600">{formatCurrency(t.freight_invoiced)}</span>
                      <span className="text-right font-mono text-destructive">{formatCurrency(t.freight_paid)}</span>
                      <span className={cn("text-right font-mono", t.balance >= 0 ? "text-green-600" : "text-destructive")}>
                        {t.balance >= 0 ? "+" : ""}{formatCurrency(t.balance)}
                      </span>
                      <span className="text-right font-mono text-muted-foreground">{pctFrete}%</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Existing: Wallet by requester */}
      <div>
        <h3 className="font-semibold text-sm">Carteira por Solicitante</h3>
        <p className="text-xs text-muted-foreground mb-3">Saldo = Cobrado NF − Frete Pago. Positivo = crédito. Negativo = débito (vermelho).</p>

        <div className="grid gap-3">
          {dashboard.byRequester?.length === 0 && (
            <p className="text-center text-muted-foreground py-10">Nenhum solicitante vinculado</p>
          )}
          {dashboard.byRequester?.map((r: any) => {
            const bal = Number(r.balance);
            return (
              <Card key={r.requester_id} className={cn("p-4 flex items-center justify-between", bal < 0 && "border-destructive/50")}>
                <div>
                  <p className="font-semibold">{r.requester_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{r.total_shipments} remessas</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Frete Pago: {formatCurrency(Number(r.total_freight_paid))}</p>
                  <p className="text-xs text-muted-foreground">Cobrado: {formatCurrency(Number(r.total_invoiced))}</p>
                  <p className={cn("font-bold text-lg", bal >= 0 ? "text-green-600" : "text-destructive")}>
                    {bal >= 0 ? "+" : ""}{formatCurrency(bal)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* By Channel chart */}
      {dashboard.byChannel?.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 text-sm">Por Canal (Logística)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dashboard.byChannel}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="channel" tick={TICK_STYLE} />
              <YAxis tick={TICK_STYLE} />
              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="freight_paid" fill={CHART_COLORS.paid} name="Frete Pago" />
              <Bar dataKey="freight_invoiced" fill={CHART_COLORS.invoiced} name="Cobrado NF" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ===================== IMPORT BATCH HISTORY =====================
function ImportBatchHistory() {
  const { data: batches, isLoading } = useLogisticsImportBatches();
  const deleteBatch = useDeleteImportBatch();
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (batchId: string) => {
    if (!confirm("Excluir esta importação e todas as remessas vinculadas?")) return;
    setDeleting(batchId);
    deleteBatch.mutate(batchId, { onSettled: () => setDeleting(null) });
  };

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!batches?.length) return <p className="text-xs text-muted-foreground text-center py-2">Nenhuma importação realizada.</p>;

  return (
    <div className="space-y-2 mt-2">
      <p className="text-sm font-medium">Histórico de Importações</p>
      <ScrollArea className="max-h-[200px]">
        {batches.map(b => (
          <div key={b.id} className="flex items-center justify-between p-2 border rounded mb-1">
            <div className="text-xs space-y-0.5">
              <p className="font-medium">{b.row_count} registros • {b.current_count} ativos</p>
              <p className="text-muted-foreground">
                Pago: {formatCurrency(Number(b.total_freight_paid))} | Cobrado: {formatCurrency(Number(b.total_freight_invoiced))}
              </p>
              <p className="text-muted-foreground">
                {b.created_by_name} • {format(new Date(b.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="text-destructive h-7 w-7" onClick={() => handleDelete(b.id)} disabled={deleting === b.id}>
              {deleting === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
