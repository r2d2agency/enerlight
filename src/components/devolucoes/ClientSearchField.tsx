import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Search, UserPlus, Check } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface Company {
  id: string;
  name: string;
  cnpj?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

interface Props {
  onSelect: (c: {
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    address?: string;
  }) => void;
  currentName?: string;
}

export function ClientSearchField({ onSelect, currentName }: Props) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Company[]>([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!term || term.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res: any = await api(`/api/crm/companies?search=${encodeURIComponent(term)}&page=1&page_size=10`);
        const items = Array.isArray(res) ? res : res.items || [];
        setResults(items);
        setOpen(true);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const handlePick = (c: Company) => {
    setSelected(c.id);
    setTerm(c.name);
    setOpen(false);
    onSelect({
      name: c.name,
      document: c.cnpj || "",
      email: c.email || "",
      phone: c.phone || "",
      address: [c.address, c.city, c.state].filter(Boolean).join(", "),
    });
  };

  const handleCreate = async () => {
    if (!term.trim()) return;
    setCreating(true);
    try {
      const isDoc = /^[\d./-]+$/.test(term.trim()) && term.replace(/\D/g, "").length >= 11;
      const payload: any = isDoc
        ? { name: term.trim(), cnpj: term.trim() }
        : { name: term.trim() };
      const created: Company = await api(`/api/crm/companies`, { method: "POST", body: payload });
      toast.success("Cliente cadastrado");
      handlePick(created);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cadastrar cliente");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="md:col-span-2 relative" ref={containerRef}>
      <Label>Cliente *</Label>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por nome ou CNPJ..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setSelected(null);
            // also update name field so it's saved even without selection
            onSelect({ name: e.target.value });
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
        {selected && !loading && <Check className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />}
      </div>

      {open && term.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
          {results.length > 0 ? (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-b-0"
                onClick={() => handlePick(c)}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {c.cnpj ? `CNPJ: ${c.cnpj}` : "Sem CNPJ"}
                  {c.email ? ` · ${c.email}` : ""}
                </div>
              </button>
            ))
          ) : (
            !loading && (
              <div className="p-3 text-sm">
                <p className="text-muted-foreground mb-2">Nenhum cliente encontrado.</p>
                <Button type="button" size="sm" onClick={handleCreate} disabled={creating} className="w-full">
                  {creating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1" />}
                  Cadastrar "{term.trim()}"
                </Button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
