import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
  materialId: string;
  materialTitle: string;
  apiBase: string;
}

export function LeadCaptureModal({ open, onOpenChange, slug, materialId, materialTitle, apiBase }: Props) {
  const [form, setForm] = useState({ name: "", whatsapp: "", company: "", role_title: "" });
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!form.name) return toast.error("Informe seu nome");
    setLoading(true);
    try {
      const url = new URL(window.location.href);
      const utm = {
        utm_source: url.searchParams.get("utm_source"),
        utm_medium: url.searchParams.get("utm_medium"),
        utm_campaign: url.searchParams.get("utm_campaign"),
      };
      const res = await fetch(`${apiBase}/api/nfc/public/${slug}/lead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, material_id: materialId, ...utm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.file_url) window.open(data.file_url, "_blank");
      toast.success("Material liberado!");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receber {materialTitle}</DialogTitle>
          <DialogDescription>Preencha os dados para liberar o download.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome*</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>WhatsApp</Label><Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} /></div>
          <div><Label>Empresa</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
          <div><Label>Cargo</Label><Input value={form.role_title} onChange={(e) => setForm({ ...form, role_title: e.target.value })} /></div>
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Receber Material
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
