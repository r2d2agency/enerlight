import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, Trash2, FileText, Plus, Save, Edit, Folder, Globe } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useUpload } from "@/hooks/use-upload";

export interface MaterialRow {
  id: string;
  organization_id: string;
  card_id: string | null;
  title: string;
  description: string | null;
  material_type: string;
  file_url: string;
  thumbnail_url: string | null;
  requires_lead: boolean;
  category: string | null;
  position: number;
}

interface Props {
  cardId: string;
}

export function NfcMaterialsTab({ cardId }: Props) {
  const [items, setItems] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialRow | null>(null);
  const [filter, setFilter] = useState<string>("__all");

  async function load() {
    setLoading(true);
    try {
      const data = await api<MaterialRow[]>(`/api/nfc/materials?card_id=${cardId}`);
      setItems(data);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar materiais");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (cardId) load(); /* eslint-disable-next-line */ }, [cardId]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((m) => { if (m.category) set.add(m.category); });
    return Array.from(set).sort();
  }, [items]);

  const grouped = useMemo(() => {
    const filtered = filter === "__all" ? items : items.filter((m) => (m.category || "Sem categoria") === filter);
    const map: Record<string, MaterialRow[]> = {};
    filtered.forEach((m) => {
      const k = m.category || "Sem categoria";
      (map[k] ||= []).push(m);
    });
    return map;
  }, [items, filter]);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este material?")) return;
    await api(`/api/nfc/materials/${id}`, { method: "DELETE" });
    toast.success("Removido");
    load();
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={filter === "__all" ? "default" : "outline"}
            onClick={() => setFilter("__all")}
          >Todas</Button>
          {categories.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={filter === c ? "default" : "outline"}
              onClick={() => setFilter(c)}
            >
              <Folder className="h-3 w-3 mr-1" /> {c}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo material
        </Button>
      </div>

      {showForm && (
        <MaterialForm
          cardId={cardId}
          initial={editing}
          existingCategories={categories}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground border rounded-lg p-8 text-center">
          Nenhum material cadastrado. Use <b>Novo material</b> para subir um PDF e organizar por categoria.
        </div>
      ) : (
        Object.entries(grouped).map(([cat, list]) => (
          <div key={cat} className="border rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground">
              <Folder className="h-4 w-4" /> {cat}
              <Badge variant="secondary">{list.length}</Badge>
            </div>
            <div className="space-y-2">
              {list.map((m) => (
                <div key={m.id} className="flex items-center gap-3 bg-muted/40 rounded-md p-2">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.description || m.file_url}</div>
                  </div>
                  {m.card_id === null && (
                    <Badge variant="outline" className="text-[10px]"><Globe className="h-3 w-3 mr-1" />Global</Badge>
                  )}
                  {m.requires_lead && <Badge variant="secondary" className="text-[10px]">Lead</Badge>}
                  <Button size="icon" variant="ghost" onClick={() => window.open(m.file_url, "_blank")}>
                    <Upload className="h-4 w-4 rotate-180" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(m); setShowForm(true); }}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleDelete(m.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MaterialForm({
  cardId,
  initial,
  existingCategories,
  onCancel,
  onSaved,
}: {
  cardId: string;
  initial: MaterialRow | null;
  existingCategories: string[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [fileUrl, setFileUrl] = useState(initial?.file_url || "");
  const [requiresLead, setRequiresLead] = useState(initial?.requires_lead ?? true);
  const [isGlobal, setIsGlobal] = useState(initial ? initial.card_id === null : false);
  const [saving, setSaving] = useState(false);
  const { uploadFile, isUploading, progress } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File) {
    try {
      const url = await uploadFile(f);
      if (url) {
        setFileUrl(url);
        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
        toast.success("Arquivo enviado");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro no upload");
    }
  }

  async function handleSave() {
    if (!title) return toast.error("Informe o título");
    if (!fileUrl) return toast.error("Envie o arquivo (PDF, imagem, etc.)");
    setSaving(true);
    try {
      const body = {
        title,
        description: description || null,
        category: category || null,
        file_url: fileUrl,
        material_type: guessType(fileUrl),
        requires_lead: requiresLead,
        card_id: isGlobal ? null : cardId,
      };
      if (initial) {
        await api(`/api/nfc/materials/${initial.id}`, { method: "PATCH", body });
        toast.success("Material atualizado");
      } else {
        await api(`/api/nfc/materials`, { method: "POST", body });
        toast.success("Material criado");
      }
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label>Arquivo</Label>
          <div className="flex items-center gap-2 mt-1">
            <Input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://... ou faça upload" />
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="ml-1">{isUploading ? `${progress}%` : "Upload"}</span>
            </Button>
          </div>
        </div>
        <div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Catálogo LED 2025" /></div>
        <div>
          <Label>Categoria</Label>
          <Input
            list="nfc-mat-categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Catálogos, Datasheets, Apresentações..."
          />
          <datalist id="nfc-mat-categories">
            {existingCategories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div className="col-span-2">
          <Label>Descrição</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Breve descrição do conteúdo" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={requiresLead} onCheckedChange={setRequiresLead} />
          Exigir cadastro (lead) antes de baixar
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isGlobal} onCheckedChange={setIsGlobal} />
          Disponibilizar em todos os cartões (global)
        </label>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {initial ? "Atualizar" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function guessType(url: string): string {
  const u = url.toLowerCase();
  if (u.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(u)) return "image";
  if (/\.(mp4|mov|webm)$/.test(u)) return "video";
  if (/\.(doc|docx)$/.test(u)) return "doc";
  if (/\.(xls|xlsx)$/.test(u)) return "sheet";
  if (/\.(ppt|pptx)$/.test(u)) return "slides";
  return "file";
}
