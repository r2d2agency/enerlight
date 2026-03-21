import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/contexts/AuthContext";
import {
  useFieldCaptures, useFieldCaptureDetail, useFieldCaptureMapPoints,
  useFieldCaptureStats, useCreateFieldCapture, useUpdateFieldCapture,
  useAddFieldCaptureVisit, useAddCaptureAttachment, useDeleteFieldCapture,
  useCaptadorSellers, useCaptadorSettings, useUpdateCaptadorSettings,
  FieldCapture,
} from "@/hooks/use-captador";
import {
  MapPin, Camera, Mic, Plus, Eye, User, Building2,
  Phone, Mail, FileText, Trash2, Navigation, Image, AudioLines,
  ClipboardList, Settings, UserPlus, Users,
} from "lucide-react";
import { format } from "date-fns";

const CONSTRUCTION_STAGES = [
  "Terraplanagem",
  "Fundação",
  "Estrutura",
  "Alvenaria",
  "Cobertura",
  "Instalações Elétricas",
  "Instalações Hidráulicas",
  "Reboco/Revestimento",
  "Acabamento",
  "Pintura",
  "Finalização",
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "bg-blue-500" },
  in_progress: { label: "Em Andamento", color: "bg-yellow-500" },
  converted: { label: "Convertido", color: "bg-green-500" },
  archived: { label: "Arquivado", color: "bg-muted" },
};

function CaptureFormDialog({
  open, onClose, onSuccess,
}: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const createCapture = useCreateFieldCapture();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [photos, setPhotos] = useState<{ file_url: string; file_name: string; file_type: string; mime_type: string }[]>([]);
  const [audios, setAudios] = useState<{ file_url: string; file_name: string; file_type: string; mime_type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    address: "", construction_stage: "", stage_notes: "",
    contact_name: "", contact_phone: "", contact_email: "", contact_role: "",
    company_name: "", company_cnpj: "", notes: "",
  });

  const getLocation = () => {
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLoadingLocation(false);
        toast({ title: "Localização capturada!" });
      },
      (err) => {
        setLoadingLocation(false);
        toast({ title: "Erro ao obter localização", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true }
    );
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadFile(file);
      if (url) {
        setPhotos((prev) => [...prev, { file_url: url, file_name: file.name, file_type: "photo", mime_type: file.type }]);
      }
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadFile(file);
      if (url) {
        setAudios((prev) => [...prev, { file_url: url, file_name: file.name, file_type: "audio", mime_type: file.type }]);
      }
    }
  };

  const handleSubmit = async () => {
    try {
      await createCapture.mutateAsync({
        ...form,
        latitude: location?.lat,
        longitude: location?.lng,
        attachments: [...photos, ...audios],
      });
      toast({ title: "Ficha criada com sucesso!" });
      onSuccess();
      onClose();
    } catch {
      toast({ title: "Erro ao criar ficha", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" /> Nova Ficha de Campo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Location */}
          <div className="flex items-center gap-2">
            <Button onClick={getLocation} disabled={loadingLocation} variant="outline" className="flex-1">
              <Navigation className="h-4 w-4 mr-2" />
              {loadingLocation ? "Obtendo..." : location ? "📍 Localização capturada" : "Ativar Localização"}
            </Button>
            {location && (
              <Badge variant="secondary">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</Badge>
            )}
          </div>

          <Input placeholder="Endereço / Referência" value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })} />

          {/* Construction Stage */}
          <Select value={form.construction_stage} onValueChange={(v) => setForm({ ...form, construction_stage: v })}>
            <SelectTrigger><SelectValue placeholder="Etapa da Obra" /></SelectTrigger>
            <SelectContent>
              {CONSTRUCTION_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>

          <Textarea placeholder="Observações sobre a etapa..." value={form.stage_notes}
            onChange={(e) => setForm({ ...form, stage_notes: e.target.value })} rows={2} />

          {/* Contact Info */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1"><User className="h-4 w-4" /> Responsável / Contato</h4>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nome" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              <Input placeholder="Cargo (ex: Engenheiro)" value={form.contact_role} onChange={(e) => setForm({ ...form, contact_role: e.target.value })} />
              <Input placeholder="Telefone" value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              <Input placeholder="E-mail" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
          </div>

          {/* Company */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1"><Building2 className="h-4 w-4" /> Empresa na Obra</h4>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nome da Empresa" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              <Input placeholder="CNPJ" value={form.company_cnpj} onChange={(e) => setForm({ ...form, company_cnpj: e.target.value })} />
            </div>
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1"><Camera className="h-4 w-4" /> Fotos</h4>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handlePhotoUpload} />
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded overflow-hidden border">
                    <img src={p.file_url} alt="" className="w-full h-full object-cover" />
                    <button className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Audio */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1"><Mic className="h-4 w-4" /> Áudios</h4>
              <Button size="sm" variant="outline" onClick={() => audioInputRef.current?.click()} disabled={isUploading}>
                <Plus className="h-3 w-3 mr-1" /> Gravar/Enviar
              </Button>
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
            </div>
            {audios.length > 0 && (
              <div className="space-y-1">
                {audios.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                    <AudioLines className="h-4 w-4" />
                    <span className="truncate flex-1">{a.file_name}</span>
                    <button onClick={() => setAudios((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <Textarea placeholder="Anotações gerais..." value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />

          <Button onClick={handleSubmit} disabled={createCapture.isPending} className="w-full">
            {createCapture.isPending ? "Salvando..." : "Salvar Ficha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CaptureDetailDialog({
  captureId, open, onClose,
}: { captureId: string | null; open: boolean; onClose: () => void }) {
  const { data: capture } = useFieldCaptureDetail(captureId);
  const addVisit = useAddFieldCaptureVisit();
  const updateCapture = useUpdateFieldCapture();
  const { uploadFile, isUploading } = useUpload();
  const { toast } = useToast();
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitForm, setVisitForm] = useState({ construction_stage: "", notes: "" });
  const [visitPhotos, setVisitPhotos] = useState<any[]>([]);
  const visitFileRef = useRef<HTMLInputElement>(null);

  if (!capture) return null;

  const handleAddVisit = async () => {
    let lat: number | undefined, lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch { /* ignore */ }

    await addVisit.mutateAsync({
      captureId: capture.id,
      ...visitForm,
      latitude: lat,
      longitude: lng,
      attachments: visitPhotos,
    });
    toast({ title: "Visita registrada!" });
    setShowVisitForm(false);
    setVisitForm({ construction_stage: "", notes: "" });
    setVisitPhotos([]);
  };

  const handleVisitPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadFile(file);
      if (url) setVisitPhotos((p) => [...p, { file_url: url, file_name: file.name, file_type: "photo", mime_type: file.type }]);
    }
  };

  const statusInfo = STATUS_MAP[capture.status] || STATUS_MAP.new;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Ficha #{capture.id.slice(0, 8)}
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info">
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
            <TabsTrigger value="media" className="flex-1">Mídia ({(capture.attachments?.length || 0)})</TabsTrigger>
            <TabsTrigger value="visits" className="flex-1">Visitas ({capture.visits?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Captador:</span> {capture.created_by_name}</div>
              <div><span className="text-muted-foreground">Data:</span> {format(new Date(capture.created_at), "dd/MM/yyyy HH:mm")}</div>
              <div><span className="text-muted-foreground">Endereço:</span> {capture.address || "—"}</div>
              <div><span className="text-muted-foreground">Etapa:</span> {capture.construction_stage || "—"}</div>
            </div>

            {(capture.contact_name || capture.contact_phone) && (
              <Card>
                <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Contato</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1"><User className="h-3 w-3" /> {capture.contact_name || "—"}</div>
                  <div className="flex items-center gap-1"><Badge variant="outline">{capture.contact_role || "—"}</Badge></div>
                  <div className="flex items-center gap-1"><Phone className="h-3 w-3" /> {capture.contact_phone || "—"}</div>
                  <div className="flex items-center gap-1"><Mail className="h-3 w-3" /> {capture.contact_email || "—"}</div>
                </CardContent>
              </Card>
            )}

            {capture.company_name && (
              <Card>
                <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Empresa</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 text-sm">
                  <div>{capture.company_name}</div>
                  {capture.company_cnpj && <div className="text-muted-foreground">CNPJ: {capture.company_cnpj}</div>}
                </CardContent>
              </Card>
            )}

            {capture.notes && <div className="text-sm bg-muted rounded p-3">{capture.notes}</div>}

            {/* Status change */}
            <div className="flex gap-2">
              <Select value={capture.status} onValueChange={(v) => updateCapture.mutate({ id: capture.id, status: v })}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_MAP).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          <TabsContent value="media" className="mt-3">
            {capture.attachments && capture.attachments.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {capture.attachments.map((att) => (
                  <div key={att.id} className="border rounded overflow-hidden">
                    {att.file_type === "photo" ? (
                      <a href={att.file_url} target="_blank" rel="noopener">
                        <img src={att.file_url} alt={att.file_name} className="w-full h-32 object-cover" />
                      </a>
                    ) : att.file_type === "audio" ? (
                      <div className="p-2">
                        <audio controls src={att.file_url} className="w-full" />
                        <p className="text-xs truncate mt-1">{att.file_name}</p>
                      </div>
                    ) : (
                      <a href={att.file_url} target="_blank" rel="noopener" className="p-3 flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4" /> {att.file_name}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">Nenhuma mídia anexada</p>
            )}
          </TabsContent>

          <TabsContent value="visits" className="mt-3 space-y-3">
            <Button size="sm" onClick={() => setShowVisitForm(!showVisitForm)}>
              <Plus className="h-4 w-4 mr-1" /> Nova Visita
            </Button>

            {showVisitForm && (
              <Card className="p-3 space-y-2">
                <Select value={visitForm.construction_stage} onValueChange={(v) => setVisitForm({ ...visitForm, construction_stage: v })}>
                  <SelectTrigger><SelectValue placeholder="Etapa atual da obra" /></SelectTrigger>
                  <SelectContent>
                    {CONSTRUCTION_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea placeholder="Observações da visita..." value={visitForm.notes}
                  onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} rows={2} />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => visitFileRef.current?.click()} disabled={isUploading}>
                    <Camera className="h-3 w-3 mr-1" /> Fotos
                  </Button>
                  <input ref={visitFileRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handleVisitPhoto} />
                  {visitPhotos.length > 0 && <Badge>{visitPhotos.length} foto(s)</Badge>}
                  <div className="flex-1" />
                  <Button size="sm" onClick={handleAddVisit} disabled={addVisit.isPending}>Salvar Visita</Button>
                </div>
              </Card>
            )}

            <ScrollArea className="max-h-80">
              {capture.visits?.map((visit) => (
                <Card key={visit.id} className="mb-2 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{visit.visited_by_name}</span>
                    <span className="text-muted-foreground">{format(new Date(visit.created_at), "dd/MM/yyyy HH:mm")}</span>
                  </div>
                  <Badge variant="outline" className="mt-1">{visit.construction_stage}</Badge>
                  {visit.notes && <p className="text-sm mt-1">{visit.notes}</p>}
                  {visit.attachments && visit.attachments.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {visit.attachments.map((a) => (
                        <a key={a.id} href={a.file_url} target="_blank" rel="noopener">
                          <img src={a.file_url} className="w-16 h-16 object-cover rounded" alt="" />
                        </a>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
              {(!capture.visits || capture.visits.length === 0) && (
                <p className="text-center text-muted-foreground py-4">Nenhuma visita registrada</p>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default function Captador() {
  const { toast } = useToast();
  const [tab, setTab] = useState("list");
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ status?: string; user_id?: string }>({});

  const { data: captures = [], refetch } = useFieldCaptures(filters);
  const { data: stats } = useFieldCaptureStats(filters.user_id);
  const { data: mapPoints = [] } = useFieldCaptureMapPoints(filters);
  const deleteCapture = useDeleteFieldCapture();

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta ficha?")) return;
    await deleteCapture.mutateAsync(id);
    toast({ title: "Ficha excluída" });
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Captador
          </h1>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Ficha
          </Button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.total_captures}</div>
              <div className="text-xs text-muted-foreground">Total Fichas</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{stats.new_count}</div>
              <div className="text-xs text-muted-foreground">Novas</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-yellow-500">{stats.in_progress_count}</div>
              <div className="text-xs text-muted-foreground">Em Andamento</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{stats.converted_count}</div>
              <div className="text-xs text-muted-foreground">Convertidos</div>
            </Card>
            <Card className="p-3 text-center">
              <div className="text-2xl font-bold">{stats.total_visits}</div>
              <div className="text-xs text-muted-foreground">Total Visitas</div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? undefined : v })}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="list"><ClipboardList className="h-4 w-4 mr-1" /> Lista</TabsTrigger>
            <TabsTrigger value="map"><MapPin className="h-4 w-4 mr-1" /> Mapa</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {captures.map((c) => {
                const st = STATUS_MAP[c.status] || STATUS_MAP.new;
                return (
                  <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedId(c.id)}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge className={st.color}>{st.label}</Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(c.created_at), "dd/MM/yyyy")}</span>
                      </div>
                      {c.company_name && (
                        <div className="font-medium flex items-center gap-1 text-sm">
                          <Building2 className="h-3 w-3" /> {c.company_name}
                        </div>
                      )}
                      {c.address && (
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {c.address}
                        </div>
                      )}
                      {c.construction_stage && <Badge variant="outline" className="text-xs">{c.construction_stage}</Badge>}
                      {c.contact_name && (
                        <div className="text-xs flex items-center gap-1">
                          <User className="h-3 w-3" /> {c.contact_name}
                          {c.contact_phone && <span>• <Phone className="h-3 w-3 inline" /> {c.contact_phone}</span>}
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{c.created_by_name}</span>
                        <div className="flex items-center gap-2">
                          {c.attachments && c.attachments.length > 0 && (
                            <span className="flex items-center gap-0.5"><Image className="h-3 w-3" /> {c.attachments.length}</span>
                          )}
                          {c.visit_count > 0 && (
                            <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {c.visit_count}</span>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {captures.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  Nenhuma ficha encontrada. Clique em "Nova Ficha" para começar.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="map" className="mt-3">
            <CaptadorMap points={mapPoints} onSelect={setSelectedId} />
          </TabsContent>
        </Tabs>

        <CaptureFormDialog open={showForm} onClose={() => setShowForm(false)} onSuccess={() => refetch()} />
        <CaptureDetailDialog captureId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </MainLayout>
  );
}

function CaptadorMap({ points, onSelect }: { points: any[]; onSelect: (id: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      const map = L.map(mapRef.current!, { center: [-15.78, -47.93], zoom: 5 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);
      mapInstanceRef.current = map;

      // Add markers
      if (points.length > 0) {
        const bounds: [number, number][] = [];
        points.forEach((p: any) => {
          if (!p.latitude || !p.longitude) return;
          const pos: [number, number] = [parseFloat(p.latitude), parseFloat(p.longitude)];
          bounds.push(pos);

          const icon = L.divIcon({
            className: "custom-marker",
            html: `<div style="background:${p.status === 'converted' ? '#22c55e' : p.status === 'in_progress' ? '#eab308' : '#3b82f6'};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold">${p.visit_count || 0}</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          const marker = L.marker(pos, { icon }).addTo(map);
          marker.bindPopup(`
            <div style="min-width:200px">
              <strong>${p.company_name || 'Obra'}</strong><br/>
              <small>${p.address || ''}</small><br/>
              <small>Etapa: ${p.construction_stage || '—'}</small><br/>
              <small>Captador: ${p.created_by_name}</small><br/>
              <small>Visitas: ${p.visit_count || 0}</small>
            </div>
          `);
          marker.on("click", () => onSelect(p.id));
        });
        if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [points, onSelect]);

  return <div ref={mapRef} className="w-full h-[500px] rounded-lg border" />;
}
