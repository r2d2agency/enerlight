import { useState } from "react";
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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  apiBase: string;
  ctaTitle?: string;
}

export function CatalogLeadModal({ open, onOpenChange, slug, apiBase, ctaTitle }: Props) {
  const [step, setStep] = useState<"form" | "materials">("form");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", whatsapp: "", company: "" });
  const [materials, setMaterials] = useState<Material[]>([]);

  function reset() {
    setStep("form");
    setForm({ name: "", whatsapp: "", company: "" });
    setMaterials([]);
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
      // Step 1: validate WhatsApp
      const v = await fetch(`${apiBase}/api/nfc/public/${slug}/verify-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp: digits }),
      });
      const vData = await v.json();
      if (!v.ok || !vData.valid) {
        throw new Error(vData.error || "Esse número não está no WhatsApp");
      }

      // Step 2: register lead + fetch materials
      const r = await fetch(`${apiBase}/api/nfc/public/${slug}/catalog-lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, whatsapp: digits, company: form.company }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erro");

      setMaterials(data.materials || []);
      setStep("materials");
      toast.success("Acesso liberado!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {ctaTitle || "Baixe nossos catálogos"}
              </DialogTitle>
              <DialogDescription>
                Preencha seus dados. Verificaremos o seu WhatsApp e liberaremos o acesso.
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
                />
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Validamos seu número junto ao WhatsApp para liberar o material.
              </p>
              <Button onClick={submit} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Verificar e Liberar
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="h-5 w-5" /> Acesso Liberado
              </DialogTitle>
              <DialogDescription>
                Clique no material que deseja baixar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 pt-2 max-h-[60vh] overflow-y-auto">
              {materials.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Nenhum material disponível ainda.
                </p>
              )}
              {materials.map((m) => (
                <a
                  key={m.id}
                  href={m.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border rounded-lg p-3 hover:bg-muted/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.title}</div>
                      {m.description && (
                        <div className="text-xs text-muted-foreground truncate">{m.description}</div>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
