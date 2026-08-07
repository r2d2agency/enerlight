import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, Image as ImageIcon, Upload, X, FileUp, FileSpreadsheet, Edit2, Check, Settings2, Trash2, Plus } from "lucide-react";
import { usePriceListItems, useOnlineQuoteCategories } from "@/hooks/use-online-quotes";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";

interface PriceListItemsDialogProps {
  priceList: { id: string; name: string; markup_percentage?: number; is_master?: boolean } | null;
  onOpenChange: (open: boolean) => void;
  canEdit?: boolean;
}

export function PriceListItemsDialog({ priceList, onOpenChange, canEdit = true }: PriceListItemsDialogProps) {
  const { user } = useAuth();
  const isAdmin = ['owner', 'admin', 'manager', 'supervisor'].includes(user?.role || '');
  const [search, setSearch] = useState("");
  const { data: items, isLoading } = usePriceListItems(priceList?.id || "");
  const queryClient = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [showCost, setShowCost] = useState(false);
  const [isCategoriesManagerOpen, setIsCategoriesManagerOpen] = useState(false);
  const { categories, saveCategory, deleteCategory } = useOnlineQuoteCategories();
  const [newCat, setNewCat] = useState({ category: '', subcategory: '' });

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
            product_code: product_code?.trim().toUpperCase(),
            product_name: product_name?.trim().toUpperCase(),
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

  const handleStartEdit = (item: any) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSaveEdit = async () => {
    if (!priceList || !editForm) return;
    setUpdatingId(editForm.product_code);
    try {
      await api(`/api/online-quotes/price-lists/${priceList.id}/items/${editForm.product_code}`, {
        method: 'PATCH',
        body: {
          product_name: editForm.product_name?.toUpperCase(),
          description: editForm.description,
          sale_price: parseFloat(editForm.sale_price) || 0,
          cost_price: parseFloat(editForm.cost_price) || 0,
          unit: editForm.unit?.toUpperCase(),
          category: editForm.category?.toUpperCase(),
          subcategory: editForm.subcategory?.toUpperCase(),
          brand: editForm.brand?.toUpperCase(),
          image_url: editForm.image_url
        }
      });
      toast.success("Item atualizado!");
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      toast.error("Erro ao atualizar item");
    } finally {
      setUpdatingId(null);
    }
  };
  const [importMapping, setImportMapping] = useState<Record<string, string>>({});
  const [xlsxData, setXlsxData] = useState<any[]>([]);
  const [isMappingOpen, setIsMappingOpen] = useState(false);

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
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          toast.error("Nenhum dado encontrado no arquivo");
          return;
        }

        setXlsxData(jsonData);
        
        // Auto-detect mapping
        const firstRow = jsonData[0];
        const keys = Object.keys(firstRow);
        const newMapping: Record<string, string> = {};
        
        const detect = (field: string, possibilities: string[]) => {
          const found = keys.find(k => possibilities.some(p => k.toLowerCase().trim() === p.toLowerCase()));
          if (found) newMapping[field] = found;
        };

        detect('product_code', ['code', 'codigo', 'código', 'cod', 'sku', 'referencia', 'referência']);
        detect('product_name', ['name', 'nome', 'produto', 'descrição', 'descricao', 'item']);
        detect('description', ['description', 'descrição', 'descricao', 'obs', 'observação']);
        detect('sale_price', ['price', 'preco', 'preço', 'valor', 'venda', 'vlr', 'preço venda', 'preço de venda']);
        detect('cost_price', ['cost', 'custo', 'vlr_custo', 'valor_custo', 'compra', 'preço custo', 'preço de custo']);
        detect('image_url', ['image', 'imagem', 'url', 'foto', 'link']);
        detect('category', ['category', 'categoria', 'tipo', 'grupo']);
        detect('subcategory', ['subcategory', 'subcategoria', 'subgrupo']);
        detect('brand', ['brand', 'marca', 'fabricante']);
        detect('unit', ['unit', 'unidade', 'un']);

        setImportMapping(newMapping);
        setIsMappingOpen(true);
      } catch (err) {
        console.error("Erro ao ler XLSX:", err);
        toast.error("Erro ao ler arquivo Excel");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmImport = async () => {
    if (!priceList || xlsxData.length === 0) return;

    try {
      const items = xlsxData.map((row: any) => {
        const parsePrice = (val: any) => {
          if (val === undefined || val === null) return 0;
          if (typeof val === 'number') return val;
          let clean = val.toString().replace(/R\$\s?/, '').replace(/[^\d.,-]/g, '').trim();
          if (clean.includes(',') && clean.includes('.')) {
            clean = clean.replace(/\./g, '').replace(',', '.');
          } else if (clean.includes(',')) {
            clean = clean.replace(',', '.');
          }
          return parseFloat(clean) || 0;
        };

        const base_sale_price = parsePrice(row[importMapping['sale_price']]);
        const cost_price = parsePrice(row[importMapping['cost_price']]);
        
        let sale_price = base_sale_price;
        if (!priceList?.is_master && priceList?.markup_percentage && priceList.markup_percentage > 0) {
          sale_price = base_sale_price * (1 + (priceList.markup_percentage / 100));
        }

        return {
          product_code: (row[importMapping['product_code']] || '').toString().trim().toUpperCase(),
          product_name: (row[importMapping['product_name']] || '').toString().trim().toUpperCase(),
          description: (row[importMapping['description']] || '').toString().trim(),
          sale_price,
          cost_price,
          unit: (row[importMapping['unit']] || 'un').toString().trim().toUpperCase(),
          image_url: (row[importMapping['image_url']] || '').toString().trim(),
          category: (row[importMapping['category']] || '').toString().trim().toUpperCase(),
          subcategory: (row[importMapping['subcategory']] || '').toString().trim().toUpperCase(),
          brand: (row[importMapping['brand']] || '').toString().trim().toUpperCase(),
        };
      }).filter(item => item.product_code && item.product_name);

      if (items.length === 0) {
        toast.error("Nenhum item válido após o mapeamento");
        return;
      }

      await api(`/api/online-quotes/price-lists/${priceList.id}/items/bulk`, {
        method: 'POST',
        body: { items }
      });

      toast.success(`${items.length} itens importados com sucesso!`);
      queryClient.invalidateQueries({ queryKey: ['price-list-items', priceList.id] });
      setIsMappingOpen(false);
      setXlsxData([]);
    } catch (err) {
      toast.error("Erro ao importar itens");
    }
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
              {isAdmin && priceList?.is_master && (
                <div className="flex items-center gap-2 ml-2 px-2 border-l">
                  <span className="text-xs font-medium text-muted-foreground">Ver Custos</span>
                  <input 
                    type="checkbox" 
                    checked={showCost}
                    onChange={(e) => setShowCost(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </div>
              )}
            </div>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setIsCategoriesManagerOpen(true)}>
                <Settings2 className="h-4 w-4 mr-2" />
                Categorias
              </Button>
            )}
          </div>
        </DialogHeader>

        <Dialog open={isCategoriesManagerOpen} onOpenChange={setIsCategoriesManagerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Gerenciar Categorias e Subcategorias</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="flex gap-2">
                <div className="flex-1 space-y-2">
                  <Input 
                    placeholder="Categoria" 
                    value={newCat.category} 
                    onChange={e => setNewCat({...newCat, category: e.target.value.toUpperCase()})}
                  />
                  <Input 
                    placeholder="Subcategoria (opcional)" 
                    value={newCat.subcategory} 
                    onChange={e => setNewCat({...newCat, subcategory: e.target.value.toUpperCase()})}
                  />
                </div>
                <Button 
                  disabled={!newCat.category} 
                  onClick={async () => {
                    await saveCategory.mutateAsync(newCat);
                    setNewCat({ category: '', subcategory: '' });
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Subcategoria</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categories.data?.map((cat: any) => (
                      <TableRow key={cat.id}>
                        <TableCell className="py-2 text-xs font-bold">{cat.category}</TableCell>
                        <TableCell className="py-2 text-xs italic">{cat.subcategory || '-'}</TableCell>
                        <TableCell className="py-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-red-500"
                            onClick={() => deleteCategory.mutate(cat.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!categories.data || categories.data.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-xs">
                          Nenhuma categoria cadastrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
                  <TableHead>Categoria / Marca</TableHead>
                  {priceList?.is_master && showCost && <TableHead>Custo</TableHead>}
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
                    <TableCell className="font-medium">
                      {editingId === item.id ? (
                        <div className="flex flex-col gap-1">
                          <Input 
                            value={editForm.product_name}
                            onChange={e => setEditForm({ ...editForm, product_name: e.target.value })}
                            className="h-8 text-xs font-bold"
                            placeholder="Nome do Produto"
                          />
                          <div className="flex gap-1">
                            <Input 
                              value={editForm.description || ''}
                              onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                              className="h-8 text-xs italic flex-1"
                              placeholder="Descrição"
                            />
                            <Input 
                              value={editForm.brand || ''}
                              onChange={e => setEditForm({ ...editForm, brand: e.target.value.toUpperCase() })}
                              className="h-8 text-[10px] w-24"
                              placeholder="Marca"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <span>{item.product_name}</span>
                          {item.description && <span className="text-xs text-muted-foreground italic line-clamp-1">{item.description}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === item.id ? (
                        <div className="flex flex-col gap-1">
                          <Select 
                            value={editForm.category || ''} 
                            onValueChange={val => {
                              const selectedCat = categories.data?.find(c => c.category === val);
                              setEditForm({ 
                                ...editForm, 
                                category: val,
                                subcategory: selectedCat?.subcategory === editForm.subcategory ? editForm.subcategory : ''
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 text-[10px]">
                              <SelectValue placeholder="Categoria" />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from(new Set(categories.data?.map(c => c.category) || [])).map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <Select 
                            value={editForm.subcategory || ''} 
                            onValueChange={val => setEditForm({ ...editForm, subcategory: val })}
                            disabled={!editForm.category}
                          >
                            <SelectTrigger className="h-7 text-[10px]">
                              <SelectValue placeholder="Subcategoria" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.data?.filter(c => c.category === editForm.category).map(cat => (
                                <SelectItem key={cat.id} value={cat.subcategory || ''}>{cat.subcategory || 'Nenhuma'}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="flex flex-col text-xs text-muted-foreground">
                          {item.category && <span className="truncate max-w-[120px]" title={item.category}>{item.category}</span>}
                          {item.subcategory && <span className="truncate max-w-[120px] italic opacity-70" title={item.subcategory}>{item.subcategory}</span>}
                          {item.brand && <span className="font-bold truncate max-w-[120px]" title={item.brand}>{item.brand}</span>}
                        </div>
                      )}
                    </TableCell>
                    {priceList?.is_master && showCost && (
                      <TableCell>
                        {editingId === item.id ? (
                          <Input 
                            type="number"
                            value={editForm.cost_price}
                            onChange={e => setEditForm({ ...editForm, cost_price: e.target.value })}
                            className="h-8 w-24 text-xs font-mono"
                          />
                        ) : (
                          <span className="text-muted-foreground font-mono">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.cost_price || 0)}
                          </span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-baseline gap-1">
                          {editingId === item.id ? (
                            <div className="flex items-center gap-1">
                              <Input 
                                type="number"
                                value={editForm.sale_price}
                                onChange={e => setEditForm({ ...editForm, sale_price: e.target.value })}
                                className="h-8 w-24 text-xs font-bold"
                              />
                              <Input 
                                value={editForm.unit || ''}
                                onChange={e => setEditForm({ ...editForm, unit: e.target.value })}
                                className="h-8 w-12 text-[10px]"
                                placeholder="un"
                              />
                            </div>
                          ) : (
                            <>
                              <span className="font-bold">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.sale_price)}</span>
                              <span className="text-[10px] text-muted-foreground font-normal">/{item.unit || 'un'}</span>
                            </>
                          )}
                        </div>
                        {priceList?.markup_percentage && !priceList.is_master ? (
                          <span className="text-[10px] text-muted-foreground">Inclui {priceList.markup_percentage}% de markup</span>
                        ) : null}
                      </div>
                    </TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {editingId === item.id ? (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 w-8 p-0 text-success border-success/50 hover:bg-success/10"
                                onClick={handleSaveEdit}
                                disabled={updatingId === item.product_code}
                              >
                                {updatingId === item.product_code ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 w-8 p-0 text-destructive border-destructive/50 hover:bg-destructive/10"
                                onClick={handleCancelEdit}
                                disabled={updatingId === item.product_code}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 w-8 p-0"
                                onClick={() => handleStartEdit(item)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
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
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
      <Dialog open={isMappingOpen} onOpenChange={setIsMappingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mapear Colunas da Planilha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">Relacione as colunas da sua planilha com os campos do sistema:</p>
            <div className="grid gap-4">
              {[
                { label: 'Código (Obrigatório)', key: 'product_code' },
                { label: 'Nome (Obrigatório)', key: 'product_name' },
                { label: 'Descrição', key: 'description' },
                { label: 'Preço Venda', key: 'sale_price' },
                { label: 'Custo', key: 'cost_price' },
                { label: 'Unidade', key: 'unit' },
                { label: 'Categoria', key: 'category' },
                { label: 'Subcategoria', key: 'subcategory' },
                { label: 'Marca', key: 'brand' },
                { label: 'URL da Foto', key: 'image_url' },
              ].map(field => (
                <div key={field.key} className="grid grid-cols-2 items-center gap-4">
                  <span className="text-sm font-medium">{field.label}</span>
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                    value={importMapping[field.key] || ''}
                    onChange={(e) => setImportMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                  >
                    <option value="">Não importar</option>
                    {xlsxData.length > 0 && Object.keys(xlsxData[0]).map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIsMappingOpen(false)}>Cancelar</Button>
              <Button onClick={confirmImport}>Finalizar Importação ({xlsxData.length} itens)</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
