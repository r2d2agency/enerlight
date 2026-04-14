import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useLicitacaoAIConfig, useSaveLicitacaoAIConfig,
  useLicitacaoAIProducts, useCreateLicitacaoAIProduct, useUpdateLicitacaoAIProduct, useDeleteLicitacaoAIProduct, useImportLicitacaoAIProducts,
  LicitacaoAIConfig, LicitacaoAIProduct,
} from "@/hooks/use-licitacao-ai";
import {
  Sparkles, Save, Loader2, Plus, Trash2, Edit, Package, Settings2, Brain, Eye, EyeOff, Upload, X, Check
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AI_MODELS: Record<string, { id: string; name: string }[]> = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o (Recomendado)" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini (Econômico)" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (Recomendado)" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  ],
};

export function LicitacaoAIConfigDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: config, isLoading: loadingConfig } = useLicitacaoAIConfig();
  const saveConfig = useSaveLicitacaoAIConfig();
  const { data: products = [], isLoading: loadingProducts } = useLicitacaoAIProducts();
  const createProduct = useCreateLicitacaoAIProduct();
  const updateProduct = useUpdateLicitacaoAIProduct();
  const deleteProduct = useDeleteLicitacaoAIProduct();
  const importProducts = useImportLicitacaoAIProducts();

  const [form, setForm] = useState<Partial<LicitacaoAIConfig>>({
    is_enabled: false,
    use_org_ai_config: true,
    ai_provider: "openai",
    ai_model: "gpt-4o-mini",
    ai_api_key: null,
    analysis_prompt: "Você é um especialista em licitações públicas brasileiras. Analise o edital fornecido e extraia informações detalhadas.",
    compliance_prompt: "Compare os produtos/serviços da empresa com os itens do edital e identifique quais itens podem ser atendidos.",
    max_tokens: 4000,
    temperature: 0.3,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [productForm, setProductForm] = useState({ code: "", name: "", description: "", category: "", specifications: "", unit: "", unit_price: "", brand: "" });
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        is_enabled: config.is_enabled ?? false,
        use_org_ai_config: config.use_org_ai_config ?? true,
        ai_provider: config.ai_provider || "openai",
        ai_model: config.ai_model || "gpt-4o-mini",
        ai_api_key: config.ai_api_key,
        analysis_prompt: config.analysis_prompt || "",
        compliance_prompt: config.compliance_prompt || "",
        max_tokens: config.max_tokens || 4000,
        temperature: config.temperature || 0.3,
      });
    }
  }, [config]);

  const handleSaveConfig = async () => {
    try {
      await saveConfig.mutateAsync(form);
      toast({ title: "Configuração salva!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateProduct = async () => {
    if (!productForm.name.trim()) return;
    try {
      if (editingProductId) {
        await updateProduct.mutateAsync({ id: editingProductId, ...productForm, unit_price: productForm.unit_price ? Number(productForm.unit_price) : null });
      } else {
        await createProduct.mutateAsync({ ...productForm, unit_price: productForm.unit_price ? Number(productForm.unit_price) : null } as any);
      }
      setProductForm({ code: "", name: "", description: "", category: "", specifications: "", unit: "", unit_price: "", brand: "" });
      setShowProductForm(false);
      setEditingProductId(null);
      toast({ title: editingProductId ? "Produto atualizado!" : "Produto adicionado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  const handleEditProduct = (p: LicitacaoAIProduct) => {
    setProductForm({
      code: p.code || "", name: p.name, description: p.description || "",
      category: p.category || "", specifications: p.specifications || "",
      unit: p.unit || "", unit_price: p.unit_price ? String(p.unit_price) : "", brand: p.brand || "",
    });
    setEditingProductId(p.id);
    setShowProductForm(true);
  };

  const handleImportProducts = async () => {
    if (!importText.trim()) return;
    try {
      // Parse CSV-like text: code;name;description;category;specifications;unit;price;brand
      const lines = importText.trim().split("\n");
      const productsToImport = lines.map(line => {
        const parts = line.split(";").map(s => s.trim());
        return {
          code: parts[0] || null,
          name: parts[1] || parts[0],
          description: parts[2] || null,
          category: parts[3] || null,
          specifications: parts[4] || null,
          unit: parts[5] || null,
          unit_price: parts[6] ? Number(parts[6]) : null,
          brand: parts[7] || null,
        };
      }).filter(p => p.name);

      if (productsToImport.length === 0) {
        toast({ title: "Nenhum produto válido encontrado", variant: "destructive" });
        return;
      }

      const result = await importProducts.mutateAsync(productsToImport as any[]);
      setImportText("");
      setShowImport(false);
      toast({ title: `${result.imported} produtos importados!` });
    } catch (e: any) {
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    }
  };

  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            IA para Licitações — Configuração
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="config" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="config" className="flex-1"><Settings2 className="h-3.5 w-3.5 mr-1" /> Configuração</TabsTrigger>
            <TabsTrigger value="products" className="flex-1"><Package className="h-3.5 w-3.5 mr-1" /> Produtos ({products.length})</TabsTrigger>
            <TabsTrigger value="prompts" className="flex-1"><Sparkles className="h-3.5 w-3.5 mr-1" /> Prompts</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 max-h-[calc(85vh-180px)]">
            {/* CONFIG TAB */}
            <TabsContent value="config" className="space-y-4 m-0 pr-2">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Habilitar IA para Licitações</p>
                  <p className="text-xs text-muted-foreground">Ativa a análise de editais por inteligência artificial</p>
                </div>
                <Switch checked={form.is_enabled} onCheckedChange={v => setForm(p => ({ ...p, is_enabled: v }))} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="text-sm font-medium">Usar configuração global de IA</p>
                  <p className="text-xs text-muted-foreground">
                    Utiliza a API Key configurada nas Configurações da organização
                    {config?.org_has_ai_key && <Badge variant="outline" className="ml-2 text-[10px]">Configurada ✓</Badge>}
                  </p>
                </div>
                <Switch checked={form.use_org_ai_config} onCheckedChange={v => setForm(p => ({ ...p, use_org_ai_config: v }))} />
              </div>

              {!form.use_org_ai_config && (
                <div className="space-y-3 border rounded-lg p-3">
                  <p className="text-sm font-medium">Configuração dedicada</p>
                  <div>
                    <Label>Provedor</Label>
                    <Select value={form.ai_provider} onValueChange={v => setForm(p => ({ ...p, ai_provider: v, ai_model: AI_MODELS[v]?.[0]?.id || "" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="gemini">Google Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Modelo</Label>
                    <Select value={form.ai_model} onValueChange={v => setForm(p => ({ ...p, ai_model: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(AI_MODELS[form.ai_provider || "openai"] || []).map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>API Key</Label>
                    <div className="relative">
                      <Input
                        type={showApiKey ? "text" : "password"}
                        value={form.ai_api_key || ""}
                        onChange={e => setForm(p => ({ ...p, ai_api_key: e.target.value }))}
                        placeholder="sk-..."
                      />
                      <Button variant="ghost" size="icon" className="absolute right-1 top-1 h-7 w-7" onClick={() => setShowApiKey(!showApiKey)}>
                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Max Tokens</Label>
                  <Input type="number" value={form.max_tokens} onChange={e => setForm(p => ({ ...p, max_tokens: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label>Temperatura ({form.temperature})</Label>
                  <Input type="range" min="0" max="1" step="0.1" value={form.temperature} onChange={e => setForm(p => ({ ...p, temperature: Number(e.target.value) }))} className="mt-2" />
                </div>
              </div>

              <Button onClick={handleSaveConfig} disabled={saveConfig.isPending} className="w-full">
                {saveConfig.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar Configuração
              </Button>
            </TabsContent>

            {/* PRODUCTS TAB */}
            <TabsContent value="products" className="space-y-3 m-0 pr-2">
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setShowProductForm(true); setEditingProductId(null); setProductForm({ code: "", name: "", description: "", category: "", specifications: "", unit: "", unit_price: "", brand: "" }); }}>
                  <Plus className="h-4 w-4 mr-1" /> Novo Produto
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowImport(!showImport)}>
                  <Upload className="h-4 w-4 mr-1" /> Importar
                </Button>
              </div>

              {showImport && (
                <div className="border rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Cole os produtos separados por linha. Formato CSV com <code>;</code>: código;nome;descrição;categoria;especificações;unidade;preço;marca
                  </p>
                  <Textarea value={importText} onChange={e => setImportText(e.target.value)} rows={5} placeholder={"001;Painel Solar 550W;Painel monocristalino 550W;Energia Solar;550W, 41V;un;850.00;Canadian\n002;Inversor 5kW;Inversor string 5kW;Energia Solar;5kW, 220V;un;3200.00;Growatt"} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleImportProducts} disabled={importProducts.isPending}>
                      {importProducts.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                      Importar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>Cancelar</Button>
                  </div>
                </div>
              )}

              {showProductForm && (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <p className="text-sm font-medium">{editingProductId ? "Editar" : "Novo"} Produto</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Código</Label><Input value={productForm.code} onChange={e => setProductForm(p => ({ ...p, code: e.target.value }))} placeholder="SKU001" className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Nome *</Label><Input value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} placeholder="Painel Solar 550W" className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Categoria</Label><Input value={productForm.category} onChange={e => setProductForm(p => ({ ...p, category: e.target.value }))} placeholder="Energia Solar" className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Marca</Label><Input value={productForm.brand} onChange={e => setProductForm(p => ({ ...p, brand: e.target.value }))} placeholder="Canadian" className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Unidade</Label><Input value={productForm.unit} onChange={e => setProductForm(p => ({ ...p, unit: e.target.value }))} placeholder="un" className="h-8 text-sm" /></div>
                    <div><Label className="text-xs">Preço</Label><Input type="number" value={productForm.unit_price} onChange={e => setProductForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="0,00" className="h-8 text-sm" /></div>
                  </div>
                  <div><Label className="text-xs">Descrição</Label><Textarea value={productForm.description} onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))} rows={2} className="text-sm" placeholder="Descrição detalhada do produto" /></div>
                  <div><Label className="text-xs">Especificações Técnicas</Label><Textarea value={productForm.specifications} onChange={e => setProductForm(p => ({ ...p, specifications: e.target.value }))} rows={2} className="text-sm" placeholder="550W, Monocristalino, 41V..." /></div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateProduct} disabled={createProduct.isPending || updateProduct.isPending}>
                      {editingProductId ? "Salvar" : "Adicionar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowProductForm(false); setEditingProductId(null); }}>Cancelar</Button>
                  </div>
                </div>
              )}

              {loadingProducts ? (
                <div className="text-center py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
              ) : products.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground space-y-2">
                  <Package className="h-8 w-8 mx-auto opacity-40" />
                  <p className="text-sm">Nenhum produto cadastrado</p>
                  <p className="text-xs">Adicione os produtos da sua empresa para a IA comparar com os editais</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {categories.length > 0 && categories.map(cat => (
                    <div key={cat as string} className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground mt-3 mb-1">{cat}</p>
                      {products.filter(p => p.category === cat).map(p => (
                        <ProductRow key={p.id} product={p} onEdit={() => handleEditProduct(p)} onDelete={() => deleteProduct.mutate(p.id)} />
                      ))}
                    </div>
                  ))}
                  {products.filter(p => !p.category).length > 0 && (
                    <div className="space-y-1">
                      {categories.length > 0 && <p className="text-xs font-medium text-muted-foreground mt-3 mb-1">Sem categoria</p>}
                      {products.filter(p => !p.category).map(p => (
                        <ProductRow key={p.id} product={p} onEdit={() => handleEditProduct(p)} onDelete={() => deleteProduct.mutate(p.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* PROMPTS TAB */}
            <TabsContent value="prompts" className="space-y-4 m-0 pr-2">
              <div>
                <Label>Prompt de Análise de Edital</Label>
                <p className="text-xs text-muted-foreground mb-2">Instruções para a IA ao analisar o edital. Quanto mais detalhado, melhor o resultado.</p>
                <Textarea
                  value={form.analysis_prompt}
                  onChange={e => setForm(p => ({ ...p, analysis_prompt: e.target.value }))}
                  rows={6}
                  placeholder="Você é um especialista em licitações públicas brasileiras..."
                />
              </div>
              <div>
                <Label>Prompt de Conformidade / Produtos</Label>
                <p className="text-xs text-muted-foreground mb-2">Instruções para comparar os produtos da empresa com os itens do edital.</p>
                <Textarea
                  value={form.compliance_prompt}
                  onChange={e => setForm(p => ({ ...p, compliance_prompt: e.target.value }))}
                  rows={4}
                  placeholder="Compare os produtos da empresa com os itens do edital..."
                />
              </div>
              <Button onClick={handleSaveConfig} disabled={saveConfig.isPending} className="w-full">
                {saveConfig.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar Prompts
              </Button>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ProductRow({ product, onEdit, onDelete }: { product: LicitacaoAIProduct; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border group hover:bg-muted/30">
      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {product.code && <span className="text-muted-foreground mr-1">[{product.code}]</span>}
          {product.name}
        </p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {product.brand && <span>{product.brand}</span>}
          {product.unit_price && <span>R$ {Number(product.unit_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
          {product.unit && <span>/{product.unit}</span>}
        </div>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={onEdit}><Edit className="h-3 w-3" /></Button>
      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
    </div>
  );
}
