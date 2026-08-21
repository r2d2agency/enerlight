import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus } from "lucide-react";

export function CatalogGalleryView({ products, onAddToCart }: any) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {products.map((product: any) => (
        <Card key={product.id} className="hover:shadow-md transition-shadow">
          <div className="aspect-square bg-muted relative rounded-t-lg overflow-hidden">
             <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs">
                {product.image_url ? <img src={product.image_url} alt={product.description} className="w-full h-full object-cover"/> : "Sem Foto"}
             </div>
          </div>
          <CardContent className="p-3 space-y-2">
            <h3 className="font-medium text-sm line-clamp-2">{product.description}</h3>
            <p className="text-xs text-muted-foreground uppercase">{product.code}</p>
            <div className="text-sm font-bold text-primary">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(product.sale_price)}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Input type="number" defaultValue={1} className="w-16 h-8 text-center" min={1} />
              <Button size="sm" className="flex-1" onClick={() => onAddToCart(product.id)}>Adicionar</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
