import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { FileSpreadsheet, Upload, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useProspects } from "@/hooks/use-prospects";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  [key: string]: string;
}

export default function ProspectImportDialog({ open, onOpenChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "mapping" | "preview">("upload");
  const [fileName, setFileName] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [data, setData] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<{ name: string; phone: string; source: string }>({
    name: "",
    phone: "",
    source: "",
  });

  const { bulkCreate } = useProspects();

  const resetState = () => {
    setStep("upload");
    setFileName("");
    setColumns([]);
    setData([]);
    setMapping({ name: "", phone: "", source: "" });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        toast.error("Arquivo vazio ou sem dados");
        return;
      }

      // First row is header
      const headers = jsonData[0] as unknown as string[];
      const rows = jsonData.slice(1).map((row: any) => {
        const obj: ParsedRow = {};
        headers.forEach((h, i) => {
          obj[h] = row[i]?.toString() || "";
        });
        return obj;
      }).filter(row => Object.values(row).some(v => v));

      setColumns(headers.filter(h => h));
      setData(rows);

      // Auto-detect mapping
      const nameCol = headers.find(h => /nome|name|cliente/i.test(h)) || "";
      const phoneCol = headers.find(h => /telefone|phone|celular|whatsapp|fone/i.test(h)) || "";
      const sourceCol = headers.find(h => /origem|source|fonte|canal/i.test(h)) || "";
      
      setMapping({ name: nameCol, phone: phoneCol, source: sourceCol });
      setStep("mapping");
    } catch (err) {
      console.error("Error parsing file:", err);
      toast.error("Erro ao ler arquivo");
    }
  };

  const normalizePhone = (phone: string): string => {
    if (!phone) return "";
    // Remove all non-digits
    let digits = phone.replace(/\D/g, "");
    // Remove leading zeros
    digits = digits.replace(/^0+/, "");
    // Add Brazil code if not present
    if (digits.length <= 11) {
      digits = "55" + digits;
    }
    return digits;
  };

  const getMappedData = () => {
    return data
      .map((row) => ({
        name: row[mapping.name]?.trim() || "",
        phone: normalizePhone(row[mapping.phone]),
        source: row[mapping.source]?.trim() || "",
      }))
      .filter((p) => p.name && p.phone && p.phone.length >= 10);
  };

  const handleImport = async () => {
    const prospects = getMappedData();
    if (prospects.length === 0) {
      toast.error("Nenhum prospect válido para importar");
      return;
    }

    await bulkCreate.mutateAsync(prospects);
    onOpenChange(false);
    resetState();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetState(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Prospects</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Arraste ou clique para selecionar</p>
              <p className="text-sm text-muted-foreground">Arquivos Excel (.xlsx, .xls) ou CSV</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <div className="text-sm text-muted-foreground">
              <p><strong>Formato esperado:</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Coluna para Nome (obrigatório)</li>
                <li>Coluna para Telefone (obrigatório)</li>
                <li>Coluna para Origem (opcional)</li>
              </ul>
            </div>
          </div>
        )}

        {step === "mapping" && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                <strong>{fileName}</strong> - {data.length} linhas encontradas
              </span>
            </div>

            <div className="grid gap-4">
              <div className="space-y-2">
                <Label>Coluna de Nome *</Label>
                <Select value={mapping.name} onValueChange={(v) => setMapping(m => ({ ...m, name: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Coluna de Telefone *</Label>
                <Select value={mapping.phone} onValueChange={(v) => setMapping(m => ({ ...m, phone: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Coluna de Origem (opcional)</Label>
                <Select value={mapping.source || "none"} onValueChange={(v) => setMapping(m => ({ ...m, source: v === "none" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>{col}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-2">
              <Label>Prévia (5 primeiros)</Label>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          <th className="p-2 text-left">Nome</th>
                          <th className="p-2 text-left">Telefone</th>
                          <th className="p-2 text-left">Origem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getMappedData().slice(0, 5).map((p, i) => (
                          <tr key={i} className="border-t">
                            <td className="p-2">{p.name || <span className="text-muted-foreground">-</span>}</td>
                            <td className="p-2">{p.phone || <span className="text-muted-foreground">-</span>}</td>
                            <td className="p-2">{p.source || <span className="text-muted-foreground">-</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                {getMappedData().length} prospects válidos de {data.length} linhas
              </p>
            </div>

            {getMappedData().length === 0 && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Nenhum prospect válido. Verifique o mapeamento.</span>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={resetState}>
                Voltar
              </Button>
              <Button
                onClick={handleImport}
                disabled={!mapping.name || !mapping.phone || getMappedData().length === 0 || bulkCreate.isPending}
              >
                {bulkCreate.isPending ? (
                  "Importando..."
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar {getMappedData().length} prospects
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
