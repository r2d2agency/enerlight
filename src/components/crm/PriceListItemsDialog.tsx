import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Image as ImageIcon, Upload, X } from "lucide-react";
import { usePriceListItems } from "@/hooks/use-online-quotes";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface PriceListItemsDialogProps {
  priceList: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}

export function PriceListItemsDialog({ priceList, onOpenChange }: PriceListItemsDialogProps) {
  const [search, setSearch] = useState("");
  const { data: items, isLoading } = usePriceListItems(priceList?.id || "");
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const filteredItems = items?.filter(item => 
    item.product_name.toLowerCase().includes(search.toLowerCase()) ||
    item.product_code.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdateImage = async (productCode: string, imageUrl: string) => {
    if (!priceList) return;
    setUpdatingId(productCode);
    try {
      await api(`/api/online-quotes/price-lists/${priceList.id}/items/${productCode}`, {
        method: 'PATCH',
        body: JSON.stringify({ image_url: imageUrl })
      });
      toast.success("Imagem atualizada!");
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
    } catch (err) {
      toast.error("Erro ao atualizar imagem");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <Dialog open={!!priceList} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle>Itens da Tabela: {priceList?.name}</DialogTitle>
          <div className="flex items-center gap-2 mt-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por código ou nome..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-sm"
            />
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
                  <TableHead className="w-[300px]">URL da Imagem</TableHead>
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
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.sale_price)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="URL da imagem..."
                          defaultValue={item.image_url || ""}
                          className="h-8 text-xs"
                          onBlur={(e) => {
                            if (e.target.value !== (item.image_url || "")) {
                              handleUpdateImage(item.product_code, e.target.value);
                            }
                          }}
                          disabled={updatingId === item.product_code}
                        />
                        {updatingId === item.product_code && <Loader2 className="h-4 w-4 animate-spin" />}
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
