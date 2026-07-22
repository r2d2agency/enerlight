import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, Plus, Check, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export interface Supplier {
  id: string;
  name: string;
  document?: string | null;
  contact_name?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

interface Props {
  currentName?: string;
  onSelect: (s: Partial<Supplier>) => void;
}

export function SupplierSearchField({ currentName, onSelect }: Props) {
  const qc = useQueryClient();
  const [term, setTerm] = useState(currentName || "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Supplier[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [saving, setSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setTerm(currentName || ""); }, [currentName]);

  useEffect(() => {
    if (!term || term.trim().length < 1) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res: any = await api(`/api/devolucoes/suppliers?search=${encodeURIComponent(term)}`);
        setResults(Array.isArray(res) ? res : []);
        setOpen(true);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (s: Supplier) => {
    setSelected(s.id);
    setTerm(s.name);
    setOpen(false);
    onSelect({
      name: s.name,
      document: s.document || "",
      contact_name: s.contact_name || "",
      whatsapp: s.whatsapp || "",
      email: s.email || "",
      address: s.address || "",
    });
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: term.trim() });
    setDialogOpen(true);
  };
  const openEdit = () => {
    const existing = results.find(r => r.id === selected);
    if (!existing) return;
    setEditing(existing);
    setForm({ ...existing });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name?.trim()) { toast.error("Informe o nome"); return; }
    setSaving(true);
    try {
      let s: Supplier;
      if (editing) {
        s = await api(`/api/devolucoes/suppliers/${editing.id}`, { method: "PUT", body: form });
        toast.success("Fornecedor atualizado");
      } else {
        s = await api(`/api/devolucoes/suppliers`, { method: "POST", body: form });
        toast.success("Fornecedor cadastrado");
      }
      qc.invalidateQueries({ queryKey: ["devolucao-suppliers"] });
      pick(s);
      setDialogOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar fornecedor");
    } finally { setSaving(false); }
  };

  return (
    <div className="md:col-span-2 relative" ref={containerRef}>
      <div className="flex items-center justify-between">
        <Label>Fornecedor *</Label>
        {selected && (
          <button type="button" onClick={openEdit} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Pencil className="h-3 w-3" /> editar
          </button>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8 pr-8"
          placeholder="Buscar fornecedor cadastrado..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setSelected(null);
            onSelect({ name: e.target.value });
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        {selected && !loading && <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
          {results.length > 0 ? (
            <>
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
                  onClick={() => pick(s)}
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.document ? `CNPJ: ${s.document}` : "Sem CNPJ"}
                    {s.contact_name ? ` · ${s.contact_name}` : ""}
                  </div>
                </button>
              ))}
              <div className="p-2 border-t bg-muted/40">
                <Button type="button" size="sm" variant="outline" onClick={openCreate} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar novo fornecedor
                </Button>
              </div>
            </>
          ) : (
            !loading && (
              <div className="p-3 text-sm">
                <p className="text-muted-foreground mb-2">Nenhum fornecedor encontrado.</p>
                <Button type="button" size="sm" onClick={openCreate} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar {term.trim() ? `"${term.trim()}"` : "fornecedor"}
                </Button>
              </div>
            )
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Label>Nome *</Label><Input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><Label>CNPJ</Label><Input value={form.document || ''} onChange={e => setForm(f => ({ ...f, document: e.target.value }))} /></div>
            <div><Label>Contato</Label><Input value={form.contact_name || ''} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} /></div>
            <div><Label>WhatsApp</Label><Input value={form.whatsapp || ''} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} /></div>
            <div><Label>E-mail</Label><Input value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="md:col-span-2"><Label>Endereço</Label><Input value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="md:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
