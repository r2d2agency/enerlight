import { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
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
import { useAudioRecorder } from "@/hooks/use-audio-recorder";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useFieldCaptures, useFieldCaptureDetail, useFieldCaptureMapPoints,
  useFieldCaptureStats, useCreateFieldCapture, useUpdateFieldCapture,
  useAddFieldCaptureVisit, useAddCaptureAttachment, useDeleteFieldCapture,
  useCaptadorSellers, useCaptadorSettings, useUpdateCaptadorSettings,
  useScheduleReturn, useTodayReturns,
  FieldCapture,
} from "@/hooks/use-captador";
import {
  MapPin, Camera, Mic, Plus, Eye, User, Building2,
  Phone, Mail, FileText, Trash2, Navigation, Image, AudioLines,
  ClipboardList, Settings, UserPlus, Users, LogIn, LogOut, Clock,
  ChevronRight, CheckCircle2, Circle, ArrowLeft, WifiOff, Wifi, Square, Download,
} from "lucide-react";
import { format } from "date-fns";

// ─── Phone Mask Utility ───
function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function applyCnpjMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

// ─── Reverse Geocoding ───
async function reverseGeocode(lat: number, lng: number): Promise<{
  street: string; number: string; neighborhood: string; city: string; state: string; full: string;
} | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=pt-BR`);
    const data = await res.json();
    const a = data.address || {};
    return {
      street: a.road || a.pedestrian || a.street || "",
      number: a.house_number || "",
      neighborhood: a.suburb || a.neighbourhood || a.quarter || "",
      city: a.city || a.town || a.village || a.municipality || "",
      state: a.state || "",
      full: data.display_name || "",
    };
  } catch { return null; }
}

// ─── Photo Compression Utility ───
async function compressImage(file: File, maxWidth = 1280, quality = 0.7): Promise<File> {
  return new Promise((resolve) => {
    const img = document.createElement("img");
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = (maxWidth / w) * h; w = maxWidth; }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        } else {
          resolve(file);
        }
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}


interface ContactItem {
  name: string;
  phone: string;
  phoneDisplay: string;
  email: string;
  role: string;
}
const CONSTRUCTION_STAGES = [
  "Terraplanagem", "Fundação", "Estrutura", "Alvenaria", "Cobertura",
  "Instalações Elétricas", "Instalações Hidráulicas", "Reboco/Revestimento",
  "Acabamento", "Pintura", "Finalização",
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "Novo", color: "bg-blue-500" },
  in_progress: { label: "Em Andamento", color: "bg-yellow-500" },
  converted: { label: "Convertido", color: "bg-green-500" },
  archived: { label: "Arquivado", color: "bg-muted" },
};

// ─── Check-in/Checkout Hook ───
function useCheckin() {
  const [checkedIn, setCheckedIn] = useState(false);
  const [checkinTime, setCheckinTime] = useState<Date | null>(null);
  const [checkinLocation, setCheckinLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("captador_checkin");
    if (saved) {
      const data = JSON.parse(saved);
      setCheckedIn(true);
      setCheckinTime(new Date(data.time));
      setCheckinLocation(data.location);
    }
  }, []);

  const doCheckin = () => {
    return new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const now = new Date();
          setCheckedIn(true);
          setCheckinTime(now);
          setCheckinLocation(loc);
          localStorage.setItem("captador_checkin", JSON.stringify({ time: now.toISOString(), location: loc }));
          resolve();
        },
        (err) => reject(err),
        { enableHighAccuracy: true }
      );
    });
  };

  const doCheckout = () => {
    setCheckedIn(false);
    setCheckinTime(null);
    setCheckinLocation(null);
    localStorage.removeItem("captador_checkin");
  };

  return { checkedIn, checkinTime, checkinLocation, doCheckin, doCheckout };
}

// ─── Offline Queue ───
const OFFLINE_QUEUE_KEY = "captador_offline_queue";

function getOfflineQueue(): any[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch { return []; }
}

function addToOfflineQueue(data: any) {
  const queue = getOfflineQueue();
  queue.push({ ...data, _offlineId: Date.now().toString(), _createdAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function removeFromOfflineQueue(offlineId: string) {
  const queue = getOfflineQueue().filter((item) => item._offlineId !== offlineId);
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function useOfflineSync(createCapture: any, onSuccess: () => void) {
  const { toast } = useToast();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(getOfflineQueue().length);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, []);

  // Sync when back online
  useEffect(() => {
    if (!isOnline) return;
    const queue = getOfflineQueue();
    if (queue.length === 0) return;

    const syncAll = async () => {
      let synced = 0;
      for (const item of queue) {
        try {
          const { _offlineId, _createdAt, ...data } = item;
          await createCapture.mutateAsync(data);
          removeFromOfflineQueue(_offlineId);
          synced++;
        } catch (err) {
          console.error("[Offline sync] failed for item", item._offlineId, err);
        }
      }
      setPendingCount(getOfflineQueue().length);
      if (synced > 0) {
        toast({ title: `✅ ${synced} ficha(s) sincronizada(s)!` });
        onSuccess();
      }
    };
    syncAll();
  }, [isOnline]);

  const refreshCount = () => setPendingCount(getOfflineQueue().length);

  return { isOnline, pendingCount, refreshCount };
}

// ─── Mobile Capture Form (Full Screen) ───
function MobileCaptureForm({ open, onClose, onSuccess, isOnline }: { open: boolean; onClose: () => void; onSuccess: () => void; isOnline?: boolean }) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const createCapture = useCreateFieldCapture();
  const audioRecorder = useAudioRecorder();
  const [step, setStep] = useState(0);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [photos, setPhotos] = useState<{ file_url: string; file_name: string; file_type: string; mime_type: string }[]>([]);
  const [audios, setAudios] = useState<{ file_url: string; file_name: string; file_type: string; mime_type: string }[]>([]);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const emptyContact = (): ContactItem => ({ name: "", phone: "", phoneDisplay: "", email: "", role: "" });

  const [form, setForm] = useState({
    street: "", number: "", neighborhood: "", city: "", state: "",
    construction_stage: "", stage_notes: "",
    company_name: "", company_cnpj: "", company_cnpj_display: "", notes: "",
  });
  const [contacts, setContacts] = useState<ContactItem[]>([emptyContact()]);

  useEffect(() => {
    if (open) {
      setStep(0);
      setLocation(null);
      setPhotos([]);
      setAudios([]);
      setForm({
        street: "", number: "", neighborhood: "", city: "", state: "",
        construction_stage: "", stage_notes: "",
        company_name: "", company_cnpj: "", company_cnpj_display: "", notes: "",
      });
      setContacts([emptyContact()]);
    }
  }, [open]);

  const getLocation = () => {
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        toast({ title: "📍 Localização capturada!" });
        // Reverse geocode
        const geo = await reverseGeocode(loc.lat, loc.lng);
        if (geo) {
          setForm(prev => ({
            ...prev,
            street: geo.street || prev.street,
            number: geo.number || prev.number,
            neighborhood: geo.neighborhood || prev.neighborhood,
            city: geo.city || prev.city,
            state: geo.state || prev.state,
          }));
          toast({ title: "📍 Endereço preenchido automaticamente!" });
        }
        setLoadingLocation(false);
      },
      (err) => {
        setLoadingLocation(false);
        toast({ title: "Erro ao obter localização", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true }
    );
  };

  const updateContact = (index: number, field: keyof ContactItem, value: string) => {
    setContacts(prev => prev.map((c, i) => {
      if (i !== index) return c;
      if (field === "phone") {
        return { ...c, phone: value.replace(/\D/g, ""), phoneDisplay: applyPhoneMask(value) };
      }
      return { ...c, [field]: value };
    }));
  };

  const addContact = () => setContacts(prev => [...prev, emptyContact()]);
  const removeContact = (index: number) => setContacts(prev => prev.filter((_, i) => i !== index));

  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadFile(file);
      if (url) setPhotos((prev) => [...prev, { file_url: url, file_name: file.name, file_type: "photo", mime_type: file.type }]);
    }
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  const handleStopAndSaveAudio = async () => {
    audioRecorder.stopRecording();
    // Wait for blob to be available
    setTimeout(async () => {
      const blob = audioRecorder.audioBlob;
      if (!blob) return;
      const file = new File([blob], `audio_${Date.now()}.webm`, { type: blob.type || "audio/webm" });
      if (isOnline !== false) {
        const url = await uploadFile(file);
        if (url) setAudios((prev) => [...prev, { file_url: url, file_name: file.name, file_type: "audio", mime_type: file.type }]);
      } else {
        // Store as base64 for offline
        const reader = new FileReader();
        reader.onloadend = () => {
          setAudios((prev) => [...prev, { file_url: reader.result as string, file_name: file.name, file_type: "audio", mime_type: file.type }]);
        };
        reader.readAsDataURL(file);
      }
      audioRecorder.clearAudio();
    }, 300);
  };

  const handleSubmit = async () => {
    const address = [
      form.street && `Rua ${form.street}`,
      form.number && `Nº ${form.number}`,
      form.neighborhood,
      form.city,
      form.state,
    ].filter(Boolean).join(", ");

    const primary = contacts[0] || emptyContact();
    const extraContacts = contacts.slice(1).filter(c => c.name || c.phone);

    const captureData = {
      address,
      construction_stage: form.construction_stage,
      stage_notes: form.stage_notes,
      contact_name: primary.name,
      contact_phone: primary.phone,
      contact_email: primary.email,
      contact_role: primary.role,
      company_name: form.company_name,
      company_cnpj: form.company_cnpj,
      notes: extraContacts.length > 0
        ? `${form.notes}\n\n--- Contatos Adicionais ---\n${extraContacts.map(c => `${c.name} | ${applyPhoneMask(c.phone)} | ${c.role} | ${c.email}`).join("\n")}`.trim()
        : form.notes,
      latitude: location?.lat,
      longitude: location?.lng,
      attachments: [...photos, ...audios],
    };

    if (isOnline === false) {
      addToOfflineQueue(captureData);
      toast({ title: "📱 Ficha salva offline!", description: "Será sincronizada quando voltar online." });
      onSuccess();
      onClose();
      return;
    }

    try {
      await createCapture.mutateAsync(captureData);
      toast({ title: "✅ Ficha criada com sucesso!" });
      onSuccess();
      onClose();
    } catch {
      // If network fails, save offline
      addToOfflineQueue(captureData);
      toast({ title: "📱 Sem conexão, ficha salva offline!", description: "Será sincronizada automaticamente." });
      onSuccess();
      onClose();
    }
  };

  const steps = [
    { title: "Localização", icon: Navigation },
    { title: "Fotos", icon: Camera },
    { title: "Obra", icon: Building2 },
    { title: "Contato", icon: User },
    { title: "Notas", icon: FileText },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-card">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="font-semibold text-lg flex-1">Nova Ficha</h2>
        <span className="text-sm text-muted-foreground">{step + 1}/{steps.length}</span>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1 px-4 py-2 bg-muted/30">
        {steps.map((s, i) => (
          <button key={i} onClick={() => setStep(i)}
            className={`flex-1 h-1.5 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {step === 0 && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <Navigation className="h-16 w-16 mx-auto text-primary mb-4" />
              <h3 className="text-xl font-semibold mb-2">Capturar Localização</h3>
              <p className="text-muted-foreground text-sm mb-6">
                Ative o GPS para registrar a posição exata da obra
              </p>
              <Button onClick={getLocation} disabled={loadingLocation} size="lg" className="w-full max-w-xs">
                {loadingLocation ? "Obtendo..." : location ? "✅ Localização capturada" : "📍 Ativar GPS"}
              </Button>
              {location && (
                <p className="text-xs text-muted-foreground mt-2">
                  {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
                </p>
              )}
            </div>
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">Endereço</h4>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Rua" value={form.street} className="col-span-2 h-12 text-base"
                  onChange={(e) => setForm({ ...form, street: e.target.value })} />
                <Input placeholder="Nº" value={form.number} className="h-12 text-base"
                  onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </div>
              <Input placeholder="Bairro" value={form.neighborhood} className="h-12 text-base"
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="Cidade" value={form.city} className="col-span-2 h-12 text-base"
                  onChange={(e) => setForm({ ...form, city: e.target.value })} />
                <Input placeholder="UF" value={form.state} className="h-12 text-base" maxLength={2}
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Camera className="h-12 w-12 mx-auto text-primary mb-3" />
              <h3 className="text-lg font-semibold mb-1">Registrar Fotos</h3>
              <p className="text-muted-foreground text-sm mb-4">Tire fotos da obra com a câmera</p>
            </div>

            <Button onClick={() => cameraInputRef.current?.click()} disabled={isUploading}
              size="lg" className="w-full h-14 text-base" variant="outline">
              <Camera className="h-5 w-5 mr-2" />
              {isUploading ? "Enviando..." : "Abrir Câmera"}
            </Button>
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={handleCameraCapture} />

            {photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                    <img src={p.file_url} alt="" className="w-full h-full object-cover" />
                    <button className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Mic className="h-4 w-4" /> Áudio
              </h4>
              {!audioRecorder.isRecording ? (
                <Button onClick={() => audioRecorder.startRecording()}
                  size="lg" className="w-full h-14 text-base" variant="outline">
                  <Mic className="h-5 w-5 mr-2 text-destructive" /> Gravar Áudio
                </Button>
              ) : (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
                    <span className="text-lg font-mono font-bold">{audioRecorder.formatDuration(audioRecorder.duration)}</span>
                  </div>
                  <div className="flex items-center justify-center gap-0.5 h-8">
                    {audioRecorder.audioLevels.map((level, i) => (
                      <div key={i} className="w-1.5 bg-destructive rounded-full transition-all duration-75"
                        style={{ height: `${Math.max(4, level * 32)}px` }} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" className="flex-1" onClick={() => audioRecorder.cancelRecording()}>
                      <Trash2 className="h-4 w-4 mr-1" /> Cancelar
                    </Button>
                    <Button variant="destructive" className="flex-1" onClick={handleStopAndSaveAudio}>
                      <Square className="h-4 w-4 mr-1" /> Parar e Salvar
                    </Button>
                  </div>
                </div>
              )}
              {audios.length > 0 && (
                <div className="space-y-1">
                  {audios.map((a, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded-lg px-3 py-2">
                      <AudioLines className="h-4 w-4 shrink-0" />
                      <span className="truncate flex-1">{a.file_name}</span>
                      <button onClick={() => setAudios((prev) => prev.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Building2 className="h-5 w-5" /> Dados da Obra
            </h3>
            <Select value={form.construction_stage} onValueChange={(v) => setForm({ ...form, construction_stage: v })}>
              <SelectTrigger className="h-12 text-base"><SelectValue placeholder="Etapa da Obra" /></SelectTrigger>
              <SelectContent>
                {CONSTRUCTION_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Observações sobre a etapa..." value={form.stage_notes}
              onChange={(e) => setForm({ ...form, stage_notes: e.target.value })} rows={3} className="text-base" />
            <Input placeholder="Nome da Empresa" value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="h-12 text-base" />
            <Input placeholder="CNPJ" value={form.company_cnpj_display} className="h-12 text-base"
              onChange={(e) => setForm({ ...form, company_cnpj: e.target.value.replace(/\D/g, ""), company_cnpj_display: applyCnpjMask(e.target.value) })} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5" /> Contatos
              </h3>
              <Button size="sm" variant="outline" onClick={addContact}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>
            {contacts.map((contact, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    {idx === 0 ? "Contato Principal" : `Contato ${idx + 1}`}
                  </span>
                  {idx > 0 && (
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeContact(idx)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <Input placeholder="Nome" value={contact.name} className="h-12 text-base"
                  onChange={(e) => updateContact(idx, "name", e.target.value)} />
                <Input placeholder="Cargo (ex: Engenheiro)" value={contact.role} className="h-12 text-base"
                  onChange={(e) => updateContact(idx, "role", e.target.value)} />
                <Input placeholder="(XX) XXXXX-XXXX" value={contact.phoneDisplay} type="tel" className="h-12 text-base"
                  onChange={(e) => updateContact(idx, "phone", e.target.value)} />
                <Input placeholder="E-mail" value={contact.email} type="email" className="h-12 text-base"
                  onChange={(e) => updateContact(idx, "email", e.target.value)} />
              </div>
            ))}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" /> Anotações
            </h3>
            <Textarea placeholder="Anotações gerais sobre a visita..." value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={6} className="text-base" />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-card flex gap-3 safe-area-bottom">
        {step > 0 && (
          <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1 h-12">
            Voltar
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} className="flex-1 h-12 text-base">
            Próximo <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={createCapture.isPending} className="flex-1 h-12 text-base">
            {createCapture.isPending ? "Salvando..." : "✅ Salvar Ficha"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Desktop Capture Form (Dialog) ───
function DesktopCaptureFormDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const createCapture = useCreateFieldCapture();
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [photos, setPhotos] = useState<{ file_url: string; file_name: string; file_type: string; mime_type: string }[]>([]);
  const [audios, setAudios] = useState<{ file_url: string; file_name: string; file_type: string; mime_type: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const emptyContact = (): ContactItem => ({ name: "", phone: "", phoneDisplay: "", email: "", role: "" });

  const [form, setForm] = useState({
    street: "", number: "", neighborhood: "", city: "", state: "",
    construction_stage: "", stage_notes: "",
    company_name: "", company_cnpj: "", company_cnpj_display: "", notes: "",
  });
  const [contacts, setContacts] = useState<ContactItem[]>([emptyContact()]);

  useEffect(() => {
    if (open) {
      setForm({ street: "", number: "", neighborhood: "", city: "", state: "", construction_stage: "", stage_notes: "", company_name: "", company_cnpj: "", company_cnpj_display: "", notes: "" });
      setContacts([emptyContact()]);
      setPhotos([]); setAudios([]); setLocation(null);
    }
  }, [open]);

  const getLocation = () => {
    setLoadingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(loc);
        toast({ title: "Localização capturada!" });
        const geo = await reverseGeocode(loc.lat, loc.lng);
        if (geo) {
          setForm(prev => ({ ...prev, street: geo.street || prev.street, number: geo.number || prev.number, neighborhood: geo.neighborhood || prev.neighborhood, city: geo.city || prev.city, state: geo.state || prev.state }));
        }
        setLoadingLocation(false);
      },
      (err) => { setLoadingLocation(false); toast({ title: "Erro", description: err.message, variant: "destructive" }); },
      { enableHighAccuracy: true }
    );
  };

  const updateContact = (index: number, field: keyof ContactItem, value: string) => {
    setContacts(prev => prev.map((c, i) => {
      if (i !== index) return c;
      if (field === "phone") return { ...c, phone: value.replace(/\D/g, ""), phoneDisplay: applyPhoneMask(value) };
      return { ...c, [field]: value };
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadFile(file);
      if (url) setPhotos((prev) => [...prev, { file_url: url, file_name: file.name, file_type: "photo", mime_type: file.type }]);
    }
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const url = await uploadFile(file);
      if (url) setAudios((prev) => [...prev, { file_url: url, file_name: file.name, file_type: "audio", mime_type: file.type }]);
    }
  };

  const handleSubmit = async () => {
    const address = [form.street && `Rua ${form.street}`, form.number && `Nº ${form.number}`, form.neighborhood, form.city, form.state].filter(Boolean).join(", ");
    const primary = contacts[0] || emptyContact();
    const extraContacts = contacts.slice(1).filter(c => c.name || c.phone);
    try {
      await createCapture.mutateAsync({
        address, construction_stage: form.construction_stage, stage_notes: form.stage_notes,
        contact_name: primary.name, contact_phone: primary.phone, contact_email: primary.email, contact_role: primary.role,
        company_name: form.company_name, company_cnpj: form.company_cnpj,
        notes: extraContacts.length > 0
          ? `${form.notes}\n\n--- Contatos Adicionais ---\n${extraContacts.map(c => `${c.name} | ${applyPhoneMask(c.phone)} | ${c.role} | ${c.email}`).join("\n")}`.trim()
          : form.notes,
        latitude: location?.lat, longitude: location?.lng, attachments: [...photos, ...audios],
      });
      toast({ title: "Ficha criada com sucesso!" });
      onSuccess(); onClose();
    } catch { toast({ title: "Erro ao criar ficha", variant: "destructive" }); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5" /> Nova Ficha de Campo</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Location + Address */}
          <div className="flex items-center gap-2">
            <Button onClick={getLocation} disabled={loadingLocation} variant="outline" className="flex-1">
              <Navigation className="h-4 w-4 mr-2" /> {loadingLocation ? "Obtendo..." : location ? "📍 Localização capturada" : "Ativar Localização"}
            </Button>
            {location && <Badge variant="secondary">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</Badge>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Input placeholder="Rua" value={form.street} className="col-span-3" onChange={(e) => setForm({ ...form, street: e.target.value })} />
            <Input placeholder="Nº" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <Input placeholder="Bairro" value={form.neighborhood} className="col-span-2" onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
            <Input placeholder="Cidade" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="UF" value={form.state} maxLength={2} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} />
          </div>

          {/* Obra */}
          <Select value={form.construction_stage} onValueChange={(v) => setForm({ ...form, construction_stage: v })}>
            <SelectTrigger><SelectValue placeholder="Etapa da Obra" /></SelectTrigger>
            <SelectContent>{CONSTRUCTION_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <Textarea placeholder="Observações sobre a etapa..." value={form.stage_notes} onChange={(e) => setForm({ ...form, stage_notes: e.target.value })} rows={2} />

          {/* Contacts */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1"><User className="h-4 w-4" /> Contatos</h4>
              <Button size="sm" variant="outline" onClick={() => setContacts(prev => [...prev, emptyContact()])}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>
            {contacts.map((contact, idx) => (
              <div key={idx} className="space-y-2 border-t pt-2 first:border-0 first:pt-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{idx === 0 ? "Principal" : `Contato ${idx + 1}`}</span>
                  {idx > 0 && <button onClick={() => setContacts(prev => prev.filter((_, i) => i !== idx))}><Trash2 className="h-3 w-3 text-destructive" /></button>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Nome" value={contact.name} onChange={(e) => updateContact(idx, "name", e.target.value)} />
                  <Input placeholder="Cargo" value={contact.role} onChange={(e) => updateContact(idx, "role", e.target.value)} />
                  <Input placeholder="(XX) XXXXX-XXXX" value={contact.phoneDisplay} type="tel" onChange={(e) => updateContact(idx, "phone", e.target.value)} />
                  <Input placeholder="E-mail" value={contact.email} type="email" onChange={(e) => updateContact(idx, "email", e.target.value)} />
                </div>
              </div>
            ))}
          </div>

          {/* Empresa */}
          <div className="border rounded-lg p-3 space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-1"><Building2 className="h-4 w-4" /> Empresa na Obra</h4>
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nome da Empresa" value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              <Input placeholder="CNPJ" value={form.company_cnpj_display} onChange={(e) => setForm({ ...form, company_cnpj: e.target.value.replace(/\D/g, ""), company_cnpj_display: applyCnpjMask(e.target.value) })} />
            </div>
          </div>

          {/* Fotos */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1"><Camera className="h-4 w-4" /> Fotos</h4>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}><Plus className="h-3 w-3 mr-1" /> Adicionar</Button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={handlePhotoUpload} />
            </div>
            {photos.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photos.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded overflow-hidden border">
                    <img src={p.file_url} alt="" className="w-full h-full object-cover" />
                    <button className="absolute top-0 right-0 bg-destructive text-destructive-foreground rounded-bl p-0.5"
                      onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Audios */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium flex items-center gap-1"><Mic className="h-4 w-4" /> Áudios</h4>
              <Button size="sm" variant="outline" onClick={() => audioInputRef.current?.click()} disabled={isUploading}><Plus className="h-3 w-3 mr-1" /> Gravar/Enviar</Button>
              <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
            </div>
            {audios.length > 0 && (
              <div className="space-y-1">
                {audios.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                    <AudioLines className="h-4 w-4" />
                    <span className="truncate flex-1">{a.file_name}</span>
                    <button onClick={() => setAudios((prev) => prev.filter((_, idx) => idx !== i))}><Trash2 className="h-3 w-3 text-destructive" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Textarea placeholder="Anotações gerais..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
          <Button onClick={handleSubmit} disabled={createCapture.isPending} className="w-full">
            {createCapture.isPending ? "Salvando..." : "Salvar Ficha"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
// ─── Capture Detail Dialog ───
function CaptureDetailDialog({ captureId, open, onClose }: { captureId: string | null; open: boolean; onClose: () => void }) {
  const { data: capture } = useFieldCaptureDetail(captureId);
  const addVisit = useAddFieldCaptureVisit();
  const updateCapture = useUpdateFieldCapture();
  const scheduleReturn = useScheduleReturn();
  const { uploadFile, isUploading } = useUpload();
  const { toast } = useToast();
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitForm, setVisitForm] = useState({ construction_stage: "", notes: "" });
  const [visitPhotos, setVisitPhotos] = useState<any[]>([]);
  const [returnDate, setReturnDate] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [showReturnForm, setShowReturnForm] = useState(false);
  const visitFileRef = useRef<HTMLInputElement>(null);

  if (!capture) return null;

  const handleAddVisit = async () => {
    let lat: number | undefined, lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true })
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch { /* ignore */ }

    await addVisit.mutateAsync({ captureId: capture.id, ...visitForm, latitude: lat, longitude: lng, attachments: visitPhotos });
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Ficha #{capture.id.slice(0, 8)}
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="info">
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1">Informações</TabsTrigger>
            <TabsTrigger value="media" className="flex-1">Mídia ({capture.attachments?.length || 0})</TabsTrigger>
            <TabsTrigger value="visits" className="flex-1">Visitas ({capture.visits?.length || 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="info" className="space-y-3 mt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Captador:</span> {capture.created_by_name}</div>
              <div><span className="text-muted-foreground">Data:</span> {format(new Date(capture.created_at), "dd/MM/yyyy HH:mm")}</div>
              <div><span className="text-muted-foreground">Endereço:</span> {capture.address || "—"}</div>
              <div><span className="text-muted-foreground">Etapa:</span> {capture.construction_stage || "—"}</div>
            </div>
            {(capture.contact_name || capture.contact_phone) && (
              <Card>
                <CardHeader className="py-2 px-3"><CardTitle className="text-sm">Contato</CardTitle></CardHeader>
                <CardContent className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
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
            <Select value={capture.status} onValueChange={(v) => updateCapture.mutate({ id: capture.id, status: v })}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>

            {/* Return Scheduling */}
            <div className="border rounded-lg p-3 space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Agendar Retorno
                </h4>
                {(capture as any).return_date && (
                  <Badge variant="outline" className="text-xs">
                    Retorno: {format(new Date((capture as any).return_date + "T12:00:00"), "dd/MM/yyyy")}
                  </Badge>
                )}
              </div>
              {!showReturnForm ? (
                <Button size="sm" variant="outline" onClick={() => {
                  setReturnDate((capture as any).return_date || "");
                  setReturnNotes((capture as any).return_notes || "");
                  setShowReturnForm(true);
                }}>
                  {(capture as any).return_date ? "Alterar Retorno" : "Agendar Retorno"}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)}
                    min={format(new Date(), "yyyy-MM-dd")} />
                  <Input placeholder="Observação do retorno..." value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={async () => {
                      if (!returnDate) { toast({ title: "Selecione uma data", variant: "destructive" }); return; }
                      await scheduleReturn.mutateAsync({ id: capture.id, return_date: returnDate, return_notes: returnNotes });
                      toast({ title: "✅ Retorno agendado!" });
                      setShowReturnForm(false);
                    }} disabled={scheduleReturn.isPending}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowReturnForm(false)}>Cancelar</Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="media" className="mt-3">
            {capture.attachments && capture.attachments.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {capture.attachments.map((att) => (
                  <div key={att.id} className="border rounded overflow-hidden relative group">
                    {att.file_type === "photo" ? (
                      <>
                        <a href={att.file_url} target="_blank" rel="noopener"><img src={att.file_url} alt={att.file_name} className="w-full h-32 object-cover" /></a>
                        <a href={att.file_url} download={att.file_name || "foto.jpg"} target="_blank" rel="noopener"
                          className="absolute bottom-1 right-1 bg-background/80 backdrop-blur rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow">
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </>
                    ) : att.file_type === "audio" ? (
                      <div className="p-2">
                        <audio controls src={att.file_url} className="w-full" />
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs truncate flex-1">{att.file_name}</p>
                          <a href={att.file_url} download={att.file_name} target="_blank" rel="noopener" className="ml-1">
                            <Download className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <a href={att.file_url} target="_blank" rel="noopener" className="p-3 flex items-center gap-2 text-sm"><FileText className="h-4 w-4" /> {att.file_name}</a>
                    )}
                  </div>
                ))}
              </div>
            ) : <p className="text-center text-muted-foreground py-8">Nenhuma mídia anexada</p>}
          </TabsContent>
          <TabsContent value="visits" className="mt-3 space-y-3">
            <Button size="sm" onClick={() => setShowVisitForm(!showVisitForm)}><Plus className="h-4 w-4 mr-1" /> Nova Visita</Button>
            {showVisitForm && (
              <Card className="p-3 space-y-2">
                <Select value={visitForm.construction_stage} onValueChange={(v) => setVisitForm({ ...visitForm, construction_stage: v })}>
                  <SelectTrigger><SelectValue placeholder="Etapa atual da obra" /></SelectTrigger>
                  <SelectContent>{CONSTRUCTION_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Textarea placeholder="Observações da visita..." value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} rows={2} />
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => visitFileRef.current?.click()} disabled={isUploading}><Camera className="h-3 w-3 mr-1" /> Fotos</Button>
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

// ─── Map Component ───
function CaptadorMap({ points, onSelect }: { points: any[]; onSelect: (id: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;
    import("leaflet").then((L) => {
      const map = L.map(mapRef.current!, { center: [-15.78, -47.93], zoom: 5 });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map);
      mapInstanceRef.current = map;

      const bounds: [number, number][] = [];

      // Show user's current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userPos: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            const userIcon = L.divIcon({
              className: "custom-marker",
              html: `<div style="background:#6366f1;width:20px;height:20px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(99,102,241,0.3),0 2px 6px rgba(0,0,0,0.3);"></div>`,
              iconSize: [20, 20], iconAnchor: [10, 10],
            });
            L.marker(userPos, { icon: userIcon }).addTo(map)
              .bindPopup("<strong>📍 Você está aqui</strong>");
            bounds.push(userPos);
            if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
          },
          () => {},
          { enableHighAccuracy: true }
        );
      }

      // Capture points
      if (points.length > 0) {
        points.forEach((p: any) => {
          if (!p.latitude || !p.longitude) return;
          const pos: [number, number] = [parseFloat(p.latitude), parseFloat(p.longitude)];
          bounds.push(pos);
          const icon = L.divIcon({
            className: "custom-marker",
            html: `<div style="background:${p.status === 'converted' ? '#22c55e' : p.status === 'in_progress' ? '#eab308' : '#3b82f6'};width:24px;height:24px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold">${p.visit_count || 0}</div>`,
            iconSize: [24, 24], iconAnchor: [12, 12],
          });
          const marker = L.marker(pos, { icon }).addTo(map);
          const routeUrl = `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
          marker.bindPopup(`
            <div style="min-width:220px">
              <strong>${p.company_name || 'Obra'}</strong><br/>
              <small>${p.address || ''}</small><br/>
              <small>Etapa: ${p.construction_stage || '—'}</small><br/>
              <small>Visitas: ${p.visit_count || 0}</small>
              <div style="margin-top:8px">
                <a href="${routeUrl}" target="_blank" rel="noopener"
                  style="display:inline-flex;align-items:center;gap:4px;background:#4285f4;color:white;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:500;">
                  🗺️ Rotas no Google Maps
                </a>
              </div>
            </div>
          `);
          marker.on("click", () => onSelect(p.id));
        });
        if (bounds.length > 0) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    });
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [points, onSelect]);

  return <div ref={mapRef} className="w-full h-[400px] md:h-[500px] rounded-lg border" />;
}

// ─── Main Page ───
export default function Captador() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("returns");
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ status?: string; assigned_to?: string; unassigned?: boolean }>({});

  const { checkedIn, checkinTime, doCheckin, doCheckout } = useCheckin();
  const createCaptureForSync = useCreateFieldCapture();

  const { data: captures = [], refetch } = useFieldCaptures(filters);
  const { data: stats } = useFieldCaptureStats();
  const { data: mapPoints = [] } = useFieldCaptureMapPoints(filters);
  const { data: sellers = [] } = useCaptadorSellers();
  const { data: settings } = useCaptadorSettings();
  const { data: todayReturns = [] } = useTodayReturns();
  const updateSettings = useUpdateCaptadorSettings();
  const updateCapture = useUpdateFieldCapture();
  const deleteCapture = useDeleteFieldCapture();

  const { isOnline, pendingCount, refreshCount } = useOfflineSync(createCaptureForSync, () => refetch());

  const todayCaptures = captures.filter((c) => {
    const today = new Date();
    const cDate = new Date(c.created_at);
    return cDate.toDateString() === today.toDateString();
  });

  const handleCheckin = async () => {
    try {
      await doCheckin();
      toast({ title: "✅ Check-in realizado!" });
    } catch {
      toast({ title: "Erro ao fazer check-in", description: "Ative o GPS", variant: "destructive" });
    }
  };

  const handleCheckout = () => {
    doCheckout();
    toast({ title: "Check-out realizado!" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta ficha?")) return;
    await deleteCapture.mutateAsync(id);
    toast({ title: "Ficha excluída" });
  };

  const handleAssign = async (captureId: string, sellerId: string) => {
    await updateCapture.mutateAsync({ id: captureId, assigned_to: sellerId || null });
    toast({ title: sellerId ? "Vendedor atribuído!" : "Atribuição removida" });
  };

  // ─── Mobile Layout ───
  if (isMobile) {
    return (
      <MainLayout>
        <div className="flex flex-col h-[calc(100vh-4rem)]">
          {/* Mobile Header */}
          <div className="p-4 bg-card border-b space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-bold flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" /> Captador
                {!isOnline && (
                  <Badge variant="destructive" className="text-[10px] flex items-center gap-1">
                    <WifiOff className="h-3 w-3" /> Offline
                  </Badge>
                )}
                {isOnline && pendingCount > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    Sincronizando {pendingCount}...
                  </Badge>
                )}
              </h1>
              <Button variant="ghost" size="icon" onClick={() => setShowSettings(!showSettings)}>
                <Settings className="h-5 w-5" />
              </Button>
            </div>

            {/* Check-in/Checkout Bar */}
            <div className={`rounded-xl p-3 flex items-center justify-between ${checkedIn ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted'}`}>
              <div className="flex items-center gap-2">
                {checkedIn ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">{checkedIn ? "Em serviço" : "Fora de serviço"}</p>
                  {checkinTime && <p className="text-xs text-muted-foreground">Desde {format(checkinTime, "HH:mm")}</p>}
                </div>
              </div>
              <Button size="sm" variant={checkedIn ? "destructive" : "default"} onClick={checkedIn ? handleCheckout : handleCheckin}
                className="h-9 px-4">
                {checkedIn ? <><LogOut className="h-4 w-4 mr-1" /> Checkout</> : <><LogIn className="h-4 w-4 mr-1" /> Check-in</>}
              </Button>
            </div>

            {/* Quick Stats */}
            {stats && (
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold">{todayCaptures.length}</div>
                  <div className="text-[10px] text-muted-foreground">Hoje</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold text-primary">{stats.new_count}</div>
                  <div className="text-[10px] text-muted-foreground">Novas</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold">{stats.in_progress_count}</div>
                  <div className="text-[10px] text-muted-foreground">Andamento</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-muted/50">
                  <div className="text-lg font-bold text-green-500">{stats.converted_count}</div>
                  <div className="text-[10px] text-muted-foreground">Convertidos</div>
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-2">
              <TabsTrigger value="returns" className="flex-1 relative">
                <Clock className="h-4 w-4 mr-1" /> Retornos
                {todayReturns.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
                    {todayReturns.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="list" className="flex-1"><ClipboardList className="h-4 w-4 mr-1" /> Fichas</TabsTrigger>
              <TabsTrigger value="map" className="flex-1"><MapPin className="h-4 w-4 mr-1" /> Mapa</TabsTrigger>
            </TabsList>

            <TabsContent value="returns" className="flex-1 overflow-y-auto px-4 pb-24">
              <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Retornos de Hoje ({todayReturns.length})
              </h3>
              {todayReturns.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum retorno agendado para hoje</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayReturns.map((c) => (
                    <div key={c.id} className="bg-card rounded-xl border border-amber-500/30 p-3 active:bg-muted/50 transition-colors"
                      onClick={() => setSelectedId(c.id)}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Clock className="h-5 w-5 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm truncate block">{c.company_name || c.address || "Obra"}</span>
                          {c.address && <p className="text-xs text-muted-foreground truncate">{c.address}</p>}
                          {c.construction_stage && <Badge variant="outline" className="text-[10px] mt-1">{c.construction_stage}</Badge>}
                          {c.return_notes && <p className="text-xs text-primary/70 mt-1">{c.return_notes}</p>}
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="list" className="flex-1 overflow-y-auto px-4 pb-24">
              {/* Today's captures */}
              {todayCaptures.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Hoje ({todayCaptures.length})
                  </h3>
                  <div className="space-y-2">
                    {todayCaptures.map((c) => (
                      <MobileCaptureCard key={c.id} capture={c} onSelect={setSelectedId} onDelete={handleDelete}
                        sellers={sellers} onAssign={handleAssign} />
                    ))}
                  </div>
                </div>
              )}

              {/* All captures */}
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                Todas ({captures.length})
              </h3>
              <div className="space-y-2">
                {captures.map((c) => (
                  <MobileCaptureCard key={c.id} capture={c} onSelect={setSelectedId} onDelete={handleDelete}
                    sellers={sellers} onAssign={handleAssign} />
                ))}
                {captures.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <MapPin className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>Nenhuma ficha encontrada</p>
                    <p className="text-xs mt-1">Toque em + para criar</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="map" className="flex-1 px-4 pb-4">
              <CaptadorMap points={mapPoints} onSelect={setSelectedId} />
            </TabsContent>
          </Tabs>

          {/* FAB - New Capture */}
          <button onClick={() => setShowForm(true)}
            className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform">
            <Plus className="h-6 w-6" />
          </button>

          <MobileCaptureForm open={showForm} onClose={() => { setShowForm(false); refreshCount(); }} onSuccess={() => { refetch(); refreshCount(); }} isOnline={isOnline} />
          <CaptureDetailDialog captureId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />

          {/* Settings Panel */}
          {showSettings && settings && (
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogContent aria-describedby={undefined}>
                <DialogHeader><DialogTitle>Configurações</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={settings.auto_distribute}
                      onChange={(e) => updateSettings.mutate({ ...settings, auto_distribute: e.target.checked })} className="rounded" />
                    Distribuição automática
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={settings.auto_create_task}
                      onChange={(e) => updateSettings.mutate({ ...settings, auto_create_task: e.target.checked })} className="rounded" />
                    Criar tarefa automaticamente
                  </label>
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={settings.notify_whatsapp}
                      onChange={(e) => updateSettings.mutate({ ...settings, notify_whatsapp: e.target.checked })} className="rounded" />
                    Notificar via WhatsApp
                  </label>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </MainLayout>
    );
  }

  // ─── Desktop Layout ───
  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MapPin className="h-6 w-6" /> Captador
          </h1>
          <div className="flex gap-2">
            {/* Check-in/Checkout */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${checkedIn ? 'bg-green-500/10 border border-green-500/30' : 'bg-muted'}`}>
              {checkedIn ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span>{checkedIn ? `Em serviço desde ${checkinTime ? format(checkinTime, "HH:mm") : ""}` : "Fora de serviço"}</span>
              <Button size="sm" variant={checkedIn ? "destructive" : "default"} onClick={checkedIn ? handleCheckout : handleCheckin} className="h-7 text-xs">
                {checkedIn ? "Checkout" : "Check-in"}
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}>
              <Settings className="h-4 w-4" />
            </Button>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Nova Ficha
            </Button>
          </div>
        </div>

        {showSettings && settings && (
          <Card className="p-4 space-y-3">
            <h3 className="font-medium flex items-center gap-2"><Settings className="h-4 w-4" /> Configurações do Captador</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.auto_distribute}
                  onChange={(e) => updateSettings.mutate({ ...settings, auto_distribute: e.target.checked })} className="rounded" />
                Distribuição automática (round-robin)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.auto_create_task}
                  onChange={(e) => updateSettings.mutate({ ...settings, auto_create_task: e.target.checked })} className="rounded" />
                Criar tarefa automaticamente
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={settings.notify_whatsapp}
                  onChange={(e) => updateSettings.mutate({ ...settings, notify_whatsapp: e.target.checked })} className="rounded" />
                Notificar via WhatsApp
              </label>
            </div>
          </Card>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="p-3 text-center"><div className="text-2xl font-bold">{stats.total_captures}</div><div className="text-xs text-muted-foreground">Total Fichas</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-primary">{stats.new_count}</div><div className="text-xs text-muted-foreground">Novas</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold">{stats.in_progress_count}</div><div className="text-xs text-muted-foreground">Em Andamento</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-primary">{stats.converted_count}</div><div className="text-xs text-muted-foreground">Convertidos</div></Card>
            <Card className="p-3 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => setFilters({ ...filters, unassigned: !filters.unassigned, assigned_to: undefined })}>
              <div className="text-2xl font-bold text-destructive">{stats.unassigned_count || 0}</div><div className="text-xs text-muted-foreground">Sem Vendedor</div>
            </Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold">{stats.total_visits}</div><div className="text-xs text-muted-foreground">Total Visitas</div></Card>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? undefined : v })}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.assigned_to || "all"} onValueChange={(v) => setFilters({ ...filters, assigned_to: v === "all" ? undefined : v, unassigned: false })}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Vendedores</SelectItem>
              {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {filters.unassigned && (
            <Badge variant="secondary" className="cursor-pointer" onClick={() => setFilters({ ...filters, unassigned: false })}>
              Sem vendedor ✕
            </Badge>
          )}
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
                      {c.company_name && <div className="font-medium flex items-center gap-1 text-sm"><Building2 className="h-3 w-3" /> {c.company_name}</div>}
                      {c.address && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" /> {c.address}</div>}
                      {c.construction_stage && <Badge variant="outline" className="text-xs">{c.construction_stage}</Badge>}
                      {c.contact_name && (
                        <div className="text-xs flex items-center gap-1">
                          <User className="h-3 w-3" /> {c.contact_name}
                          {c.contact_phone && <span>• <Phone className="h-3 w-3 inline" /> {c.contact_phone}</span>}
                        </div>
                      )}
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <UserPlus className="h-3 w-3 text-muted-foreground" />
                        <Select value={c.assigned_to || "none"} onValueChange={(v) => handleAssign(c.id, v === "none" ? "" : v)}>
                          <SelectTrigger className="h-6 text-xs w-36 border-dashed"><SelectValue placeholder="Atribuir vendedor" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sem vendedor</SelectItem>
                            {sellers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{c.created_by_name}</span>
                        <div className="flex items-center gap-2">
                          {c.attachments && c.attachments.length > 0 && <span className="flex items-center gap-0.5"><Image className="h-3 w-3" /> {c.attachments.length}</span>}
                          {c.visit_count > 0 && <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {c.visit_count}</span>}
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(c.id); }}><Trash2 className="h-3 w-3 text-destructive" /></button>
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

        <DesktopCaptureFormDialog open={showForm} onClose={() => setShowForm(false)} onSuccess={() => refetch()} />
        <CaptureDetailDialog captureId={selectedId} open={!!selectedId} onClose={() => setSelectedId(null)} />
      </div>
    </MainLayout>
  );
}

// ─── Mobile Capture Card ───
function MobileCaptureCard({ capture, onSelect, onDelete, sellers, onAssign }: {
  capture: FieldCapture; onSelect: (id: string) => void; onDelete: (id: string) => void;
  sellers: { id: string; name: string }[]; onAssign: (captureId: string, sellerId: string) => void;
}) {
  const st = STATUS_MAP[capture.status] || STATUS_MAP.new;
  return (
    <div className="bg-card rounded-xl border p-3 active:bg-muted/50 transition-colors" onClick={() => onSelect(capture.id)}>
      <div className="flex items-start gap-3">
        {/* Thumbnail or icon */}
        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {capture.attachments && capture.attachments.length > 0 && capture.attachments[0].file_type === "photo" ? (
            <img src={capture.attachments[0].file_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="font-medium text-sm truncate">{capture.company_name || capture.address || "Obra sem nome"}</span>
            <Badge className={`${st.color} text-[10px] px-1.5 py-0`}>{st.label}</Badge>
          </div>
          {capture.construction_stage && <p className="text-xs text-muted-foreground">{capture.construction_stage}</p>}
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <span>{format(new Date(capture.created_at), "dd/MM HH:mm")}</span>
            {capture.visit_count > 0 && <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" /> {capture.visit_count}</span>}
            {capture.attachments && capture.attachments.length > 0 && <span className="flex items-center gap-0.5"><Image className="h-3 w-3" /> {capture.attachments.length}</span>}
          </div>
          {capture.assigned_to_name && (
            <div className="flex items-center gap-1 mt-1 text-xs"><UserPlus className="h-3 w-3" /> {capture.assigned_to_name}</div>
          )}
        </div>

        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </div>
  );
}
