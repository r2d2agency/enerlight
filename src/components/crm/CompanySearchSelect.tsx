import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCRMCompanies, useCRMCompanyMutations, CRMCompany } from "@/hooks/use-crm";
import { Building2, Search, Plus, Loader2, Check, X, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface CompanySearchSelectProps {
  value: string;
  onSelect: (companyId: string) => void;
}

interface CNPJSocio {
  nome: string;
  qualificacao: string;
  data_entrada: string;
}

interface CNPJData {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  capital_social: string;
  natureza: string;
  data_abertura: string;
  socios: CNPJSocio[];
}

function formatCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .slice(0, 18);
}

function cleanCNPJ(value: string): string {
  return value.replace(/\D/g, "");
}

export function CompanySearchSelect({ value, onSelect }: CompanySearchSelectProps) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [creatingMode, setCreatingMode] = useState(false);
  const [cnpjSearch, setCnpjSearch] = useState("");
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const [cnpjData, setCnpjData] = useState<CNPJData | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newCompanyCNPJ, setNewCompanyCNPJ] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: companies } = useCRMCompanies(search || undefined);
  const { createCompany } = useCRMCompanyMutations();

  const selectedCompany = companies?.find((c) => c.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setCreatingMode(false);
        setCnpjData(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearchCNPJ = async () => {
    const digits = cleanCNPJ(cnpjSearch);
    if (digits.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }

    setLoadingCNPJ(true);
    setCnpjData(null);
    try {
      const data = await api<CNPJData>(`/api/cnpj/lookup/${digits}`);
      setCnpjData(data);
      setNewCompanyName(data.nome_fantasia || data.razao_social || "");
      setNewCompanyCNPJ(formatCNPJ(digits));
    } catch {
      toast.error("Não foi possível consultar o CNPJ. Verifique e tente novamente.");
    } finally {
      setLoadingCNPJ(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) {
      toast.error("Nome da empresa é obrigatório");
      return;
    }

    // Build socios text for notes
    let notesText = "";
    if (cnpjData) {
      const parts: string[] = [];
      if (cnpjData.razao_social) parts.push(`Razão Social: ${cnpjData.razao_social}`);
      if (cnpjData.capital_social) parts.push(`Capital Social: R$ ${Number(cnpjData.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      if (cnpjData.natureza) parts.push(`Natureza Jurídica: ${cnpjData.natureza}`);
      if (cnpjData.data_abertura) parts.push(`Data Abertura: ${cnpjData.data_abertura}`);
      if (cnpjData.socios?.length) {
        parts.push("");
        parts.push("=== SÓCIOS ===");
        cnpjData.socios.forEach((s, i) => {
          parts.push(`${i + 1}. ${s.nome} - ${s.qualificacao}${s.data_entrada ? ` (desde ${s.data_entrada})` : ""}`);
        });
      }
      notesText = parts.join("\n");
    }

    const companyData: Partial<CRMCompany> = {
      name: newCompanyName.trim(),
      cnpj: cleanCNPJ(newCompanyCNPJ) || undefined,
      notes: notesText || undefined,
    };

    if (cnpjData) {
      companyData.phone = cnpjData.telefone || undefined;
      companyData.email = cnpjData.email || undefined;
      companyData.address = [cnpjData.logradouro, cnpjData.numero].filter(Boolean).join(", ") || undefined;
      companyData.city = cnpjData.municipio || undefined;
      companyData.state = cnpjData.uf || undefined;
      companyData.zip_code = cnpjData.cep || undefined;
    }

    try {
      const created = await createCompany.mutateAsync(companyData);
      onSelect(created.id);
      setCreatingMode(false);
      setCnpjData(null);
      setIsOpen(false);
      setCnpjSearch("");
      setNewCompanyName("");
      setNewCompanyCNPJ("");
    } catch {
      toast.error("Erro ao criar empresa");
    }
  };

  if (creatingMode) {
    return (
      <div ref={containerRef} className="space-y-3 border rounded-md p-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Nova Empresa</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setCreatingMode(false); setCnpjData(null); setCnpjSearch(""); }}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Input
            value={cnpjSearch}
            onChange={(e) => setCnpjSearch(formatCNPJ(e.target.value))}
            placeholder="Buscar por CNPJ..."
            className="flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleSearchCNPJ()}
          />
          <Button size="sm" onClick={handleSearchCNPJ} disabled={loadingCNPJ}>
            {loadingCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {cnpjData && (
          <div className="text-xs bg-muted rounded p-2.5 space-y-1.5">
            <p className="font-medium text-foreground">{cnpjData.razao_social}</p>
            {cnpjData.nome_fantasia && <p className="text-muted-foreground">Fantasia: {cnpjData.nome_fantasia}</p>}
            {cnpjData.municipio && <p className="text-muted-foreground">📍 {cnpjData.municipio}/{cnpjData.uf}</p>}
            {cnpjData.capital_social && (
              <p className="text-muted-foreground">
                💰 Capital: R$ {Number(cnpjData.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
            )}
            
            {cnpjData.socios?.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="font-medium text-foreground flex items-center gap-1 mb-1">
                  <Users className="h-3 w-3" />
                  Sócios ({cnpjData.socios.length})
                </p>
                {cnpjData.socios.map((s, i) => (
                  <p key={i} className="text-muted-foreground pl-4">
                    • {s.nome} <span className="text-muted-foreground/70">— {s.qualificacao}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <Input
          value={newCompanyName}
          onChange={(e) => setNewCompanyName(e.target.value)}
          placeholder="Nome da empresa *"
        />
        <Input
          value={newCompanyCNPJ}
          onChange={(e) => setNewCompanyCNPJ(formatCNPJ(e.target.value))}
          placeholder="CNPJ (opcional)"
        />

        <Button size="sm" className="w-full" onClick={handleCreateCompany} disabled={!newCompanyName.trim() || createCompany.isPending}>
          {createCompany.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
          Criar Empresa
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex items-center h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm cursor-pointer",
          !value && "text-muted-foreground"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Building2 className="h-4 w-4 mr-2 shrink-0" />
        {selectedCompany ? selectedCompany.name : "Selecione ou crie uma empresa"}
        {value && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto"
            onClick={(e) => { e.stopPropagation(); onSelect(""); }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="p-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar empresa por nome ou CNPJ..."
              autoFocus
              className="h-8 text-sm"
            />
          </div>

          <ScrollArea className="max-h-[200px]">
            {companies?.length ? (
              <div className="p-1">
                {companies.map((company) => (
                  <div
                    key={company.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-accent",
                      company.id === value && "bg-accent"
                    )}
                    onClick={() => { onSelect(company.id); setIsOpen(false); setSearch(""); }}
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="truncate block">{company.name}</span>
                      {company.cnpj && <span className="text-xs text-muted-foreground">{formatCNPJ(company.cnpj)}</span>}
                    </div>
                    {company.id === value && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">Nenhuma empresa encontrada</p>
            )}
          </ScrollArea>

          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm"
              onClick={() => { setCreatingMode(true); setIsOpen(false); }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Criar nova empresa
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
