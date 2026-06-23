import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Palette } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ImageDropUpload } from "./ImageDropUpload";
import { NfcCategoriesManager } from "./NfcCategoriesManager";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type Branding = {
  nfc_default_logo: string | null;
  nfc_primary_color: string | null;
  nfc_accent_color: string | null;
  nfc_bg_color: string | null;
  nfc_bg_gradient: string | null;
  nfc_brand_name: string | null;
  nfc_footer_text: string | null;
};

const DEFAULTS: Branding = {
  nfc_default_logo: null,
  nfc_primary_color: "#3b82f6",
  nfc_accent_color: "#fbbf24",
  nfc_bg_color: "#020617",
  nfc_bg_gradient: null,
  nfc_brand_name: null,
  nfc_footer_text: "Powered by Ener ID",
};

export function NfcBrandingDialog({ open, onOpenChange }: Props) {
  const [state, setState] = useState<Branding>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api<Branding>("/api/nfc/branding")
      .then((b) => setState({ ...DEFAULTS, ...b }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  function set<K extends keyof Branding>(k: K, v: Branding[K]) {
    setState((s) => ({ ...s, [k]: v }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api("/api/nfc/branding", { method: "PUT", body: state });
      toast.success("Branding dos cartões NFC salvo");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" /> Branding visual dos cartões NFC
          </DialogTitle>
          <DialogDescription>
            Personalize logo, cores e textos exibidos em todos os cartões NFC públicos da organização.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <Label>Logo padrão (aparece abaixo do nome do vendedor)</Label>
              <ImageDropUpload
                value={state.nfc_default_logo || ""}
                onChange={(v) => set("nfc_default_logo", v || null)}
                aspect="wide"
                enablePaste={false}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Recomendado: PNG transparente, ~400×120px. Pode ser sobrescrito por cartão.
              </p>
            </div>

            <div>
              <Label>Nome da marca (opcional)</Label>
              <Input
                value={state.nfc_brand_name || ""}
                onChange={(e) => set("nfc_brand_name", e.target.value)}
                placeholder="Enerlight"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <ColorField label="Cor primária" value={state.nfc_primary_color} onChange={(v) => set("nfc_primary_color", v)} />
              <ColorField label="Cor de destaque" value={state.nfc_accent_color} onChange={(v) => set("nfc_accent_color", v)} />
              <ColorField label="Fundo" value={state.nfc_bg_color} onChange={(v) => set("nfc_bg_color", v)} />
            </div>

            <div>
              <Label>Gradiente de fundo (CSS opcional)</Label>
              <Input
                value={state.nfc_bg_gradient || ""}
                onChange={(e) => set("nfc_bg_gradient", e.target.value)}
                placeholder="radial-gradient(1200px 600px at 20% -10%, #0b1a3a 0%, transparent 60%), #020617"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Se preenchido, sobrescreve a cor de fundo.
              </p>
            </div>

            <div>
              <Label>Texto do rodapé</Label>
              <Input
                value={state.nfc_footer_text || ""}
                onChange={(e) => set("nfc_footer_text", e.target.value)}
                placeholder="Powered by Ener ID"
              />
            </div>

            <div className="border-t pt-5">
              <NfcCategoriesManager />
              <p className="text-xs text-muted-foreground mt-2">
                As categorias aparecem como cards visuais no cartão público. Cada vendedor escolhe (na aba <b>Perfil</b>) quais categorias devem aparecer no seu cartão.
              </p>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar branding
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string | null; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border bg-background cursor-pointer"
        />
        <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#000000" />
      </div>
    </div>
  );
}
