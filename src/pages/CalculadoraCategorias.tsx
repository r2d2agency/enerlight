import { useMemo, useState } from "react";
import { useCalcCategoriesAdmin, type CalcCategory } from "@/hooks/use-calc-categories";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Pencil, Trash2, Plus, FolderPlus, Lightbulb } from "lucide-react";
import { toast } from "sonner";

const ICON_OPTIONS = ["Building2","Briefcase","Home","Zap","Monitor","ShieldCheck","Ruler","Layout","Lightbulb"];

interface FormState {
  id?: string;
  parent_id: string | null;
  name: string;
  slug: string;
  lux: number;
  icon: string;
  scope: "indoor" | "public_lighting";
  pole_height_min: number | null;
  pole_height_max: number | null;
  pole_uniformity: number | null;
  position: number;
  is_active: boolean;
}

const emptyForm = (scope: "indoor" | "public_lighting" = "indoor"): FormState => ({
  parent_id: null,
  name: "",
  slug: "",
  lux: 300,
  icon: "Building2",
  scope,
  pole_height_min: scope === "public_lighting" ? 6 : null,
  pole_height_max: scope === "public_lighting" ? 9 : null,
  pole_uniformity: scope === "public_lighting" ? 0.25 : null,
  position: 0,
  is_active: true,
});

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);

export default function CalculadoraCategorias() {
  const { items, loading, create, update, remove } = useCalcCategoriesAdmin();
  const [tab, setTab] = useState<"indoor" | "public_lighting">("indoor");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());

  const grouped = useMemo(() => {
    const filtered = items.filter(i => i.scope === tab);
    const roots = filtered.filter(i => !i.parent_id);
    return roots.map(r => ({
      root: r,
      children: filtered.filter(i => i.parent_id === r.id),
    }));
  }, [items, tab]);

  const parentOptions = useMemo(
    () => items.filter(i => i.scope === tab && !i.parent_id),
    [items, tab]
  );

  const openCreate = (parent_id: string | null = null) => {
    setForm({ ...emptyForm(tab), parent_id });
    setOpen(true);
  };
  const openEdit = (c: CalcCategory) => {
    setForm({
      id: c.id,
      parent_id: c.parent_id,
      name: c.name,
      slug: c.slug,
      lux: c.lux,
      icon: c.icon || "Building2",
      scope: c.scope,
      pole_height_min: c.pole_height_min,
      pole_height_max: c.pole_height_max,
      pole_uniformity: c.pole_uniformity,
      position: c.position,
      is_active: c.is_active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Nome obrigatório");
    const payload: Partial<CalcCategory> = {
      ...form,
      slug: form.slug.trim() || slugify(form.name),
    };
    try {
      if (form.id) await update(form.id, payload);
      else await create(payload);
      toast.success("Categoria salva");
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    }
  };

  const handleDelete = async (c: CalcCategory) => {
    if (!confirm(`Excluir "${c.name}"? Subcategorias também serão removidas.`)) return;
    try {
      await remove(c.id);
      toast.success("Excluído");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir");
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-6 w-6 text-primary" />
            Categorias da Calculadora Luminotécnica
          </h1>
          <p className="text-muted-foreground text-sm">
            Gerencie ambientes, subcategorias (ex: Petro › Pista, Loja, Troca de Óleo) e iluminação pública por altura de poste.
          </p>
        </div>
        <Button onClick={() => openCreate(null)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova categoria
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="indoor">Ambientes Internos</TabsTrigger>
          <TabsTrigger value="public_lighting">Iluminação Pública</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4 mt-4">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {grouped.map(({ root, children }) => (
            <Card key={root.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    {root.name}
                    {!root.is_active && <Badge variant="outline">Inativa</Badge>}
                  </CardTitle>
                  <CardDescription className="flex gap-3 flex-wrap text-xs mt-1">
                    <span>slug: {root.slug}</span>
                    <span>{root.lux} lux</span>
                    {root.scope === "public_lighting" && (
                      <span>
                        Poste {root.pole_height_min}–{root.pole_height_max}m · U≥{root.pole_uniformity}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openCreate(root.id)} title="Adicionar subcategoria">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(root)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(root)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              {children.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-1 border-l-2 border-muted pl-4">
                    {children.map(ch => (
                      <div key={ch.id} className="flex items-center justify-between gap-3 py-1.5">
                        <div>
                          <div className="text-sm font-medium">
                            {ch.name}{" "}
                            {!ch.is_active && <Badge variant="outline" className="text-[10px]">Inativa</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {ch.lux} lux · {ch.slug}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(ch)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(ch)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}

          {!loading && grouped.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-12">
              Nenhuma categoria. Clique em "Nova categoria" para começar.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="cat-desc" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar categoria" : "Nova categoria"}</DialogTitle>
            <DialogDescription id="cat-desc">
              Defina o ambiente e o nível de iluminância (lux) recomendado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name}
                onChange={(e) => setForm(f => ({
                  ...f, name: e.target.value,
                  slug: f.id ? f.slug : slugify(e.target.value),
                }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Slug (id interno)</Label>
                <Input value={form.slug} onChange={(e) => setForm(f => ({ ...f, slug: slugify(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Lux recomendado</Label>
                <Input type="number" value={form.lux}
                  onChange={(e) => setForm(f => ({ ...f, lux: Number(e.target.value) }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.scope} onValueChange={(v: any) => setForm(f => ({ ...f, scope: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Ambiente Interno</SelectItem>
                    <SelectItem value="public_lighting">Iluminação Pública</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ícone</Label>
                <Select value={form.icon} onValueChange={(v) => setForm(f => ({ ...f, icon: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categoria pai (opcional)</Label>
              <Select
                value={form.parent_id || "none"}
                onValueChange={(v) => setForm(f => ({ ...f, parent_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma (categoria raiz)</SelectItem>
                  {parentOptions.filter(p => p.id !== form.id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.scope === "public_lighting" && (
              <div className="grid grid-cols-3 gap-3 p-3 rounded-md bg-muted/40">
                <div className="space-y-2">
                  <Label className="text-xs">Poste min (m)</Label>
                  <Input type="number" step="0.5" value={form.pole_height_min ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, pole_height_min: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Poste max (m)</Label>
                  <Input type="number" step="0.5" value={form.pole_height_max ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, pole_height_max: e.target.value ? Number(e.target.value) : null }))} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Uniformidade (U)</Label>
                  <Input type="number" step="0.05" value={form.pole_uniformity ?? ""}
                    onChange={(e) => setForm(f => ({ ...f, pole_uniformity: e.target.value ? Number(e.target.value) : null }))} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Posição (ordem)</Label>
                <Input type="number" value={form.position}
                  onChange={(e) => setForm(f => ({ ...f, position: Number(e.target.value) }))} />
              </div>
              <div className="flex items-end gap-2 pb-2">
                <Switch checked={form.is_active}
                  onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Ativa</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
