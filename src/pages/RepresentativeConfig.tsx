import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus,
  List,
  Loader2,
  Trash2,
  ShieldCheck,
  Edit2,
  Upload,
  Percent,
  Search,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PriceList {
  id: string;
  name: string;
  description?: string | null;
  segment?: string | null;
  is_active: boolean;
  is_master?: boolean;
  markup_percentage?: number;
  allowed_templates?: string[];
}

interface PermissionTemplate {
  id: string;
  name: string;
}

interface PriceListCategory {
  id: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number;
  subcategory_count?: number;
}

interface PriceListSubcategory {
  id: string;
  category_id: string;
  category_name?: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order?: number;
}

interface PriceListItem {
  id: string;
  product_code?: string | null;
  product_name: string;
  description?: string | null;
  cost_price: number;
  sale_price: number;
  category?: string | null;
  subcategory?: string | null;
  brand?: string | null;
  image_url?: string | null;
}

interface ImportedPriceListItem {
  product_code: string;
  product_name: string;
  description: string;
  cost_price: number;
  sale_price: number;
  category: string;
  subcategory: string;
  brand: string;
  image_url: string;
}

const fmtCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const ITEM_FIELD_ALIASES = {
  product_code: ["codigo", "código", "sku", "referencia", "referência", "code", "cod"],
  product_name: ["produto", "nome", "descricao produto", "descrição produto", "product", "name", "item"],
  description: ["descricao", "descrição", "detalhes", "description"],
  cost_price: ["custo", "preco custo", "preço custo", "cost", "cost_price"],
  sale_price: ["preco", "preço", "preco venda", "preço venda", "venda", "sale_price", "price"],
  category: ["categoria", "category"],
  subcategory: ["subcategoria", "subcategory"],
  brand: ["marca", "brand"],
  image_url: ["imagem", "url imagem", "image", "image_url"],
} as const;

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeMoney(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const normalized = text
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  return Number(normalized) || 0;
}

function detectItemColumn(header: string) {
  const normalizedHeader = normalizeText(header);

  for (const [field, aliases] of Object.entries(ITEM_FIELD_ALIASES)) {
    if (
      aliases.includes(normalizedHeader as never) ||
      aliases.some((alias) => normalizedHeader.startsWith(alias) || normalizedHeader.includes(alias))
    ) {
      return field as keyof ImportedPriceListItem;
    }
  }

  return null;
}

function parsePriceListExcel(file: File): Promise<ImportedPriceListItem[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false });

        const imported = rows
          .map((row) => {
            const normalized: ImportedPriceListItem = {
              product_code: "",
              product_name: "",
              description: "",
              cost_price: 0,
              sale_price: 0,
              category: "",
              subcategory: "",
              brand: "",
              image_url: "",
            };

            Object.entries(row).forEach(([header, value]) => {
              const field = detectItemColumn(header);
              if (!field) return;

              if (field === "cost_price" || field === "sale_price") {
                normalized[field] = normalizeMoney(value);
                return;
              }

              normalized[field] = String(value ?? "").trim();
            });

            if (!normalized.sale_price && normalized.cost_price) {
              normalized.sale_price = normalized.cost_price;
            }

            return normalized;
          })
          .filter((item) => item.product_name);

        resolve(imported);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error("Falha ao ler o arquivo"));
    reader.readAsArrayBuffer(file);
  });
}

export default function RepresentativeConfig() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: priceLists, isLoading: loadingPriceLists } = useQuery({
    queryKey: ["price-lists"],
    queryFn: () => api<PriceList[]>("/api/online-quotes/price-lists").catch(() => []),
  });

  const { data: permissionTemplates } = useQuery({
    queryKey: ["permission-templates"],
    queryFn: () => api<PermissionTemplate[]>("/api/permission-templates").catch(() => []),
  });

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["price-list-categories"],
    queryFn: () => api<PriceListCategory[]>("/api/online-quotes/categories").catch(() => []),
  });

  const { data: subcategories = [], isLoading: loadingSubcategories } = useQuery({
    queryKey: ["price-list-subcategories"],
    queryFn: () => api<PriceListSubcategory[]>("/api/online-quotes/subcategories").catch(() => []),
  });

  const [isPriceListDialogOpen, setIsPriceListDialogOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<PriceList | null>(null);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [priceListActive, setPriceListActive] = useState(true);
  const [priceListMaster, setPriceListMaster] = useState(false);
  const [itemsPriceList, setItemsPriceList] = useState<PriceList | null>(null);
  const [searchItemTerm, setSearchItemTerm] = useState("");
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);
  const [itemCategoryValue, setItemCategoryValue] = useState("");
  const [itemSubcategoryValue, setItemSubcategoryValue] = useState("");
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [replaceExistingImport, setReplaceExistingImport] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportedPriceListItem[]>([]);
  const [isMarkupDialogOpen, setIsMarkupDialogOpen] = useState(false);
  const [markupPercentage, setMarkupPercentage] = useState("0");
  const [markupBase, setMarkupBase] = useState<"cost" | "sale">("cost");
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PriceListCategory | null>(null);
  const [categoryActive, setCategoryActive] = useState(true);
  const [isSubcategoryDialogOpen, setIsSubcategoryDialogOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<PriceListSubcategory | null>(null);
  const [subcategoryActive, setSubcategoryActive] = useState(true);
  const [subcategoryCategoryId, setSubcategoryCategoryId] = useState("");

  useEffect(() => {
    if (editingPriceList) {
      setSelectedTemplates(editingPriceList.allowed_templates || []);
      setPriceListActive(editingPriceList.is_active);
      setPriceListMaster(!!editingPriceList.is_master);
    } else {
      setSelectedTemplates([]);
      setPriceListActive(true);
      setPriceListMaster(false);
    }
  }, [editingPriceList]);

  useEffect(() => {
    if (itemsPriceList) {
      setMarkupPercentage(String(itemsPriceList.markup_percentage || 0));
    }
  }, [itemsPriceList]);

  useEffect(() => {
    if (editingItem) {
      setItemCategoryValue(editingItem.category || "");
      setItemSubcategoryValue(editingItem.subcategory || "");
    } else {
      setItemCategoryValue("");
      setItemSubcategoryValue("");
    }
  }, [editingItem]);

  useEffect(() => {
    if (editingCategory) {
      setCategoryActive(editingCategory.is_active);
    } else {
      setCategoryActive(true);
    }
  }, [editingCategory]);

  useEffect(() => {
    if (editingSubcategory) {
      setSubcategoryActive(editingSubcategory.is_active);
      setSubcategoryCategoryId(editingSubcategory.category_id);
    } else {
      setSubcategoryActive(true);
      setSubcategoryCategoryId(categories[0]?.id || "");
    }
  }, [editingSubcategory, categories]);

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["price-list-items", itemsPriceList?.id],
    queryFn: () => api<PriceListItem[]>(`/api/online-quotes/price-lists/${itemsPriceList?.id}/items`),
    enabled: !!itemsPriceList?.id,
  });

  const filteredItems = useMemo(() => {
    const term = searchItemTerm.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) =>
      [item.product_code, item.product_name, item.category, item.brand]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [items, searchItemTerm]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories]
  );

  const selectableSubcategories = useMemo(() => {
    if (!itemCategoryValue) return [];
    const category = categories.find((entry) => entry.name === itemCategoryValue);
    if (!category) return [];

    return subcategories.filter((entry) => entry.category_id === category.id && entry.is_active);
  }, [categories, subcategories, itemCategoryValue]);

  const savePriceList = useMutation({
    mutationFn: (data: Partial<PriceList>) =>
      api("/api/online-quotes/price-lists", {
        method: data.id ? "PUT" : "POST",
        body: data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast.success("Tabela salva com sucesso");
    },
  });

  const deletePriceList = useMutation({
    mutationFn: (id: string) => api(`/api/online-quotes/price-lists/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast.success("Tabela excluída com sucesso");
    },
  });

  const saveCategory = useMutation({
    mutationFn: (payload: Partial<PriceListCategory> & { id?: string }) =>
      api(
        payload.id ? `/api/online-quotes/categories/${payload.id}` : "/api/online-quotes/categories",
        { method: payload.id ? "PUT" : "POST", body: payload }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-categories"] });
      queryClient.invalidateQueries({ queryKey: ["price-list-subcategories"] });
      toast.success("Categoria salva com sucesso");
    },
  });

  const deleteCategory = useMutation({
    mutationFn: (id: string) => api(`/api/online-quotes/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-categories"] });
      queryClient.invalidateQueries({ queryKey: ["price-list-subcategories"] });
      toast.success("Categoria removida com sucesso");
    },
  });

  const saveSubcategory = useMutation({
    mutationFn: (payload: Partial<PriceListSubcategory> & { id?: string }) =>
      api(
        payload.id ? `/api/online-quotes/subcategories/${payload.id}` : "/api/online-quotes/subcategories",
        { method: payload.id ? "PUT" : "POST", body: payload }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["price-list-categories"] });
      toast.success("Subcategoria salva com sucesso");
    },
  });

  const deleteSubcategory = useMutation({
    mutationFn: (id: string) => api(`/api/online-quotes/subcategories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-subcategories"] });
      queryClient.invalidateQueries({ queryKey: ["price-list-categories"] });
      toast.success("Subcategoria removida com sucesso");
    },
  });

  const saveItem = useMutation({
    mutationFn: ({ priceListId, item }: { priceListId: string; item: Partial<PriceListItem> }) =>
      api(
        editingItem
          ? `/api/online-quotes/price-lists/${priceListId}/items/${editingItem.id}`
          : `/api/online-quotes/price-lists/${priceListId}/items`,
        {
          method: editingItem ? "PUT" : "POST",
          body: item,
        }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items", itemsPriceList?.id] });
      queryClient.invalidateQueries({ queryKey: ["price-list-categories"] });
      queryClient.invalidateQueries({ queryKey: ["price-list-subcategories"] });
      toast.success(editingItem ? "Item atualizado com sucesso" : "Item criado com sucesso");
    },
  });

  const deleteItem = useMutation({
    mutationFn: ({ priceListId, itemId }: { priceListId: string; itemId: string }) =>
      api(`/api/online-quotes/price-lists/${priceListId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items", itemsPriceList?.id] });
      toast.success("Item removido com sucesso");
    },
  });

  const importItems = useMutation({
    mutationFn: ({ priceListId, itemsToImport, replaceExisting }: { priceListId: string; itemsToImport: ImportedPriceListItem[]; replaceExisting: boolean }) =>
      api<{ imported_count: number; error_count: number; errors: Array<{ index: number; error: string }> }>(
        `/api/online-quotes/price-lists/${priceListId}/import-items`,
        {
          method: "POST",
          body: { items: itemsToImport, replace_existing: replaceExisting },
        }
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items", itemsPriceList?.id] });
      queryClient.invalidateQueries({ queryKey: ["price-list-categories"] });
      queryClient.invalidateQueries({ queryKey: ["price-list-subcategories"] });
      toast.success(`${result.imported_count} item(ns) importado(s)`);
      if (result.error_count > 0) {
        toast.error(`${result.error_count} item(ns) tiveram erro na importação`);
      }
    },
  });

  const applyMarkup = useMutation({
    mutationFn: ({ priceListId, markup, base }: { priceListId: string; markup: number; base: "cost" | "sale" }) =>
      api(`/api/online-quotes/price-lists/${priceListId}/apply-markup`, {
        method: "POST",
        body: {
          markup_percentage: markup,
          base,
          round_to: 2,
          update_table_markup: true,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-list-items", itemsPriceList?.id] });
      queryClient.invalidateQueries({ queryKey: ["price-lists"] });
      toast.success("Markup aplicado com sucesso");
    },
  });

  const handleSavePriceList = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const data = {
      id: editingPriceList?.id || undefined,
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      segment: String(formData.get("segment") || ""),
      is_active: priceListActive,
      allowed_templates: selectedTemplates,
      is_master: priceListMaster,
      markup_percentage: parseFloat(String(formData.get("markup_percentage") || "0")),
    };

    if (!data.id) delete (data as any).id;

    try {
      await savePriceList.mutateAsync(data);
      setIsPriceListDialogOpen(false);
      setEditingPriceList(null);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao salvar tabela");
    }
  };

  const handleDeletePriceList = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a tabela "${name}"?`)) return;

    try {
      await deletePriceList.mutateAsync(id);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao excluir tabela");
    }
  };

  const handleOpenNewItem = () => {
    setEditingItem(null);
    setIsItemDialogOpen(true);
  };

  const handleOpenEditItem = (item: PriceListItem) => {
    setEditingItem(item);
    setIsItemDialogOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!itemsPriceList) return;

    const formData = new FormData(e.currentTarget);
    const payload = {
      product_code: String(formData.get("product_code") || ""),
      product_name: String(formData.get("product_name") || ""),
      description: String(formData.get("description") || ""),
      category: itemCategoryValue,
      subcategory: itemSubcategoryValue,
      brand: String(formData.get("brand") || ""),
      image_url: String(formData.get("image_url") || ""),
      cost_price: normalizeMoney(formData.get("cost_price")),
      sale_price: normalizeMoney(formData.get("sale_price")),
    };

    try {
      await saveItem.mutateAsync({ priceListId: itemsPriceList.id, item: payload });
      setIsItemDialogOpen(false);
      setEditingItem(null);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao salvar item");
    }
  };

  const handleDeleteItem = async (item: PriceListItem) => {
    if (!itemsPriceList) return;
    if (!window.confirm(`Remover o item "${item.product_name}" da tabela?`)) return;

    try {
      await deleteItem.mutateAsync({ priceListId: itemsPriceList.id, itemId: item.id });
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao remover item");
    }
  };

  const handleSaveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await saveCategory.mutateAsync({
        id: editingCategory?.id,
        name: String(formData.get("category_name") || ""),
        description: String(formData.get("category_description") || ""),
        sort_order: Number(formData.get("category_sort_order") || 0),
        is_active: categoryActive,
      });
      setIsCategoryDialogOpen(false);
      setEditingCategory(null);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao salvar categoria");
    }
  };

  const handleDeleteCategory = async (category: PriceListCategory) => {
    if (!window.confirm(`Excluir a categoria "${category.name}" e suas subcategorias?`)) return;

    try {
      await deleteCategory.mutateAsync(category.id);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao excluir categoria");
    }
  };

  const handleSaveSubcategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await saveSubcategory.mutateAsync({
        id: editingSubcategory?.id,
        category_id: subcategoryCategoryId,
        name: String(formData.get("subcategory_name") || ""),
        description: String(formData.get("subcategory_description") || ""),
        sort_order: Number(formData.get("subcategory_sort_order") || 0),
        is_active: subcategoryActive,
      });
      setIsSubcategoryDialogOpen(false);
      setEditingSubcategory(null);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao salvar subcategoria");
    }
  };

  const handleDeleteSubcategory = async (subcategory: PriceListSubcategory) => {
    if (!window.confirm(`Excluir a subcategoria "${subcategory.name}"?`)) return;

    try {
      await deleteSubcategory.mutateAsync(subcategory.id);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao excluir subcategoria");
    }
  };

  const handleImportFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsedItems = await parsePriceListExcel(file);
      if (!parsedItems.length) {
        toast.error("Nenhum item válido encontrado na planilha");
        return;
      }

      setImportPreview(parsedItems);
      setIsImportDialogOpen(true);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível ler a planilha");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!itemsPriceList || !importPreview.length) return;

    try {
      await importItems.mutateAsync({
        priceListId: itemsPriceList.id,
        itemsToImport: importPreview,
        replaceExisting: replaceExistingImport,
      });

      setIsImportDialogOpen(false);
      setImportPreview([]);
      setReplaceExistingImport(false);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao importar planilha");
    }
  };

  const handleApplyMarkup = async () => {
    if (!itemsPriceList) return;

    try {
      await applyMarkup.mutateAsync({
        priceListId: itemsPriceList.id,
        markup: Number(markupPercentage) || 0,
        base: markupBase,
      });

      setIsMarkupDialogOpen(false);
    } catch (error: any) {
      toast.error(error?.data?.error || error.message || "Erro ao aplicar markup");
    }
  };

  return (
    <MainLayout>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportFileSelect}
      />

      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Configuração de Representantes</h1>
            <p className="text-muted-foreground">
              Gerencie tabelas de preços com importação por Excel, edição item a item e reajustes por markup.
            </p>
          </div>
        </div>

        <Tabs defaultValue="price-lists" className="w-full">
          <TabsList>
            <TabsTrigger value="price-lists" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Tabelas de Preços
            </TabsTrigger>
            <TabsTrigger value="categories" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Categorias
            </TabsTrigger>
            <TabsTrigger value="subcategories" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Subcategorias
            </TabsTrigger>
          </TabsList>

          <TabsContent value="price-lists" className="mt-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Tabelas de Preços</CardTitle>
                  <CardDescription>
                    Aqui você cria a tabela, abre seus itens, importa Excel e faz reajuste em lote.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    setEditingPriceList(null);
                    setIsPriceListDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Tabela
                </Button>
              </CardHeader>
              <CardContent>
                {loadingPriceLists ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Segmento</TableHead>
                        <TableHead>Markup</TableHead>
                        <TableHead>Permissões</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {priceLists?.map((pl) => (
                        <TableRow key={pl.id}>
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{pl.name}</span>
                              {pl.description ? (
                                <span className="text-xs text-muted-foreground">{pl.description}</span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>{pl.segment || "-"}</TableCell>
                          <TableCell>{Number(pl.markup_percentage || 0).toFixed(2)}%</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {pl.allowed_templates?.map((templateId) => {
                                const template = permissionTemplates?.find((t) => t.id === templateId);
                                return template ? (
                                  <Badge key={templateId} variant="outline" className="text-[10px]">
                                    {template.name}
                                  </Badge>
                                ) : null;
                              })}
                              {(!pl.allowed_templates || pl.allowed_templates.length === 0) && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Acesso Global
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={pl.is_active ? "default" : "secondary"}>
                              {pl.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setItemsPriceList(pl)}>
                                <List className="mr-2 h-4 w-4" />
                                Itens
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingPriceList(pl);
                                  setIsPriceListDialogOpen(true);
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => handleDeletePriceList(pl.id, pl.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categories" className="mt-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Categorias</CardTitle>
                  <CardDescription>
                    Cadastro mestre de categorias para padronizar os itens das tabelas.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    setEditingCategory(null);
                    setIsCategoryDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Categoria
                </Button>
              </CardHeader>
              <CardContent>
                {loadingCategories ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Ordem</TableHead>
                        <TableHead>Subcategorias</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((category) => (
                        <TableRow key={category.id}>
                          <TableCell className="font-medium">{category.name}</TableCell>
                          <TableCell>{category.description || "-"}</TableCell>
                          <TableCell>{category.sort_order || 0}</TableCell>
                          <TableCell>{category.subcategory_count || 0}</TableCell>
                          <TableCell>
                            <Badge variant={category.is_active ? "default" : "secondary"}>
                              {category.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingCategory(category);
                                  setIsCategoryDialogOpen(true);
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => handleDeleteCategory(category)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subcategories" className="mt-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Subcategorias</CardTitle>
                  <CardDescription>
                    Subcategorias sempre vinculadas a uma categoria mestre.
                  </CardDescription>
                </div>
                <Button
                  onClick={() => {
                    setEditingSubcategory(null);
                    setIsSubcategoryDialogOpen(true);
                  }}
                  disabled={!categories.length}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova Subcategoria
                </Button>
              </CardHeader>
              <CardContent>
                {loadingSubcategories ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subcategoria</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead>Ordem</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {subcategories.map((subcategory) => (
                        <TableRow key={subcategory.id}>
                          <TableCell className="font-medium">{subcategory.name}</TableCell>
                          <TableCell>{subcategory.category_name || "-"}</TableCell>
                          <TableCell>{subcategory.description || "-"}</TableCell>
                          <TableCell>{subcategory.sort_order || 0}</TableCell>
                          <TableCell>
                            <Badge variant={subcategory.is_active ? "default" : "secondary"}>
                              {subcategory.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingSubcategory(subcategory);
                                  setIsSubcategoryDialogOpen(true);
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500"
                                onClick={() => handleDeleteSubcategory(subcategory)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={isPriceListDialogOpen}
          onOpenChange={(open) => {
            setIsPriceListDialogOpen(open);
            if (!open) setEditingPriceList(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingPriceList ? "Editar Tabela" : "Nova Tabela"}</DialogTitle>
            </DialogHeader>
            <form key={editingPriceList?.id || "new-price-list"} onSubmit={handleSavePriceList}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome da Tabela</Label>
                  <Input id="name" name="name" defaultValue={editingPriceList?.name} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="segment">Segmento</Label>
                  <Input id="segment" name="segment" defaultValue={editingPriceList?.segment || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" defaultValue={editingPriceList?.description || ""} />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch checked={priceListActive} onCheckedChange={setPriceListActive} />
                    <Label htmlFor="is_active">Ativa</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={priceListMaster} onCheckedChange={setPriceListMaster} />
                    <Label htmlFor="is_master">Tabela Master</Label>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="markup_percentage">Markup padrão (%)</Label>
                  <Input
                    id="markup_percentage"
                    name="markup_percentage"
                    type="number"
                    step="0.01"
                    defaultValue={editingPriceList?.markup_percentage || 0}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Esse valor fica salvo como referência da tabela e também pode ser aplicado em lote nos itens.
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label>Grupos com Acesso</Label>
                  <div className="flex flex-wrap gap-2 rounded-md border p-3 min-h-[100px]">
                    {permissionTemplates?.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => {
                          if (selectedTemplates.includes(template.id)) {
                            setSelectedTemplates(selectedTemplates.filter((id) => id !== template.id));
                          } else {
                            setSelectedTemplates([...selectedTemplates, template.id]);
                          }
                        }}
                        className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                          selectedTemplates.includes(template.id)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary hover:border-primary/50"
                        }`}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {template.name}
                      </div>
                    ))}
                    {(!permissionTemplates || permissionTemplates.length === 0) && (
                      <p className="text-xs text-muted-foreground">
                        Nenhum template de permissão encontrado.
                      </p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Se nenhum grupo for selecionado, a tabela será visível para todos.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPriceListDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={savePriceList.isPending}>
                  {savePriceList.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Tabela"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!itemsPriceList}
          onOpenChange={(open) => {
            if (!open) {
              setItemsPriceList(null);
              setSearchItemTerm("");
            }
          }}
        >
          <DialogContent className="max-w-7xl">
            <DialogHeader>
              <DialogTitle>
                Itens da Tabela {itemsPriceList ? `- ${itemsPriceList.name}` : ""}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar produto, código, categoria..."
                    value={searchItemTerm}
                    onChange={(e) => setSearchItemTerm(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="mr-2 h-4 w-4" />
                    Importar Excel
                  </Button>
                  <Button variant="outline" onClick={() => setIsMarkupDialogOpen(true)}>
                    <Percent className="mr-2 h-4 w-4" />
                    Aplicar Markup
                  </Button>
                  <Button onClick={handleOpenNewItem}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Item
                  </Button>
                </div>
              </div>

              <div className="rounded-md border">
                <ScrollArea className="h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Subcategoria</TableHead>
                        <TableHead>Marca</TableHead>
                        <TableHead>Custo</TableHead>
                        <TableHead>Venda</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingItems ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">
                            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                          </TableCell>
                        </TableRow>
                      ) : filteredItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                            Nenhum item cadastrado nesta tabela.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.product_code || "-"}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium">{item.product_name}</span>
                                {item.description ? (
                                  <span className="text-xs text-muted-foreground">{item.description}</span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>{item.category || "-"}</TableCell>
                            <TableCell>{item.subcategory || "-"}</TableCell>
                            <TableCell>{item.brand || "-"}</TableCell>
                            <TableCell>{fmtCurrency(item.cost_price)}</TableCell>
                            <TableCell>{fmtCurrency(item.sale_price)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" size="sm" onClick={() => handleOpenEditItem(item)}>
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500"
                                  onClick={() => handleDeleteItem(item)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isItemDialogOpen}
          onOpenChange={(open) => {
            setIsItemDialogOpen(open);
            if (!open) setEditingItem(null);
          }}
        >
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>{editingItem ? "Editar Item" : "Novo Item"}</DialogTitle>
            </DialogHeader>
            <form key={editingItem?.id || "new-item"} onSubmit={handleSaveItem}>
              <div className="grid gap-4 py-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="product_code">Código</Label>
                  <Input id="product_code" name="product_code" defaultValue={editingItem?.product_code || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="product_name">Nome do Produto</Label>
                  <Input id="product_name" name="product_name" defaultValue={editingItem?.product_name || ""} required />
                </div>
                <div className="grid gap-2 md:col-span-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea id="description" name="description" defaultValue={editingItem?.description || ""} />
                </div>
                <div className="grid gap-2">
                  <Label>Categoria</Label>
                  <Select
                    value={itemCategoryValue || "__none__"}
                    onValueChange={(value) => {
                      const nextValue = value === "__none__" ? "" : value;
                      setItemCategoryValue(nextValue);
                      setItemSubcategoryValue("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem categoria</SelectItem>
                      {itemCategoryValue && !activeCategories.some((category) => category.name === itemCategoryValue) ? (
                        <SelectItem value={itemCategoryValue}>{itemCategoryValue}</SelectItem>
                      ) : null}
                      {activeCategories.map((category) => (
                        <SelectItem key={category.id} value={category.name}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Subcategoria</Label>
                  <Select
                    value={itemSubcategoryValue || "__none__"}
                    onValueChange={(value) => setItemSubcategoryValue(value === "__none__" ? "" : value)}
                    disabled={!itemCategoryValue}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={itemCategoryValue ? "Selecione uma subcategoria" : "Escolha uma categoria primeiro"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem subcategoria</SelectItem>
                      {itemSubcategoryValue && !selectableSubcategories.some((subcategory) => subcategory.name === itemSubcategoryValue) ? (
                        <SelectItem value={itemSubcategoryValue}>{itemSubcategoryValue}</SelectItem>
                      ) : null}
                      {selectableSubcategories.map((subcategory) => (
                        <SelectItem key={subcategory.id} value={subcategory.name}>
                          {subcategory.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="brand">Marca</Label>
                  <Input id="brand" name="brand" defaultValue={editingItem?.brand || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="image_url">URL da Imagem</Label>
                  <Input id="image_url" name="image_url" defaultValue={editingItem?.image_url || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cost_price">Preço de Custo</Label>
                  <Input id="cost_price" name="cost_price" type="number" step="0.01" defaultValue={editingItem?.cost_price || 0} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sale_price">Preço de Venda</Label>
                  <Input id="sale_price" name="sale_price" type="number" step="0.01" defaultValue={editingItem?.sale_price || 0} />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsItemDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveItem.isPending}>
                  {saveItem.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Item"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
          <DialogContent className="max-w-6xl">
            <DialogHeader>
              <DialogTitle>Importar Itens por Excel</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Card>
                <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{importPreview.length} item(ns) identificados</div>
                    <div className="text-sm text-muted-foreground">
                      Colunas reconhecidas: código, nome do produto, descrição, custo, venda, categoria, subcategoria, marca e imagem.
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={replaceExistingImport} onCheckedChange={setReplaceExistingImport} />
                    <Label>Substituir itens existentes da tabela</Label>
                  </div>
                </CardContent>
              </Card>

              <div className="rounded-md border">
                <ScrollArea className="h-[360px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Produto</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Custo</TableHead>
                        <TableHead>Venda</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importPreview.slice(0, 100).map((item, index) => (
                        <TableRow key={`${item.product_code}-${index}`}>
                          <TableCell>{item.product_code || "-"}</TableCell>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell>{item.category || "-"}</TableCell>
                          <TableCell>{fmtCurrency(item.cost_price)}</TableCell>
                          <TableCell>{fmtCurrency(item.sale_price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsImportDialogOpen(false);
                    setImportPreview([]);
                  }}
                >
                  Cancelar
                </Button>
                <Button onClick={handleConfirmImport} disabled={importItems.isPending}>
                  {importItems.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Importar Itens"}
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isMarkupDialogOpen} onOpenChange={setIsMarkupDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Aplicar Reajuste por Markup</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="markup_percentage_apply">Markup (%)</Label>
                <Input
                  id="markup_percentage_apply"
                  type="number"
                  step="0.01"
                  value={markupPercentage}
                  onChange={(e) => setMarkupPercentage(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Base de cálculo</Label>
                <Select value={markupBase} onValueChange={(value: "cost" | "sale") => setMarkupBase(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cost">Aplicar sobre custo</SelectItem>
                    <SelectItem value="sale">Aplicar sobre preço de venda atual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                O reajuste atualiza todos os itens da tabela de uma vez e também salva esse percentual como markup padrão da tabela.
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsMarkupDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleApplyMarkup} disabled={applyMarkup.isPending}>
                {applyMarkup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aplicar Reajuste"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isCategoryDialogOpen}
          onOpenChange={(open) => {
            setIsCategoryDialogOpen(open);
            if (!open) setEditingCategory(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</DialogTitle>
            </DialogHeader>
            <form key={editingCategory?.id || "new-category"} onSubmit={handleSaveCategory}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="category_name">Nome</Label>
                  <Input id="category_name" name="category_name" defaultValue={editingCategory?.name || ""} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category_description">Descrição</Label>
                  <Textarea id="category_description" name="category_description" defaultValue={editingCategory?.description || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category_sort_order">Ordem</Label>
                  <Input id="category_sort_order" name="category_sort_order" type="number" defaultValue={editingCategory?.sort_order || 0} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={categoryActive} onCheckedChange={setCategoryActive} />
                  <Label>Ativa</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCategoryDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveCategory.isPending}>
                  {saveCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Categoria"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isSubcategoryDialogOpen}
          onOpenChange={(open) => {
            setIsSubcategoryDialogOpen(open);
            if (!open) setEditingSubcategory(null);
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingSubcategory ? "Editar Subcategoria" : "Nova Subcategoria"}</DialogTitle>
            </DialogHeader>
            <form key={editingSubcategory?.id || "new-subcategory"} onSubmit={handleSaveSubcategory}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label>Categoria</Label>
                  <Select value={subcategoryCategoryId} onValueChange={setSubcategoryCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subcategory_name">Nome</Label>
                  <Input id="subcategory_name" name="subcategory_name" defaultValue={editingSubcategory?.name || ""} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subcategory_description">Descrição</Label>
                  <Textarea id="subcategory_description" name="subcategory_description" defaultValue={editingSubcategory?.description || ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subcategory_sort_order">Ordem</Label>
                  <Input id="subcategory_sort_order" name="subcategory_sort_order" type="number" defaultValue={editingSubcategory?.sort_order || 0} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={subcategoryActive} onCheckedChange={setSubcategoryActive} />
                  <Label>Ativa</Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsSubcategoryDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveSubcategory.isPending || !subcategoryCategoryId}>
                  {saveSubcategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Subcategoria"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
