import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Image as ImageIcon, Upload, X, FileUp, FileSpreadsheet } from "lucide-react";
import { usePriceListItems } from "@/hooks/use-online-quotes";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

interface PriceListItemsDialogProps {
  priceList: { id: string; name: string; markup_percentage?: number } | null;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
}

export function PriceListItemsDialog({ priceList, onOpenChange, canEdit = true }: PriceListItemsDialogProps) {
  const [search, setSearch] = useState("");
  const { data: items, isLoading } = usePriceListItems(priceList?.id || "");
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filteredItems = items?.filter(item => 
    item.product_name.toLowerCase().includes(search.toLowerCase()) ||
    item.product_code.toLowerCase().includes(search.toLowerCase())
  );

  const handleFileUpload = async (productCode: string, file: File) => {
    if (!priceList) return;
    setUpdatingId(productCode);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const { url } = await api<{url: string}>(`/api/storage/upload`, {
        method: 'POST',
        body: formData
      });

      await api(`/api/online-quotes/price-lists/${priceList.id}/items/${productCode}`, {
        method: 'PATCH',
        body: { image_url: url }
      });

      toast.success("Imagem enviada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
    } catch (err) {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleUpdateImage = async (productCode: string, imageUrl: string) => {
    if (!priceList) return;
    setUpdatingId(productCode);
    try {
      await api(`/api/online-quotes/price-lists/${priceList.id}/items/${productCode}`, {
        method: 'PATCH',
        body: { image_url: imageUrl }
      });
      toast.success("Imagem atualizada!");
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
    } catch (err) {
      toast.error("Erro ao atualizar imagem");
    } finally {
      setUpdatingId(null);
    }
  };
  const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !priceList) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        // Basic CSV parsing (code,name,price,image_url)
        const lines = text.split('\n');
        const items = lines.slice(1).filter(l => l.trim()).map(line => {
          const [product_code, product_name, sale_price, image_url] = line.split(',');
          return {
            product_code: product_code?.trim(),
            product_name: product_name?.trim(),
            sale_price: parseFloat(sale_price?.trim() || "0"),
            image_url: image_url?.trim()
          };
        }).filter(item => item.product_code && item.product_name);

        if (items.length === 0) {
          toast.error("Nenhum item válido encontrado no arquivo");
          return;
        }

        await api(`/api/online-quotes/price-lists/${priceList.id}/items/bulk`, {
          method: 'POST',
          body: { items }
        });

        toast.success(`${items.length} itens importados com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
      } catch (err) {
        toast.error("Erro ao importar arquivo");
      }
    };
    reader.readAsText(file);
  };
  const handleXlsxImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !priceList) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          toast.error("Nenhum dado encontrado no arquivo");
          return;
        }

        // Map and validate items
        const items = await Promise.all(jsonData.map(async (row: any) => {
          // Normaliza as chaves para facilitar a busca
          const keys = Object.keys(row);
          const findKey = (possibilities: string[]) => 
            keys.find(k => possibilities.some(p => k.toLowerCase().trim() === p.toLowerCase()));

          const codeKey = findKey(['code', 'codigo', 'código', 'cod', 'sku', 'referencia', 'referência']);
          const nameKey = findKey(['name', 'nome', 'produto', 'descrição', 'descricao', 'item']);
          const priceKey = findKey(['price', 'preco', 'preço', 'valor', 'venda', 'vlr']);
          const imageKey = findKey(['image', 'imagem', 'url', 'foto', 'link']);

          const product_code = (row[codeKey || ''] || '').toString().trim();
          const product_name = (row[nameKey || ''] || '').toString().trim();
          const priceValue = row[priceKey || ''] || 0;
          let sale_price = typeof priceValue === 'number' ? priceValue : parseFloat(priceValue.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim() || "0");
          
          // Aplica markup da tabela se houver
          if (priceList?.markup_percentage && priceList.markup_percentage > 0) {
            sale_price = sale_price * (1 + (priceList.markup_percentage / 100));
          }

          let image_url = (row[imageKey || ''] || '').toString().trim();

          // Se não tiver imagem na planilha, tenta buscar de outras tabelas pelo código
          if (!image_url && product_code) {
            try {
              const response = await api<any[]>(`/api/online-quotes/items/search-by-code?code=${encodeURIComponent(product_code)}`);
              if (response && response.length > 0) {
                const itemWithImage = response.find(i => i.image_url);
                if (itemWithImage) {
                  image_url = itemWithImage.image_url;
                }
              }
            } catch (err) {
              console.warn(`Erro ao buscar imagem para o código ${product_code}:`, err);
            }
          }

          return {
            product_code,
            product_name,
            sale_price,
            image_url
          };
        }));
        
        const filteredItems = items.filter(item => item.product_code && item.product_name);

        if (items.length === 0) {
          toast.error("Nenhum item válido encontrado. Certifique-se de que as colunas 'Código' e 'Nome' existem.");
          return;
        }

        await api(`/api/online-quotes/price-lists/${priceList.id}/items/bulk`, {
          method: 'POST',
          body: { items }
        });

        toast.success(`${items.length} itens importados com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
      } catch (err) {
        console.error("Erro na importação XLSX:", err);
        toast.error("Erro ao processar o arquivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog open={!!priceList} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Itens da Tabela: {priceList?.name}</DialogTitle>
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar por código ou nome..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <Button variant="outline" size="sm" className="relative">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Importar Excel (XLSX)
                    <input 
                      type="file" 
                      accept=".xlsx, .xls" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={handleXlsxImport}
                    />
                  </Button>
                  <Button variant="ghost" size="sm" className="relative">
                    <FileUp className="h-4 w-4 mr-2" />
                    CSV
                    <input 
                      type="file" 
                      accept=".csv" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      onChange={handleBulkImport}
                    />
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Imagem</TableHead>
                  <TableHead>Código</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Preço Venda</TableHead>
                   {canEdit && <TableHead className="w-[120px]">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems?.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.product_name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground/30" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.product_code}</TableCell>
                    <TableCell className="font-medium">{item.product_name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.sale_price)}</span>
                        {priceList?.markup_percentage ? (
                          <span className="text-[10px] text-muted-foreground">Inclui {priceList.markup_percentage}% de markup</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="relative h-8 w-8 p-0"
                          disabled={updatingId === item.product_code}
                          title="Fazer upload de foto"
                        >
                          {updatingId === item.product_code ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileUpload(item.product_code, file);
                            }}
                            disabled={updatingId === item.product_code}
                          />
                        </Button>
                        <Input 
                          placeholder="Ou cole o link..."
                          defaultValue={item.image_url || ""}
                          className="h-8 text-xs flex-1"
                          onBlur={(e) => {
                            if (e.target.value !== (item.image_url || "")) {
                              handleUpdateImage(item.product_code, e.target.value);
                            }
                          }}
                          disabled={updatingId === item.product_code}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
