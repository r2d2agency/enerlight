import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Loader2, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useERPBillingMutations, ERPBillingPreview } from "@/hooks/use-erp-billing";

interface ERPBillingImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 }).format(v);
}

export function ERPBillingImportDialog({ open, onOpenChange }: ERPBillingImportDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { previewFile, importRecords } = useERPBillingMutations();
  const [preview, setPreview] = useState<ERPBillingPreview | null>(null);
  const [sellerMapping, setSellerMapping] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"upload" | "mapping" | "done">("upload");
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await previewFile.mutateAsync(file);
      setPreview(data);

      // Pre-fill mapping from existing mappings
      const mapping: Record<string, string> = {};
      for (const m of data.existingMappings) {
        mapping[m.seller_name] = m.user_id;
      }
      setSellerMapping(mapping);
      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar planilha");
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    if (!preview) return;

    try {
      const res = await importRecords.mutateAsync({
        rows: preview.rows,
        sellerMapping,
      });
      setResult({ imported: res.imported, skipped: res.skipped });
      setStep("done");
      toast.success(`${res.imported} registros importados!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
    }
  };

  const handleClose = () => {
    setStep("upload");
    setPreview(null);
    setSellerMapping({});
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Faturamento ERP
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelect} />
            <FileSpreadsheet className="h-16 w-16 text-muted-foreground" />
            <p className="text-muted-foreground text-sm text-center">
              Selecione a planilha de faturamento exportada do ERP.<br />
              Colunas esperadas: Cliente, Pedido, Valor, UF, Vendedor, Data Faturamento, Canal
            </p>
            <Button onClick={() => fileRef.current?.click()} disabled={previewFile.isPending}>
              {previewFile.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Selecionar Arquivo
            </Button>
          </div>
        )}

        {step === "mapping" && preview && (
          <div className="flex-1 overflow-hidden flex flex-col gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Badge variant="secondary">{preview.rows.length} pedidos</Badge>
              <Badge variant="outline">{formatCurrency(preview.totalValue)} total</Badge>
              <Badge variant="outline">{preview.sellers.length} vendedores</Badge>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Vincular Vendedores aos Usuários</h4>
              <p className="text-xs text-muted-foreground">
                Associe cada vendedor da planilha a um usuário do sistema para que os dados apareçam nos relatórios e metas.
              </p>
            </div>

            <ScrollArea className="flex-1 max-h-[300px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendedor (Planilha)</TableHead>
                    <TableHead>Qtd Pedidos</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Usuário do Sistema</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sellers.map((seller) => {
                    const sellerRows = preview.rows.filter(r => r.seller_name === seller);
                    const total = sellerRows.reduce((s, r) => s + r.order_value, 0);
                    const channel = sellerRows.find(r => r.channel)?.channel || "";
                    return (
                      <TableRow key={seller}>
                        <TableCell>
                          <div>
                            <span className="font-medium text-sm">{seller}</span>
                            {channel && <Badge variant="outline" className="ml-2 text-xs">{channel}</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>{sellerRows.length}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(total)}</TableCell>
                        <TableCell>
                          <Select
                            value={sellerMapping[seller] || ""}
                            onValueChange={(v) => setSellerMapping(prev => ({ ...prev, [seller]: v }))}
                          >
                            <SelectTrigger className="w-[200px] h-8">
                              <SelectValue placeholder="Selecionar..." />
                            </SelectTrigger>
                            <SelectContent>
                              {preview.orgUsers.map(u => (
                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Pedidos duplicados (mesmo número + data faturamento) serão ignorados automaticamente.
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-center">
              <p className="font-medium text-lg">{result.imported} registros importados</p>
              {result.skipped > 0 && (
                <p className="text-sm text-muted-foreground">{result.skipped} registros ignorados (duplicados ou inválidos)</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "mapping" && (
            <>
              <Button variant="outline" onClick={() => { setStep("upload"); setPreview(null); }}>Voltar</Button>
              <Button onClick={handleImport} disabled={importRecords.isPending}>
                {importRecords.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Importar {preview?.rows.length} Registros
              </Button>
            </>
          )}
          {step === "done" && <Button onClick={handleClose}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
