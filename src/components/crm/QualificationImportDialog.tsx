import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";
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

export function QualificationImportDialog({ open, onOpenChange }: Props) {
  const [items, setItems] = useState<ImportItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

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
          const name = (row["Nome Cliente"] || row["nome"] || row["Name"] || row["name"] || row["Nome"] || "").toString().trim();
          const qual = (row["Classificação"] || row["classificação"] || row["classificacao"] || row["Qualificação"] || row["qualification"] || "").toString().trim().toLowerCase();
          if (name && ["bronze", "prata", "ouro", "platina"].includes(qual)) {
            parsed.push({ name, qualification: qual });
          }
        }

        if (parsed.length === 0) {
          toast.error("Nenhuma empresa com qualificação válida encontrada na planilha");
          return;
        }
        setItems(parsed);
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
        body: { items },
      });
      setResult(res);
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
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Qualificações
          </DialogTitle>
        </DialogHeader>

        {!items.length && !result && (
          <div className="flex flex-col items-center gap-4 py-8">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
            <p className="text-sm text-muted-foreground text-center">
              Envie uma planilha com as colunas <strong>"Nome Cliente"</strong> e <strong>"Classificação"</strong> (Bronze, Prata, Ouro ou Platina).
              <br />O sistema irá buscar as empresas pelo nome e atualizar a qualificação.
            </p>
            <Button onClick={() => fileRef.current?.click()} variant="outline" size="lg">
              <Upload className="h-4 w-4 mr-2" /> Selecionar Planilha
            </Button>
          </div>
        )}

        {items.length > 0 && !result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{items.length} empresas para atualizar</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setItems([])}>Cancelar</Button>
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
                    <TableHead>Qualificação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.slice(0, 100).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={QUAL_COLORS[item.qualification]}>
                          {QUAL_ICONS[item.qualification]} {item.qualification.charAt(0).toUpperCase() + item.qualification.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length > 100 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-xs text-muted-foreground">
                        ... e mais {items.length - 100} empresas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {result && (
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
