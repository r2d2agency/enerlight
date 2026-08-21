import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2, ShoppingCart } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function RepresentativeCartSide({ items, onRemove, onCheckout, total }: any) {
  return (
    <div className="flex flex-col h-full bg-card border-l">
      <div className="p-4 border-b flex items-center justify-between bg-muted/50">
        <h2 className="font-bold flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          Carrinho
        </h2>
        <Badge variant="secondary">{items?.length || 0} itens</Badge>
      </div>

      <ScrollArea className="flex-1 p-4">
        {items?.length > 0 ? (
          <div className="space-y-4">
            {items.map((item: any) => (
              <div key={item.id} className="group relative flex gap-3 pb-4 border-b last:border-0">
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium leading-tight">{item.description}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{item.code}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs font-bold">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.sale_price)}
                    </span>
                    <span className="text-[10px] bg-secondary px-1.5 rounded text-secondary-foreground">x {item.quantity}</span>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => onRemove(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-[200px] flex flex-col items-center justify-center text-muted-foreground gap-2">
            <ShoppingCart className="h-8 w-8 opacity-20" />
            <p className="text-sm">Vazio</p>
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t bg-muted/30 space-y-4">
        <div className="flex justify-between items-end">
          <span className="text-xs text-muted-foreground">Subtotal</span>
          <span className="text-lg font-black text-primary">
            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(total)}
          </span>
        </div>
        <Button 
          className="w-full font-bold uppercase tracking-wider" 
          disabled={!items || items.length === 0}
          onClick={onCheckout}
        >
          Gerar Orçamento
        </Button>
      </div>
    </div>
  );
}
