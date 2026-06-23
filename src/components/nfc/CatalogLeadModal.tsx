import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, FileText, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface Material {
  id: string;
  title: string;
  description?: string;
  file_url: string;
  material_type?: string;
  category?: string | null;
}

interface BrandingTheme {
  nfc_primary_color?: string | null;
  nfc_accent_color?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  apiBase: string;
  ctaTitle?: string;
  materials?: Material[];
  branding?: BrandingTheme;
  initialCategory?: string;
}

export function CatalogLeadModal({
  open,
  onOpenChange,
  slug,
  apiBase,
  ctaTitle,
  materials: propMaterials,
  branding,
  initialCategory,
}: Props) {
  const [step, setStep] = useState<"form" | "materials">("form");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", whatsapp: "", company: "" });
  const [fetchedMaterials, setFetchedMaterials] = useState<Material[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || "__all");

  useEffect(() => {
    if (open && initialCategory) {
      setSelectedCategory(initialCategory);
    }
  }, [open, initialCategory]);

  const primary = branding?.nfc_primary_color || "#3b82f6";

  const materials = useMemo(() => {
    return fetchedMaterials.length > 0 ? fetchedMaterials : (propMaterials || []);
  }, [fetchedMaterials, propMaterials]);

  const materialsByCategory = useMemo(() => {
    const map: Record<string, Material[]> = {};
    materials.forEach((m) => {
      const k = m.category || "Geral";
      (map[k] ||= []).push(m);
    });
    return map;
  }, [materials]);

  const categoryNames = useMemo(() => Object.keys(materialsByCategory), [materialsByCategory]);

  function reset() {
    setStep("form");
    setForm({ name: "", whatsapp: "", company: "" });
    setFetchedMaterials([]);
    setSelectedCategory("__all");
  }

  function handleOpenChange(v: boolean) {
    if (!v) reset();
    onOpenChange(v);
  }

  function formatWpp(value: string) {
    const d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  async function submit() {
    if (!form.name.trim()) return toast.error("Informe seu nome");
    const digits = form.whatsapp.replace(/\D/g, "");
    if (digits.length < 10) return toast.error("WhatsApp inválido");

    setLoading(true);
    try {
      const v = await fetch(`${apiBase}/api/nfc/public/${slug}/verify-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: digits }),
      });
      const vData = await v.json();
      if (!v.ok || !vData.valid) {
        throw new Error(vData.error || "Esse número não está no WhatsApp");
      }

      const r = await fetch(`${apiBase}/api/nfc/public/${slug}/catalog-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, whatsapp: digits, company: form.company }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro");

      setFetchedMaterials(data.materials || []);
      setStep("materials");
      toast.success("Acesso liberado!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  const visibleMaterials = useMemo(() => {
    if (selectedCategory === "__all") return materialsByCategory;
    const filtered: Record<string, Material[]> = {};
    if (materialsByCategory[selectedCategory]) {
      filtered[selectedCategory] = materialsByCategory[selectedCategory];
    }
    return filtered;
  }, [materialsByCategory, selectedCategory]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {ctaTitle || "Catálogos e materiais"}
              </DialogTitle>
              <DialogDescription>
                Preencha seus dados. Verificaremos o seu WhatsApp e liberaremos o acesso aos catálogos e materiais.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <div>
                <Label>Nome completo*</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Seu nome"
                />
              </div>
              <div>
                <Label>WhatsApp*</Label>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: formatWpp(e.target.value) })}
                  placeholder="(11) 98765-4321"
                  inputMode="numeric"
                />
              </div>
              <div>
                <Label>Empresa (opcional)</Label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Sua empresa"
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Validamos seu número junto ao WhatsApp para liberar o material.
              </p>
              <Button onClick={submit} disabled={loading} className="w-full" style={{ background: primary }}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Verificar e liberar
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" /> Acesso liberado
              </DialogTitle>
              <DialogDescription>
                Clique no material que deseja baixar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 pt-2">
              {categoryNames.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    onClick={() => setSelectedCategory("__all")}
                    className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border transition ${
                      selectedCategory === "__all"
                        ? "bg-white text-black border-white"
                        : "text-white/70 border-white/20 hover:bg-white/10"
                    }`}
                  >
                    Todos
                  </button>
                  {categoryNames.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-full whitespace-nowrap border transition ${
                        selectedCategory === cat
                          ? "bg-white text-black border-white"
                          : "text-white/70 border-white/20 hover:bg-white/10"
                      }`}
                    >
                      {cat} <span className="opacity-60">({materialsByCategory[cat].length})</span>
                    </button>
                  ))}
                </div>
              )}

              {Object.keys(visibleMaterials).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum material disponível ainda.
                </p>
              )}

              {Object.entries(visibleMaterials).map(([cat, list]) => (
                <div key={cat}>
                  {categoryNames.length > 1 && (
                    <h4 className="text-white/80 text-xs font-semibold tracking-widest uppercase mb-2">{cat}</h4>
                  )}
                  <div className="grid grid-cols-1 gap-2">
                    {list.map((m) => (
                      <a
                        key={m.id}
                        href={m.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block border border-white/10 rounded-xl p-3 hover:bg-white/10 transition"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="rounded-lg p-2 text-white"
                            style={{ background: `${primary}22` }}
                          >
                            <FileText className="h-5 w-5" style={{ color: primary }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white truncate">{m.title}</div>
                            {m.description && (
                              <div className="text-xs text-white/60 truncate">{m.description}</div>
                            )}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
