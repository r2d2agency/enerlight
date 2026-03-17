import { useState, useRef, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Upload, Loader2, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useCRMFunnels, CRMFunnel } from "@/hooks/use-crm";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

interface QuoteImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgMembers: { id: string; name: string; email?: string }[];
}

interface ParsedRow {
  order_number: string;
  status: "open" | "won";
  issue_date: string;
  client_name: string;
  value: number;
  seller_name: string;
  contact_name: string;
  phone: string;
  observation: string;
  state: string;
  city: string;
  client_group: string;
  channel: string;
}

interface QuoteImportMapping {
  seller_name: string;
  channel: string;
  quote_status: "open" | "won";
  user_id: string | null;
  funnel_id: string | null;
  stage_id: string | null;
  updated_at: string;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function parseValue(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const s = String(val).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  return parseFloat(s) || 0;
}

function normalizeMappingValue(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

function buildMappingKey(seller: string, channel: string, status: "open" | "won") {
  return `${normalizeMappingValue(seller)}::${normalizeMappingValue(channel)}::${status}`;
}

function getMostFrequent(votes: Map<string, number>) {
  let bestValue = "";
  let bestCount = -1;

  for (const [value, count] of votes.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return bestValue || null;
}

function buildSuggestedMappings(rows: ParsedRow[], mappings: QuoteImportMapping[]) {
  const sellerMap: Record<string, string> = {};
  const funnelMap: Record<string, string> = {};

  if (!rows.length || !mappings.length) return { sellerMap, funnelMap };

  const sortedMappings = [...mappings].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  const exactMappings = new Map<string, QuoteImportMapping>();
  const latestBySeller = new Map<string, QuoteImportMapping>();

  for (const mapping of sortedMappings) {
    const exactKey = buildMappingKey(mapping.seller_name, mapping.channel || "", mapping.quote_status);
    if (!exactMappings.has(exactKey)) exactMappings.set(exactKey, mapping);

    const sellerKey = normalizeMappingValue(mapping.seller_name);
    if (!latestBySeller.has(sellerKey)) latestBySeller.set(sellerKey, mapping);
  }

  const sellerNames = Array.from(new Set(rows.map((row) => row.seller_name).filter(Boolean)));

  for (const sellerName of sellerNames) {
    const sellerRows = rows.filter((row) => normalizeMappingValue(row.seller_name) === normalizeMappingValue(sellerName));
    const userVotes = new Map<string, number>();
    const funnelVotes = new Map<string, number>();

    for (const row of sellerRows) {
      const exact = exactMappings.get(buildMappingKey(row.seller_name, row.channel || "", row.status));
      const fallback = latestBySeller.get(normalizeMappingValue(row.seller_name));
      const selected = exact || fallback;
      if (!selected) continue;

      if (selected.user_id) userVotes.set(selected.user_id, (userVotes.get(selected.user_id) || 0) + 1);
      if (selected.funnel_id) funnelVotes.set(selected.funnel_id, (funnelVotes.get(selected.funnel_id) || 0) + 1);
    }

    const bestUser = getMostFrequent(userVotes);
    const bestFunnel = getMostFrequent(funnelVotes);

    if (bestUser) sellerMap[sellerName] = bestUser;
    if (bestFunnel) funnelMap[sellerName] = bestFunnel;
  }

  return { sellerMap, funnelMap };
}

export function QuoteImportDialog({ open, onOpenChange, orgMembers }: QuoteImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { data: funnels = [] } = useCRMFunnels();

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [sellerMapping, setSellerMapping] = useState<Record<string, string>>({});
  const [funnelMapping, setFunnelMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "importing" | "done">("upload");
  const [result, setResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [autoMappingApplied, setAutoMappingApplied] = useState(false);

  const { data: savedMappings = [] } = useQuery({
    queryKey: ["quote-import-mappings"],
    queryFn: () => api<QuoteImportMapping[]>("/api/crm/quote-import-mappings"),
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  const sellers = useMemo(() => {
    const map = new Map<string, { count: number; total: number; won: number; open: number }>();
    for (const r of rows) {
      const existing = map.get(r.seller_name) || { count: 0, total: 0, won: 0, open: 0 };
      existing.count++;
      existing.total += r.value;
      if (r.status === "won") existing.won++; else existing.open++;
      map.set(r.seller_name, existing);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].total - a[1].total);
  }, [rows]);

  const totals = useMemo(() => {
    const won = rows.filter((r) => r.status === "won");
    const open = rows.filter((r) => r.status === "open");
    return {
      total: rows.length,
      wonCount: won.length,
      wonValue: won.reduce((s, r) => s + r.value, 0),
      openCount: open.length,
      openValue: open.reduce((s, r) => s + r.value, 0),
    };
  }, [rows]);

  useEffect(() => {
    if (step !== "mapping" || rows.length === 0 || autoMappingApplied || savedMappings.length === 0) return;

    const suggested = buildSuggestedMappings(rows, savedMappings);

    setSellerMapping((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [sellerName, userId] of Object.entries(suggested.sellerMap)) {
        if (!next[sellerName]) {
          next[sellerName] = userId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setFunnelMapping((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [sellerName, selectedFunnelId] of Object.entries(suggested.funnelMap)) {
        if (!next[sellerName]) {
          next[sellerName] = selectedFunnelId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setAutoMappingApplied(true);
  }, [step, rows, autoMappingApplied, savedMappings]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

        const findCol = (row: Record<string, any>, patterns: string[]) => {
          const keys = Object.keys(row);
          for (const p of patterns) {
            const k = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
            if (k) return row[k];
          }
          return "";
        };

        const mapped: ParsedRow[] = [];
        for (const row of jsonRows) {
          const seller = String(findCol(row, ["vendedor", "seller"])).trim();
          const situacao = String(findCol(row, ["situação", "situacao", "status"])).trim().toLowerCase();
          const clientName = String(findCol(row, ["nome do cliente", "cliente", "client", "razão"])).trim();

          if (!seller || !clientName) continue;

          mapped.push({
            order_number: String(findCol(row, ["numero", "número", "nº", "pedido"])).trim(),
            status: situacao.includes("confirmado") || situacao.includes("ganho") ? "won" : "open",
            issue_date: String(findCol(row, ["dt. emissão", "emissão", "emissao", "data"])).trim(),
            client_name: clientName,
            value: parseValue(findCol(row, ["valor", "value", "total"])),
            seller_name: seller,
            contact_name: String(findCol(row, ["contato orcamento", "contato orçamento", "contato"])).trim(),
            phone: String(findCol(row, ["telefone", "phone"])).trim(),
            observation: String(findCol(row, ["observacao", "observação", "obs"])).trim(),
            state: String(findCol(row, ["uf", "estado"])).trim().toUpperCase(),
            city: String(findCol(row, ["municipio", "município", "cidade"])).trim(),
            client_group: String(findCol(row, ["grupo cliente", "grupo"])).trim(),
            channel: String(findCol(row, ["etapa/canal", "etapa", "canal"])).trim(),
          });
        }

        if (mapped.length === 0) {
          toast.error("Nenhum registro válido encontrado");
          return;
        }

        setRows(mapped);
        setSellerMapping({});
        setFunnelMapping({});
        setAutoMappingApplied(false);
        setStep("mapping");
        toast.success(`${mapped.length} orçamentos encontrados`);
      } catch {
        toast.error("Erro ao ler planilha");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    // Validate all sellers have funnel
    const missing = sellers.filter(([name]) => !funnelMapping[name]);
    if (missing.length > 0) {
      toast.error(`Selecione o funil para: ${missing.map(m => m[0]).join(", ")}`);
      return;
    }

    setImporting(true);
    setStep("importing");
    try {
      const res = await api<{ stats: any }>("/api/crm/import-quotes", {
        method: "POST",
        body: { rows, sellerMapping, funnelMapping },
      });
      setResult(res.stats);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["crm"] });
      toast.success(`${res.stats.created} negociações criadas!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
      setStep("mapping");
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setStep("upload");
    setRows([]);
    setSellerMapping({});
    setFunnelMapping({});
    setAutoMappingApplied(false);
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[90vh] !grid !grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Orçamentos como Negociações
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="min-h-0 overflow-y-auto flex flex-col items-center justify-center py-12 gap-4">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            <FileSpreadsheet className="h-16 w-16 text-muted-foreground" />
            <p className="text-muted-foreground text-sm text-center">
              Selecione a planilha de orçamentos exportada do ERP.<br />
              <strong>Confirmado</strong> = Negociação ganha → última etapa<br />
              <strong>Aberto</strong> = Negociação em aberto → etapa Orçamento
            </p>
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Selecionar Arquivo
            </Button>
          </div>
        )}

        {step === "mapping" && (
          <div className="min-h-0 overflow-y-auto pr-2">
            <div className="flex flex-col gap-4 pb-2">
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold">{totals.total}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold text-primary">{totals.wonCount}</div>
                  <div className="text-xs text-muted-foreground">Confirmados</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold text-primary">{formatCurrency(totals.wonValue)}</div>
                  <div className="text-xs text-muted-foreground">Valor Confirmados</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-2xl font-bold text-foreground">{totals.openCount}</div>
                  <div className="text-xs text-muted-foreground">Abertos</div>
                </Card>
                <Card className="p-3 text-center">
                  <div className="text-lg font-bold text-foreground">{formatCurrency(totals.openValue)}</div>
                  <div className="text-xs text-muted-foreground">Valor Abertos</div>
                </Card>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-medium">Vincular Vendedores → Usuário e Funil</h4>
                <p className="text-xs text-muted-foreground">
                  Cada vendedor pode ter seu próprio funil. As negociações confirmadas irão para a última etapa e as abertas para "Orçamento".
                </p>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor</TableHead>
                    <TableHead className="w-20">Qtd</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Funil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.map(([name, info]) => (
                    <TableRow key={name}>
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{name}</span>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1">{info.won} ganhas</Badge>
                            <Badge variant="secondary" className="text-[10px] px-1">{info.open} abertas</Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{info.count}</TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(info.total)}</TableCell>
                      <TableCell>
                        <Select
                          value={sellerMapping[name] || ""}
                          onValueChange={(v) => setSellerMapping(prev => ({ ...prev, [name]: v }))}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue placeholder="Usuário..." />
                          </SelectTrigger>
                          <SelectContent>
                            {orgMembers.map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={funnelMapping[name] || ""}
                          onValueChange={(v) => setFunnelMapping(prev => ({ ...prev, [name]: v }))}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue placeholder="Funil..." />
                          </SelectTrigger>
                          <SelectContent>
                            {funnels.filter((f: CRMFunnel) => f.is_active).map((f: CRMFunnel) => (
                              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Duplicatas são detectadas pelo número do pedido.
              </div>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando orçamentos...</p>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-medium text-lg">{result.created} negociações criadas</p>
              <div className="flex gap-3 justify-center mt-1">
                <Badge className="bg-green-600">{result.won} ganhas</Badge>
                <Badge variant="secondary">{result.open} abertas</Badge>
              </div>
              {result.companiesCreated > 0 && (
                <p className="text-sm text-muted-foreground mt-1">{result.companiesCreated} empresas criadas</p>
              )}
              {result.skipped > 0 && (
                <p className="text-sm text-muted-foreground">{result.skipped} ignorados (duplicados/sem funil)</p>
              )}
              {result.errors?.length > 0 && (
                <ScrollArea className="max-h-[100px] mt-2 text-left">
                  {result.errors.slice(0, 10).map((e: string, i: number) => (
                    <p key={i} className="text-xs text-destructive">{e}</p>
                  ))}
                </ScrollArea>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {step === "mapping" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("upload");
                  setRows([]);
                  setSellerMapping({});
                  setFunnelMapping({});
                  setAutoMappingApplied(false);
                }}
              >
                Voltar
              </Button>
              <Button onClick={handleImport} disabled={importing}>
                Importar {rows.length} Orçamentos
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={handleClose}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
