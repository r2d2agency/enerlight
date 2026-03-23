import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Upload, FileText, ShoppingCart, Receipt, CheckCircle2 } from "lucide-react";
import { api, API_URL, getAuthToken } from "@/lib/api";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataType: "orcamento" | "pedido" | "faturamento";
  onSuccess: () => void;
}

interface ParsedRow {
  number: string;
  status: string;
  client_name: string;
  value: number;
  seller_name: string;
  channel: string;
  client_group: string;
  state: string;
  city: string;
  emission_date: string | null;
  delivery_date: string | null;
  billing_date: string | null;
  margin: number | null;
  observation: string;
  order_number: string;
}

const TYPE_CONFIG = {
  orcamento: { label: "Orçamentos", icon: FileText, color: "text-blue-600" },
  pedido: { label: "Pedidos", icon: ShoppingCart, color: "text-green-600" },
  faturamento: { label: "Faturamento", icon: Receipt, color: "text-amber-600" },
};

function normalizeHeader(h: string) {
  return String(h || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "").trim();
}

function parseValue(val: any): number {
  if (!val) return 0;
  if (typeof val === "number") return val;
  const s = String(val).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function parseDate(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear(); const m = String(val.getMonth() + 1).padStart(2, "0"); const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().split("T")[0];
  }
  const s = String(val).trim();
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) { let y = parseInt(mdy[3]); if (y < 100) y += 2000; return `${y}-${String(parseInt(mdy[1])).padStart(2, "0")}-${String(parseInt(mdy[2])).padStart(2, "0")}`; }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return null;
}

function parseMargin(val: any): number | null {
  if (!val) return null;
  if (typeof val === "number") return Math.round(val * 10000) / 100;
  const s = String(val).replace("%", "").replace(",", ".").trim();
  return parseFloat(s) || null;
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

export function GoalsImportDialog({ open, onOpenChange, dataType, onSuccess }: Props) {
  const config = TYPE_CONFIG[dataType];
  const Icon = config.icon;

  const [step, setStep] = useState<"upload" | "mapping" | "done">("upload");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [sellers, setSellers] = useState<string[]>([]);
  const [orgUsers, setOrgUsers] = useState<{ id: string; name: string }[]>([]);
  const [existingMappings, setExistingMappings] = useState<{ seller_name: string; user_id: string }[]>([]);
  const [sellerMapping, setSellerMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const reset = () => { setStep("upload"); setRows([]); setSellers([]); setSellerMapping({}); setResult(null); };

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (!jsonRows.length) { toast.error("Planilha vazia"); setLoading(false); return; }

      const headers = Object.keys(jsonRows[0] as any);
      const headerMap: Record<string, string> = {};
      headers.forEach(h => { headerMap[normalizeHeader(h)] = h; });

      // Map columns
      const findCol = (...keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(headerMap).find(nh => nh.includes(k));
          if (found) return headerMap[found];
        }
        return null;
      };

      const colNumber = findCol("numero", "num");
      const colStatus = findCol("situacao", "status");
      const colClient = findCol("nomecliente", "cliente", "nomecli");
      const colValue = findCol("valor", "valorpedido");
      const colSeller = findCol("vendedor");
      const colChannel = findCol("etapacanal", "canal", "etapa");
      const colGroup = findCol("grupocliente", "grupo");
      const colState = findCol("uf", "estado");
      const colCity = findCol("municipio", "cidade");
      const colEmission = findCol("dtemissao", "emissao", "pedido");
      const colDelivery = findCol("dataentrega", "entrega");
      const colBilling = findCol("datafaturamento", "faturamento");
      const colMargin = findCol("margem");
      const colObs = findCol("observacao", "obs");
      const colOrder = findCol("numped", "pedcli", "pedido");

      const parsed: ParsedRow[] = jsonRows.map((r: any) => ({
        number: String(r[colNumber!] || "").replace(/\.0$/, ""),
        status: String(r[colStatus!] || ""),
        client_name: String(r[colClient!] || ""),
        value: parseValue(r[colValue!]),
        seller_name: String(r[colSeller!] || ""),
        channel: String(r[colChannel!] || ""),
        client_group: String(r[colGroup!] || ""),
        state: String(r[colState!] || ""),
        city: String(r[colCity!] || ""),
        emission_date: parseDate(r[colEmission!]),
        delivery_date: parseDate(r[colDelivery!]),
        billing_date: parseDate(r[colBilling!]),
        margin: parseMargin(r[colMargin!]),
        observation: String(r[colObs!] || ""),
        order_number: String(r[colOrder!] || "").replace(/\.0$/, ""),
      }));

      setRows(parsed);

      // Get preview from backend
      const preview = await api<any>("/api/crm/goals/import/preview", {
        method: "POST",
        body: { rows: parsed, dataType },
      });

      setSellers(preview.sellers || []);
      setOrgUsers(preview.orgUsers || []);
      setExistingMappings(preview.existingMappings || []);

      // Auto-fill mappings from existing
      const autoMap: Record<string, string> = {};
      (preview.existingMappings || []).forEach((m: any) => { autoMap[m.seller_name] = m.user_id; });
      setSellerMapping(autoMap);

      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar planilha");
    } finally {
      setLoading(false);
    }
  }, [dataType]);

  const handleImport = async () => {
    setLoading(true);
    try {
      const res = await api<{ imported: number; skipped: number }>("/api/crm/goals/import", {
        method: "POST",
        body: { rows, sellerMapping, dataType },
      });
      setResult(res);
      setStep("done");
      toast.success(`${res.imported} registros importados com sucesso!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Erro na importação");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${config.color}`}>
            <Icon className="h-5 w-5" /> Importar {config.label}
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecione a planilha de <strong>{config.label}</strong> (.xlsx) para importar os dados.
            </p>
            <div
              className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => document.getElementById(`file-input-${dataType}`)?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              {loading ? (
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">Arraste ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-1">Formato: .xlsx</p>
                </>
              )}
            </div>
            <input id={`file-input-${dataType}`} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline">{rows.length} registros</Badge>
              <Badge variant="outline" className={config.color}>Total: {fmt(rows.reduce((s, r) => s + r.value, 0))}</Badge>
            </div>

            {/* Preview */}
            <div className="max-h-40 overflow-y-auto border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Canal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{r.number}</TableCell>
                      <TableCell className="text-xs truncate max-w-[150px]">{r.client_name}</TableCell>
                      <TableCell className="text-xs">{fmt(r.value)}</TableCell>
                      <TableCell className="text-xs">{r.seller_name}</TableCell>
                      <TableCell className="text-xs">{r.channel}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {rows.length > 5 && <p className="text-xs text-center text-muted-foreground py-1">...e mais {rows.length - 5} registros</p>}
            </div>

            {/* Seller mapping */}
            {sellers.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mapeamento de Vendedores</Label>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {sellers.map(seller => (
                    <div key={seller} className="flex items-center gap-2">
                      <span className="text-sm min-w-[180px] truncate">{seller}</span>
                      <Select value={sellerMapping[seller] || "none"} onValueChange={v => setSellerMapping(m => ({ ...m, [seller]: v === "none" ? "" : v }))}>
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Vincular..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Não vincular —</SelectItem>
                          {orgUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => { reset(); }}>Cancelar</Button>
              <Button onClick={handleImport} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Importar {rows.length} registros
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "done" && result && (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
            <div>
              <p className="text-lg font-medium">Importação Concluída!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {result.imported} importados{result.skipped > 0 ? `, ${result.skipped} ignorados` : ""}
              </p>
            </div>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
