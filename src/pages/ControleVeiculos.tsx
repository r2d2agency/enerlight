import { useState, useMemo } from "react";
import {
  useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle,
  useVehicleTrips, useCreateVehicleTrip, useCloseVehicleTrip, useDeleteVehicleTrip,
  type Vehicle, type VehicleTrip,
} from "@/hooks/use-vehicles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, Car, Trash2, Edit, CheckCircle2, Truck } from "lucide-react";
import { toast } from "sonner";

const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "tires", label: "Pneus OK" },
  { key: "oil", label: "Óleo OK" },
  { key: "lights", label: "Luzes / setas OK" },
  { key: "cleanliness", label: "Limpeza OK" },
  { key: "damages", label: "Sem avarias novas" },
];

const FUEL_LEVELS = ["Reserva", "1/4", "1/2", "3/4", "Cheio"];

function formatDateTime(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function purposeLabel(p: string) {
  if (p === "delivery") return "Entrega";
  if (p === "visit") return "Visita";
  return "Outro";
}

// ─────────────────────────────────────────────
// Vehicle form dialog
// ─────────────────────────────────────────────
function VehicleFormDialog({ open, onOpenChange, vehicle }: { open: boolean; onOpenChange: (v: boolean) => void; vehicle?: Vehicle | null }) {
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const [form, setForm] = useState({
    name: vehicle?.name || "",
    plate: vehicle?.plate || "",
    brand: vehicle?.brand || "",
    model: vehicle?.model || "",
    year: vehicle?.year || "",
    current_km: vehicle?.current_km || 0,
    is_active: vehicle?.is_active ?? true,
    notes: vehicle?.notes || "",
  });

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Informe um nome"); return; }
    const payload = { ...form, year: form.year ? Number(form.year) : null };
    try {
      if (vehicle) {
        await update.mutateAsync({ id: vehicle.id, ...payload });
        toast.success("Veículo atualizado");
      } else {
        await create.mutateAsync(payload);
        toast.success("Veículo cadastrado");
      }
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="vehicle-form-desc">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Editar veículo" : "Novo veículo"}</DialogTitle>
          <DialogDescription id="vehicle-form-desc">Cadastro do veículo da frota.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Nome/Identificação *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Fiorino ABC-1234" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Placa</Label><Input value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} /></div>
            <div><Label>Ano</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></div>
            <div><Label>Marca</Label><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
            <div><Label>Modelo</Label><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></div>
          </div>
          <div>
            <Label>KM atual</Label>
            <Input type="number" step="0.01" value={form.current_km} onChange={(e) => setForm({ ...form, current_km: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: !!v })} />
            Veículo ativo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Trip create dialog (saída)
// ─────────────────────────────────────────────
function TripFormDialog({ open, onOpenChange, vehicles }: { open: boolean; onOpenChange: (v: boolean) => void; vehicles: Vehicle[] }) {
  const create = useCreateVehicleTrip();
  const activeVehicles = vehicles.filter((v) => v.is_active);
  const [form, setForm] = useState({
    vehicle_id: "",
    departure_at: "",
    km_start: 0,
    purpose: "visit" as "visit" | "delivery" | "other",
    destination_text: "",
    delivery_client_name: "",
    delivery_order_number: "",
    delivery_invoice_number: "",
    fuel_level: "Cheio",
    notes_out: "",
    checklist: {} as Record<string, boolean>,
  });

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id);

  const handleVehicleChange = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    setForm({ ...form, vehicle_id: id, km_start: v?.current_km || 0 });
  };

  const submit = async () => {
    if (!form.vehicle_id) { toast.error("Selecione um veículo"); return; }
    const checklist_out = { ...form.checklist, fuel_level: form.fuel_level };
    try {
      await create.mutateAsync({
        vehicle_id: form.vehicle_id,
        departure_at: form.departure_at || null,
        km_start: form.km_start,
        purpose: form.purpose,
        destination_text: form.destination_text,
        checklist_out,
        notes_out: form.notes_out,
        delivery_client_name: form.delivery_client_name,
        delivery_order_number: form.delivery_order_number,
        delivery_invoice_number: form.delivery_invoice_number,
      });
      toast.success("Saída registrada");
      onOpenChange(false);
      setForm({ ...form, vehicle_id: "", km_start: 0, destination_text: "", notes_out: "", checklist: {}, delivery_client_name: "", delivery_order_number: "", delivery_invoice_number: "" });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby="trip-form-desc">
        <DialogHeader>
          <DialogTitle>Registrar saída de veículo</DialogTitle>
          <DialogDescription id="trip-form-desc">Preencha os dados de saída, checklist e destino.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Veículo *</Label>
              <Select value={form.vehicle_id} onValueChange={handleVehicleChange}>
                <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {activeVehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}{v.plate ? ` — ${v.plate}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVehicle && <p className="text-xs text-muted-foreground mt-1">Último KM: {selectedVehicle.current_km}</p>}
            </div>
            <div>
              <Label>Data/hora de saída</Label>
              <Input type="datetime-local" value={form.departure_at} onChange={(e) => setForm({ ...form, departure_at: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Deixe vazio para usar agora</p>
            </div>
            <div>
              <Label>KM inicial *</Label>
              <Input type="number" step="0.01" value={form.km_start} onChange={(e) => setForm({ ...form, km_start: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Motivo</Label>
              <Select value={form.purpose} onValueChange={(v: any) => setForm({ ...form, purpose: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visit">Visita comercial</SelectItem>
                  <SelectItem value="delivery">Entrega ao cliente</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Destino / cliente</Label>
            <Input value={form.destination_text} onChange={(e) => setForm({ ...form, destination_text: e.target.value })} placeholder="Nome do cliente ou endereço" />
          </div>

          {form.purpose === "delivery" && (
            <Card className="bg-muted/40">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Dados da entrega</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <div className="col-span-2">
                  <Label>Cliente (para logística)</Label>
                  <Input value={form.delivery_client_name} onChange={(e) => setForm({ ...form, delivery_client_name: e.target.value })} placeholder="Se vazio, usa o destino" />
                </div>
                <div><Label>Nº do pedido</Label><Input value={form.delivery_order_number} onChange={(e) => setForm({ ...form, delivery_order_number: e.target.value })} /></div>
                <div><Label>Nº da nota</Label><Input value={form.delivery_invoice_number} onChange={(e) => setForm({ ...form, delivery_invoice_number: e.target.value })} /></div>
                <p className="col-span-2 text-xs text-muted-foreground">Uma remessa será criada automaticamente na Logística com o transportador da frota própria. O custo por km é calculado ao finalizar a viagem.</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Checklist de saída</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.key} className="flex items-center gap-2">
                  <Checkbox
                    checked={!!form.checklist[item.key]}
                    onCheckedChange={(v) => setForm({ ...form, checklist: { ...form.checklist, [item.key]: !!v } })}
                  />
                  {item.label}
                </label>
              ))}
              <div className="col-span-2">
                <Label className="text-xs">Nível de combustível</Label>
                <Select value={form.fuel_level} onValueChange={(v) => setForm({ ...form, fuel_level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FUEL_LEVELS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div>
            <Label>Observações da saída</Label>
            <Textarea value={form.notes_out} onChange={(e) => setForm({ ...form, notes_out: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={create.isPending}>Registrar saída</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Trip close dialog (retorno)
// ─────────────────────────────────────────────
function TripCloseDialog({ trip, onClose }: { trip: VehicleTrip | null; onClose: () => void }) {
  const close = useCloseVehicleTrip();
  const [form, setForm] = useState({
    return_at: "",
    km_end: trip?.km_start || 0,
    checklist: {} as Record<string, boolean>,
    fuel_level: "1/2",
    damages_notes: "",
    notes_in: "",
  });

  if (!trip) return null;

  const distance = Math.max(0, form.km_end - (trip.km_start || 0));

  const submit = async () => {
    if (form.km_end < trip.km_start) { toast.error("KM final deve ser maior que inicial"); return; }
    const checklist_in = { ...form.checklist, fuel_level: form.fuel_level, damages_notes: form.damages_notes };
    try {
      await close.mutateAsync({
        id: trip.id,
        return_at: form.return_at || null,
        km_end: form.km_end,
        checklist_in,
        notes_in: form.notes_in,
      });
      toast.success(`Viagem finalizada — ${distance.toFixed(1)} km`);
      onClose();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Dialog open={!!trip} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" aria-describedby="trip-close-desc">
        <DialogHeader>
          <DialogTitle>Finalizar viagem — {trip.vehicle_name}</DialogTitle>
          <DialogDescription id="trip-close-desc">Registro de retorno e vistoria final.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data/hora de retorno</Label>
              <Input type="datetime-local" value={form.return_at} onChange={(e) => setForm({ ...form, return_at: e.target.value })} />
            </div>
            <div>
              <Label>KM final *</Label>
              <Input type="number" step="0.01" value={form.km_end} onChange={(e) => setForm({ ...form, km_end: parseFloat(e.target.value) || 0 })} />
              <p className="text-xs text-muted-foreground mt-1">Distância: {distance.toFixed(1)} km</p>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Checklist de retorno</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
              {CHECKLIST_ITEMS.map((item) => (
                <label key={item.key} className="flex items-center gap-2">
                  <Checkbox checked={!!form.checklist[item.key]} onCheckedChange={(v) => setForm({ ...form, checklist: { ...form.checklist, [item.key]: !!v } })} />
                  {item.label}
                </label>
              ))}
              <div className="col-span-2">
                <Label className="text-xs">Nível de combustível na volta</Label>
                <Select value={form.fuel_level} onValueChange={(v) => setForm({ ...form, fuel_level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FUEL_LEVELS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Avarias / observações da vistoria</Label>
                <Textarea value={form.damages_notes} onChange={(e) => setForm({ ...form, damages_notes: e.target.value })} />
              </div>
            </CardContent>
          </Card>

          <div>
            <Label>Notas gerais do retorno</Label>
            <Textarea value={form.notes_in} onChange={(e) => setForm({ ...form, notes_in: e.target.value })} />
          </div>

          {trip.shipment_id && (
            <p className="text-xs text-muted-foreground">A remessa vinculada será atualizada automaticamente com a distância e o custo da frota própria.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={close.isPending}>Finalizar viagem</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────
export default function ControleVeiculos() {
  const [tripDialog, setTripDialog] = useState(false);
  const [vehicleDialog, setVehicleDialog] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [closingTrip, setClosingTrip] = useState<VehicleTrip | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: vehicles = [] } = useVehicles();
  const { data: trips = [], isLoading } = useVehicleTrips(statusFilter !== "all" ? { status: statusFilter } : undefined);
  const deleteVehicle = useDeleteVehicle();
  const deleteTrip = useDeleteVehicleTrip();

  const openTrips = useMemo(() => trips.filter((t) => t.status === "open").length, [trips]);
  const totalKm = useMemo(
    () => trips.filter((t) => t.status === "closed" && t.km_end).reduce((s, t) => s + Math.max(0, (t.km_end || 0) - t.km_start), 0),
    [trips]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Car className="w-6 h-6" /> Controle de Veículos</h1>
          <p className="text-sm text-muted-foreground">Registre saídas, retornos e vistoria da frota. Entregas geram remessas automaticamente na Logística.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setEditingVehicle(null); setVehicleDialog(true); }}><Plus className="w-4 h-4 mr-1" /> Veículo</Button>
          <Button onClick={() => setTripDialog(true)} disabled={vehicles.filter((v) => v.is_active).length === 0}>
            <Plus className="w-4 h-4 mr-1" /> Registrar saída
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Viagens em aberto</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{openTrips}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total de viagens</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{trips.length}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">KM rodados (finalizadas)</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{totalKm.toFixed(1)} km</CardContent></Card>
      </div>

      <Tabs defaultValue="trips">
        <TabsList>
          <TabsTrigger value="trips">Viagens</TabsTrigger>
          <TabsTrigger value="vehicles">Veículos</TabsTrigger>
        </TabsList>

        <TabsContent value="trips" className="space-y-3">
          <div className="flex gap-2 items-center">
            <Label className="text-xs">Status:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="closed">Finalizadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead>Motorista</TableHead>
                    <TableHead>Saída</TableHead>
                    <TableHead>Retorno</TableHead>
                    <TableHead>KM</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (<TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Carregando…</TableCell></TableRow>)}
                  {!isLoading && trips.length === 0 && (<TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Nenhuma viagem registrada.</TableCell></TableRow>)}
                  {trips.map((t) => {
                    const dist = t.km_end != null ? Math.max(0, t.km_end - t.km_start) : null;
                    return (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.vehicle_name}{t.vehicle_plate ? ` (${t.vehicle_plate})` : ""}</TableCell>
                        <TableCell>{t.driver_name || "-"}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(t.departure_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(t.return_at)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {t.km_start}{t.km_end != null ? ` → ${t.km_end}` : ""}
                          {dist != null && <div className="text-xs text-muted-foreground">{dist.toFixed(1)} km</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.purpose === "delivery" ? "default" : "secondary"}>{purposeLabel(t.purpose)}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {t.destination_text || "-"}
                          {t.shipment_id && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1"><Truck className="w-3 h-3" /> Remessa vinculada</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.status === "open" ? "outline" : "default"}>{t.status === "open" ? "Em aberto" : "Finalizada"}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {t.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => setClosingTrip(t)}>
                              <CheckCircle2 className="w-4 h-4 mr-1" /> Finalizar
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => {
                            if (confirm("Excluir esta viagem?")) deleteTrip.mutate(t.id);
                          }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vehicles">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Marca / Modelo</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>KM atual</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.length === 0 && (<TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nenhum veículo cadastrado.</TableCell></TableRow>)}
                  {vehicles.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>{v.plate || "-"}</TableCell>
                      <TableCell>{[v.brand, v.model].filter(Boolean).join(" ") || "-"}</TableCell>
                      <TableCell>{v.year || "-"}</TableCell>
                      <TableCell>{v.current_km}</TableCell>
                      <TableCell><Badge variant={v.is_active ? "default" : "secondary"}>{v.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => { setEditingVehicle(v); setVehicleDialog(true); }}><Edit className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Excluir veículo ${v.name}?`)) deleteVehicle.mutate(v.id); }}><Trash2 className="w-4 h-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {vehicleDialog && (
        <VehicleFormDialog
          open={vehicleDialog}
          onOpenChange={(v) => { setVehicleDialog(v); if (!v) setEditingVehicle(null); }}
          vehicle={editingVehicle}
        />
      )}
      {tripDialog && <TripFormDialog open={tripDialog} onOpenChange={setTripDialog} vehicles={vehicles} />}
      <TripCloseDialog trip={closingTrip} onClose={() => setClosingTrip(null)} />
    </div>
  );
}
