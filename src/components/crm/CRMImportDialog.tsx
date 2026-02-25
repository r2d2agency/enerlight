import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Upload, FileSpreadsheet, Users, CheckCircle2, AlertTriangle, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import * as XLSX from "xlsx";

interface OrgMember {
  id: string;
  name: string;
  email: string;
}

interface CRMImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgMembers: OrgMember[];
}

type Step = "upload" | "mapping" | "importing" | "done";

export function CRMImportDialog({ open, onOpenChange, orgMembers }: CRMImportDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [ownerMapping, setOwnerMapping] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  // Extract unique owners from rows
  const uniqueOwners = useMemo(() => {
    const owners = new Set<string>();
    rows.forEach(r => {
      const name = (r["Responsável"] || r["Responsavel"] || "").trim();
      if (name) owners.add(name);
    });
    return Array.from(owners).sort();
  }, [rows]);

  // Stats preview
  const preview = useMemo(() => {
    const funnels = new Set<string>();
    const stages = new Set<string>();
    const companies = new Set<string>();
    let won = 0, lost = 0, open = 0;

    rows.forEach(r => {
      if (r["Funil de vendas"]) funnels.add(r["Funil de vendas"]);
      if (r["Etapa"]) stages.add(r["Etapa"]);
      if (r["Empresa"]) companies.add(r["Empresa"]);
      const estado = (r["Estado"] || "").toLowerCase();
      if (estado.includes("vendida") || estado.includes("ganha")) won++;
      else if (estado.includes("perdida")) lost++;
      else open++;
    });

    return { funnels: funnels.size, stages: stages.size, companies: companies.size, won, lost, open };
  }, [rows]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
        
        if (jsonRows.length === 0) {
          toast.error("Planilha vazia");
          return;
        }

        setRows(jsonRows);
        setStep("mapping");
        toast.success(`${jsonRows.length} registros encontrados`);
      } catch (err) {
        toast.error("Erro ao ler a planilha");
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleImport = useCallback(async () => {
    setStep("importing");
    setProgress(10);

    try {
      // Send in batches of 100
      const batchSize = 100;
      const totalBatches = Math.ceil(rows.length / batchSize);
      let totalCreated = 0;
      let totalSkipped = 0;
      let allErrors: string[] = [];
      let lastStats: any = null;

      for (let i = 0; i < totalBatches; i++) {
        const batch = rows.slice(i * batchSize, (i + 1) * batchSize);
        const result = await api<any>("/api/crm/import", {
          method: "POST",
          body: { rows: batch, ownerMapping },
        });
        
        totalCreated += result.stats?.created || 0;
        totalSkipped += result.stats?.skipped || 0;
        if (result.stats?.errors) allErrors.push(...result.stats.errors);
        lastStats = result.stats;
        
        setProgress(Math.round(((i + 1) / totalBatches) * 100));
      }

      setImportResult({
        stats: {
          created: totalCreated,
          skipped: totalSkipped,
          errors: allErrors,
          funnelsCreated: lastStats?.funnelsCreated || 0,
          stagesCreated: lastStats?.stagesCreated || 0,
          companiesCreated: lastStats?.companiesCreated || 0,
        }
      });
      setStep("done");
    } catch (err: any) {
      toast.error(err.message || "Erro na importação");
      setStep("mapping");
    }
  }, [rows, ownerMapping]);

  const handleClose = () => {
    setStep("upload");
    setRows([]);
    setOwnerMapping({});
    setImportResult(null);
    setProgress(0);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Negociações
          </DialogTitle>
          <DialogDescription>
            {step === "upload" && "Faça upload da planilha XLSX do CRM antigo"}
            {step === "mapping" && "Mapeie os responsáveis para os usuários do sistema"}
            {step === "importing" && "Importando dados..."}
            {step === "done" && "Importação concluída"}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <label className="relative border-2 border-dashed rounded-lg p-12 text-center w-full cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-2">Arraste ou clique para selecionar</p>
              <p className="text-xs text-muted-foreground">Formatos: .xlsx, .xls</p>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>
        )}

        {/* Step 2: Mapping */}
        {step === "mapping" && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Preview stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold">{rows.length}</div>
                <div className="text-xs text-muted-foreground">Negociações</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold">{preview.companies}</div>
                <div className="text-xs text-muted-foreground">Empresas</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold">{preview.funnels}</div>
                <div className="text-xs text-muted-foreground">Funis</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{preview.won}</div>
                <div className="text-xs text-muted-foreground">Ganhas</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold text-red-500">{preview.lost}</div>
                <div className="text-xs text-muted-foreground">Perdidas</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold text-blue-500">{preview.open}</div>
                <div className="text-xs text-muted-foreground">Abertas</div>
              </Card>
            </div>

            {/* Owner mapping */}
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <h4 className="font-medium">Mapeamento de Responsáveis</h4>
              <Badge variant="outline">{uniqueOwners.length} encontrados</Badge>
            </div>

            <ScrollArea className="flex-1 max-h-[300px]">
              <div className="space-y-2 pr-4">
                {uniqueOwners.map(owner => {
                  const count = rows.filter(r => (r["Responsável"] || r["Responsavel"] || "").trim() === owner).length;
                  return (
                    <div key={owner} className="flex items-center gap-2 p-2 rounded border bg-card">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{owner}</p>
                        <p className="text-xs text-muted-foreground">{count} negociações</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Select
                        value={ownerMapping[owner] || "_none"}
                        onValueChange={(v) => setOwnerMapping(prev => ({ ...prev, [owner]: v === "_none" ? "" : v }))}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Sem responsável</SelectItem>
                          {orgMembers.map(m => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
                {uniqueOwners.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum responsável encontrado na planilha
                  </p>
                )}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Voltar</Button>
              <Button onClick={handleImport}>
                Importar {rows.length} negociações
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando negociações...</p>
            <Progress value={progress} className="w-full max-w-xs" />
            <p className="text-xs text-muted-foreground">{progress}%</p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && importResult && (
          <div className="flex flex-col items-center py-8 gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h3 className="text-lg font-semibold">Importação Concluída!</h3>
            
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold text-green-500">{importResult.stats.created}</div>
                <div className="text-xs text-muted-foreground">Importadas</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-2xl font-bold text-yellow-500">{importResult.stats.skipped}</div>
                <div className="text-xs text-muted-foreground">Ignoradas</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-xl font-bold">{importResult.stats.companiesCreated}</div>
                <div className="text-xs text-muted-foreground">Empresas criadas</div>
              </Card>
              <Card className="p-3 text-center">
                <div className="text-xl font-bold">{importResult.stats.funnelsCreated + importResult.stats.stagesCreated}</div>
                <div className="text-xs text-muted-foreground">Funis/Etapas criados</div>
              </Card>
            </div>

            {importResult.stats.errors?.length > 0 && (
              <div className="w-full">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Erros ({importResult.stats.errors.length})</span>
                </div>
                <ScrollArea className="max-h-[120px]">
                  <div className="space-y-1">
                    {importResult.stats.errors.slice(0, 20).map((err: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground">{err}</p>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            <Button onClick={handleClose} className="mt-2">Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
