import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Save, Layers } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ImageDropUpload } from "./ImageDropUpload";

export interface NfcCategory {
  id: string;
  name: string;
  image_url: string | null;
  position: number;
}

export function useNfcCategories() {
  const [items, setItems] = useState<NfcCategory[]>([]);
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const r = await api<NfcCategory[]>("/api/nfc/categories");
      setItems(r);
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar categorias");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return { items, loading, reload: load };
}

export function NfcCategoriesManager() {
  const { items, loading, reload } = useNfcCategories();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<NfcCategory | null>(null);

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta categoria?")) return;
    await api(`/api/nfc/categories/${id}`, { method: "DELETE" });
    toast.success("Removida");
    reload();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Layers className="h-4 w-4" /> Categorias visuais
        </div>
        <Button size="sm" variant="outline" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>

      {showForm && (
        <CategoryForm
          initial={editing}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); reload(); }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4 border rounded-md">
          Nenhuma categoria cadastrada. Crie categorias (ex: Catálogos, Datasheets, Apresentações) para que cada vendedor possa selecionar quais aparecem no seu cartão.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {items.map((c) => (
            <div key={c.id} className="border rounded-lg overflow-hidden bg-muted/30 group relative">
              <div className="aspect-square bg-muted">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">sem imagem</div>
                )}
              </div>
              <div className="p-2 flex items-center justify-between gap-1">
                <span className="text-xs font-medium truncate flex-1">{c.name}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(c); setShowForm(true); }}>
                  <Save className="h-3 w-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryForm({ initial, onCancel, onSaved }: { initial: NfcCategory | null; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name || "");
  const [image, setImage] = useState(initial?.image_url || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return toast.error("Informe o nome");
    setSaving(true);
    try {
      if (initial) {
        await api(`/api/nfc/categories/${initial.id}`, { method: "PATCH", body: { name, image_url: image || null } });
      } else {
        await api(`/api/nfc/categories`, { method: "POST", body: { name, image_url: image || null } });
      }
      toast.success("Salva");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally { setSaving(false); }
  }

  return (
    <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
      <div>
        <Label>Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Catálogos, Datasheets..." />
      </div>
      <div>
        <Label>Imagem</Label>
        <ImageDropUpload value={image} onChange={setImage} aspect="square" enablePaste={false} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Salvar
        </Button>
      </div>
    </div>
  );
}
