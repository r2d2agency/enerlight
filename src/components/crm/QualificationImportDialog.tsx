import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ImportItem {
  name: string;
  qualification: string;
  canal?: string;
}

interface ImportResult {
  success: boolean;
  updated: number;
  not_found: string[];
  unmatched_canals?: string[];
  available_groups?: string[];
}

interface SystemGroup {
  id: string;
  name: string;
}

const QUAL_COLORS: Record<string, string> = {
  bronze: "border-orange-400 text-orange-600",
  prata: "border-gray-400 text-gray-500",
  ouro: "border-yellow-400 text-yellow-600",
  platina: "border-purple-400 text-purple-600",
};

const QUAL_ICONS: Record<string, string> = {
  bronze: "🥉",
  prata: "🥈",
  ouro: "🥇",
  platina: "💎",
};

type Step = "upload" | "mapping" | "preview" | "result";

export function QualificationImportDialog({ open, onOpenChange }: Props) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [step, setStep] = useState<Step>("upload");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [systemGroups, setSystemGroups] = useState<SystemGroup[]>([]);
  const [canalMapping, setCanalMapping] = useState<Record<string, string>>({});
  const [uniqueCanals, setUniqueCanals] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch system groups when dialog opens
  useEffect(() => {
    if (open) {
      api<any[]>("/api/crm/groups").then(groups => setSystemGroups(groups.map(g => ({ id: g.id, name: g.name })))).catch(() => {});
    }
  }, [open]);

  const autoMatch = (canals: string[], groups: SystemGroup[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").toLowerCase();

    for (const canal of canals) {
      const cl = canal.toLowerCase().trim();
      const clNorm = normalize(canal);
      // Exact
      let match = groups.find(g => g.name.toLowerCase().trim() === cl);
      // Normalized
      if (!match) match = groups.find(g => normalize(g.name) === clNorm);
      // Contains
      if (!match) match = groups.find(g => g.name.toLowerCase().includes(cl) || cl.includes(g.name.toLowerCase()));
      // Numeric
      if (!match) {
        const num = cl.match(/\d+/);
        if (num) match = groups.find(g => { const gn = g.name.match(/\d+/); return gn && gn[0] === num[0]; });
      }
      if (match) mapping[canal] = match.id;
    }
    return mapping;
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

        const parsed: ImportItem[] = [];
        for (const row of data) {
          const name = (row["Empresa"] || row["Nome Cliente"] || row["nome"] || row["Name"] || row["name"] || row["Nome"] || "").toString().trim();
          const qual = (row["Qualificação"] || row["Classificação"] || row["classificação"] || row["classificacao"] || row["qualification"] || "").toString().trim().toLowerCase();
          const canal = (row["Canal"] || row["canal"] || row["Channel"] || "").toString().trim();
          if (name && ["bronze", "prata", "ouro", "platina"].includes(qual)) {
            parsed.push({ name, qualification: qual, ...(canal ? { canal } : {}) });
          }
        }

        if (parsed.length === 0) {
          toast.error("Nenhuma empresa com qualificação válida encontrada na planilha");
          return;
        }

        setItems(parsed);

        // Extract unique canals
        const canals = [...new Set(parsed.map(i => i.canal).filter(Boolean))] as string[];
        setUniqueCanals(canals);

        if (canals.length > 0) {
          const auto = autoMatch(canals, systemGroups);
          setCanalMapping(auto);
          setStep("mapping");
        } else {
          setStep("preview");
        }

        toast.success(`${parsed.length} empresas encontradas na planilha`);
      } catch {
        toast.error("Erro ao ler a planilha");
      }
    };
    reader.readAsBinaryString(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const res = await api<ImportResult>("/api/crm/companies/bulk-qualification", {
        method: "POST",
        body: { items, canal_mapping: canalMapping },
      });
      setResult(res);
      setStep("result");
      queryClient.invalidateQueries({ queryKey: ["crm-companies"] });
      toast.success(`${res.updated} empresas atualizadas!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setItems([]);
      setResult(null);
      setStep("upload");
      setCanalMapping({});
      setUniqueCanals([]);
    }
    onOpenChange(v);
  };

  const unmappedCount = uniqueCanals.filter(c => !canalMapping[c]).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Qualificações
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <p className="text-sm text-muted-foreground text-center">
              Envie uma planilha com as colunas <strong>"Empresa"</strong>, <strong>"Qualificação"</strong> (Bronze, Prata, Ouro ou Platina) e opcionalmente <strong>"Canal"</strong> (nome do grupo/canal).
              <br />O sistema irá buscar as empresas pelo nome e atualizar a qualificação e o canal.
            </p>
            <Button onClick={() => fileRef.current?.click()} variant="outline" size="lg">
              <Upload className="h-4 w-4 mr-2" /> Selecionar Planilha
            </Button>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Vincule os canais da planilha aos grupos do sistema. Os que foram identificados automaticamente já estão preenchidos.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal na Planilha</TableHead>
                    <TableHead className="w-8 text-center"><ArrowRight className="h-4 w-4 mx-auto" /></TableHead>
                    <TableHead>Grupo no Sistema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueCanals.map(canal => {
                    const mapped = canalMapping[canal];
                    const matchedGroup = systemGroups.find(g => g.id === mapped);
                    return (
                      <TableRow key={canal}>
                        <TableCell className="text-sm font-medium">{canal}</TableCell>
                        <TableCell className="text-center">
                          <ArrowRight className="h-4 w-4 mx-auto text-muted-foreground" />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={mapped || "__none__"}
                            onValueChange={(v) => {
                              setCanalMapping(prev => {
                                const next = { ...prev };
                                if (v === "__none__") {
                                  delete next[canal];
                                } else {
                                  next[canal] = v;
                                }
                                return next;
                              });
                            }}
                          >
                            <SelectTrigger className={`w-full ${!mapped ? 'border-amber-400' : 'border-green-500'}`}>
                              <SelectValue placeholder="Selecionar grupo..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">— Não vincular —</SelectItem>
                              {systemGroups.map(g => (
                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {unmappedCount > 0 && (
              <p className="text-xs text-amber-500">
                {unmappedCount} canal(is) sem vínculo — empresas desses canais serão importadas sem grupo.
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setItems([]); setStep("upload"); }}>Voltar</Button>
              <Button onClick={() => setStep("preview")}>
                Continuar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{items.length} empresas para atualizar</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(uniqueCanals.length > 0 ? "mapping" : "upload")}>Voltar</Button>
                <Button onClick={handleImport} disabled={isImporting}>
                  {isImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Aplicar Qualificações
                </Button>
              </div>
            </div>
            <div className="max-h-[400px] overflow-y-auto border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Qualificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.slice(0, 100).map((item, i) => {
                    const groupName = item.canal && canalMapping[item.canal]
                      ? systemGroups.find(g => g.id === canalMapping[item.canal])?.name || item.canal
                      : item.canal || "—";
                    return (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{item.name}</TableCell>
                        <TableCell className="text-xs">{groupName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={QUAL_COLORS[item.qualification]}>
                            {QUAL_ICONS[item.qualification]} {item.qualification.charAt(0).toUpperCase() + item.qualification.slice(1)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length > 100 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-xs text-muted-foreground">
                        ... e mais {items.length - 100} empresas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{result.updated} empresas atualizadas com sucesso!</span>
            </div>
            {result.not_found.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">{result.not_found.length} empresas não encontradas no sistema:</span>
                </div>
                <div className="max-h-[200px] overflow-y-auto border rounded-lg p-3 bg-muted/50">
                  {result.not_found.map((name, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{name}</p>
                  ))}
                </div>
              </div>
            )}
            <Button onClick={() => handleClose(false)} className="w-full">Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
