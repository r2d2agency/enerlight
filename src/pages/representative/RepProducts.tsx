import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Package, Edit2, Trash2, ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default function RepresentativeProducts() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["price-list-items-all"],
    queryFn: () => api<any[]>("/api/online-quotes/items").catch(() => [])
  });

  const { data: priceLists } = useQuery({
    queryKey: ["price-lists-simple"],
    queryFn: () => api<any[]>("/api/online-quotes/price-lists").catch(() => [])
  });

  const saveProduct = useMutation({
    mutationFn: (data: any) => api(data.id ? `/api/online-quotes/items/${data.id}` : "/api/online-quotes/items", {
      method: data.id ? "PUT" : "POST",
      body: data
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items-all"] });
      toast.success("Produto salvo!");
      setIsDialogOpen(false);
    }
  });

  const filteredProducts = products?.filter(p => 
    p.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.product_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestão de Produtos</h1>
            <p className="text-muted-foreground">Visualize e edite produtos em todas as tabelas de preços.</p>
          </div>
          <Button onClick={() => {
            setEditingProduct(null);
            setIsDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" /> Novo Produto
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou código..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tabela</TableHead>
                  <TableHead>Preço Venda</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Carregando produtos...</TableCell></TableRow>
                ) : filteredProducts?.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado.</TableCell></TableRow>
                ) : filteredProducts?.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-mono text-xs">{product.product_code}</TableCell>
                    <TableCell>{product.product_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{priceLists?.find(pl => pl.id === product.price_list_id)?.name || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>R$ {Number(product.sale_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>{product.category || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => {
                        setEditingProduct(product);
                        setIsDialogOpen(true);
                      }}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingProduct ? 'Editar Produto' : 'Novo Produto'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
               {/* Simplified form for now */}
               <p className="text-sm text-muted-foreground italic">Formulário de edição de produtos em desenvolvimento...</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
