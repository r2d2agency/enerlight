import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

export function CatalogListView({ products, onAddToCart }: any) {
  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Produto</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Preço</TableHead>
            <TableHead className="w-[100px] text-center">Qtd</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product: any) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">{product.description}</TableCell>
              <TableCell className="text-xs uppercase text-muted-foreground">{product.code}</TableCell>
              <TableCell>{product.category || "-"}</TableCell>
              <TableCell className="text-right font-semibold">
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.sale_price)}
              </TableCell>
              <TableCell>
                <Input type="number" defaultValue={1} className="w-16 h-8 mx-auto text-center" min={1} />
              </TableCell>
              <TableCell>
                <Button size="icon" variant="ghost" onClick={() => onAddToCart(product.id)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
