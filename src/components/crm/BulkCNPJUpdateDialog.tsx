import { useState, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Database, Play, Square, CheckCircle2, XCircle, Loader2, Search, Save, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyForUpdate {
  id: string;
  name: string;
  cnpj: string;
}

type StepStatus = "pending" | "searching" | "extracting" | "saving" | "done" | "error" | "skipped";

interface CompanyProgress {
  id: string;
  name: string;
  cnpj: string;
  status: StepStatus;
  error?: string;
}

interface BulkCNPJUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DELAY_BETWEEN_REQUESTS_MS = 2000; // 2 seconds between each

const statusLabels: Record<StepStatus, string> = {
  pending: "Aguardando",
  searching: "Consultando Receita...",
  extracting: "Extraindo dados...",
  saving: "Salvando na base...",
  done: "Concluído",
  error: "Erro",
  skipped: "Sem CNPJ",
};

const statusIcons: Record<StepStatus, React.ReactNode> = {
  pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />,
  searching: <Search className="h-4 w-4 text-blue-500 animate-pulse" />,
  extracting: <Database className="h-4 w-4 text-amber-500 animate-pulse" />,
  saving: <Save className="h-4 w-4 text-purple-500 animate-pulse" />,
  done: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-destructive" />,
  skipped: <AlertTriangle className="h-4 w-4 text-muted-foreground" />,
};

export function BulkCNPJUpdateDialog({ open, onOpenChange }: BulkCNPJUpdateDialogProps) {
  const [companies, setCompanies] = useState<CompanyProgress[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stats, setStats] = useState({ total: 0, done: 0, errors: 0, skipped: 0 });
  const cancelRef = useRef(false);
  const queryClient = useQueryClient();

  const loadCompanies = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api<CompanyForUpdate[]>("/api/crm/companies/with-cnpj");
      const items: CompanyProgress[] = data.map((c) => ({
        id: c.id,
        name: c.name,
        cnpj: c.cnpj,
        status: "pending",
      }));
      setCompanies(items);
      setStats({ total: items.length, done: 0, errors: 0, skipped: 0 });
      setCurrentIndex(0);
    } catch (err: any) {
      console.error("Error loading companies:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const updateCompanyStatus = (index: number, status: StepStatus, error?: string) => {
    setCompanies((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], status, error };
      return next;
    });
  };

  const startProcess = async () => {
    cancelRef.current = false;
    setIsRunning(true);
    let done = 0;
    let errors = 0;

    for (let i = currentIndex; i < companies.length; i++) {
      if (cancelRef.current) break;

      setCurrentIndex(i);
      const company = companies[i];

      if (!company.cnpj || company.cnpj.replace(/\D/g, "").length !== 14) {
        updateCompanyStatus(i, "skipped");
        setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
        continue;
      }

      try {
        // Step 1: Searching
        updateCompanyStatus(i, "searching");
        await sleep(300);

        const cnpjClean = company.cnpj.replace(/\D/g, "");
        const cnpjData = await api<any>(`/api/cnpj/lookup/${cnpjClean}`);

        if (cancelRef.current) break;

        // Step 2: Extracting
        updateCompanyStatus(i, "extracting");
        await sleep(300);

        // Build update payload from CNPJ data
        const updatePayload: Record<string, any> = {};
        if (cnpjData.razao_social) updatePayload.name = cnpjData.razao_social;
        if (cnpjData.email) updatePayload.email = cnpjData.email;
        if (cnpjData.telefone) updatePayload.phone = cnpjData.telefone;
        if (cnpjData.logradouro) {
          const addr = [cnpjData.logradouro, cnpjData.numero].filter(Boolean).join(", ");
          if (cnpjData.bairro) updatePayload.address = `${addr} - ${cnpjData.bairro}`;
          else updatePayload.address = addr;
        }
        if (cnpjData.municipio) updatePayload.city = cnpjData.municipio;
        if (cnpjData.uf) updatePayload.state = cnpjData.uf;
        if (cnpjData.cep) updatePayload.zip_code = cnpjData.cep;

        // Build notes with extra info
        const notesParts: string[] = [];
        if (cnpjData.nome_fantasia) notesParts.push(`Nome Fantasia: ${cnpjData.nome_fantasia}`);
        if (cnpjData.natureza) notesParts.push(`Natureza: ${cnpjData.natureza}`);
        if (cnpjData.capital_social) notesParts.push(`Capital Social: R$ ${Number(cnpjData.capital_social).toLocaleString("pt-BR")}`);
        if (cnpjData.data_abertura) notesParts.push(`Abertura: ${cnpjData.data_abertura}`);
        if (cnpjData.situacao) notesParts.push(`Situação: ${cnpjData.situacao}`);
        if (cnpjData.socios?.length) {
          notesParts.push(`\nSócios:\n${cnpjData.socios.map((s: any) => `- ${s.nome} (${s.qualificacao})`).join("\n")}`);
        }
        if (notesParts.length) updatePayload.notes = notesParts.join("\n");

        if (cancelRef.current) break;

        // Step 3: Saving
        updateCompanyStatus(i, "saving");
        await api(`/api/crm/companies/${company.id}`, {
          method: "PATCH",
          body: updatePayload,
        });

        updateCompanyStatus(i, "done");
        done++;
        setStats((s) => ({ ...s, done: s.done + 1 }));
      } catch (err: any) {
        updateCompanyStatus(i, "error", err.message || "Erro desconhecido");
        errors++;
        setStats((s) => ({ ...s, errors: s.errors + 1 }));
      }

      // Delay between requests
      if (i < companies.length - 1 && !cancelRef.current) {
        await sleep(DELAY_BETWEEN_REQUESTS_MS);
      }
    }

    setIsRunning(false);
    if (!cancelRef.current) {
      queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
    }
  };

  const stopProcess = () => {
    cancelRef.current = true;
  };

  const handleOpenChange = (val: boolean) => {
    if (isRunning) return; // Prevent closing while running
    onOpenChange(val);
    if (!val) {
      setCompanies([]);
      setStats({ total: 0, done: 0, errors: 0, skipped: 0 });
      setCurrentIndex(0);
    }
  };

  const progress = stats.total > 0 ? Math.round(((stats.done + stats.errors + stats.skipped) / stats.total) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Atualização em Lote - CNPJ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Stats */}
          {stats.total > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Progresso: {stats.done + stats.errors + stats.skipped} / {stats.total}
                </span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-3" />
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span>{stats.done} atualizadas</span>
                </div>
                <div className="flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span>{stats.errors} erros</span>
                </div>
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{stats.skipped} ignoradas</span>
                </div>
              </div>
            </div>
          )}

          {/* Company list */}
          {companies.length > 0 ? (
            <ScrollArea className="h-[400px] border rounded-lg">
              <div className="divide-y">
                {companies.map((c, idx) => (
                  <div
                    key={c.id}
                    className={cn(
                      "flex items-center justify-between px-4 py-2.5 text-sm",
                      idx === currentIndex && isRunning && "bg-accent/50"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-muted-foreground text-xs w-8 text-right shrink-0">
                        {idx + 1}
                      </span>
                      {statusIcons[c.status]}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{c.cnpj}</p>
                      </div>
                    </div>
                    <div className="shrink-0 ml-2">
                      {c.status === "error" ? (
                        <Badge variant="destructive" className="text-xs truncate max-w-[180px]" title={c.error}>
                          {c.error || "Erro"}
                        </Badge>
                      ) : (
                        <Badge
                          variant={c.status === "done" ? "default" : "secondary"}
                          className={cn(
                            "text-xs",
                            c.status === "done" && "bg-green-500/10 text-green-700 border-green-500/20"
                          )}
                        >
                          {statusLabels[c.status]}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              {isLoading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">Carregando empresas com CNPJ...</p>
                </>
              ) : (
                <>
                  <Database className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground mb-1">
                    Consulta automática de CNPJ na Receita Federal
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    Todas as empresas com CNPJ cadastrado serão consultadas uma a uma, com pausa entre as requisições para respeitar os limites da API.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!isRunning && companies.length === 0 && (
            <Button onClick={loadCompanies} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Database className="h-4 w-4 mr-2" />
              )}
              Carregar Empresas
            </Button>
          )}
          {!isRunning && companies.length > 0 && progress < 100 && (
            <Button onClick={startProcess}>
              <Play className="h-4 w-4 mr-2" />
              {currentIndex > 0 ? "Continuar" : "Iniciar Atualização"}
            </Button>
          )}
          {isRunning && (
            <Button variant="destructive" onClick={stopProcess}>
              <Square className="h-4 w-4 mr-2" />
              Parar
            </Button>
          )}
          {!isRunning && progress === 100 && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
