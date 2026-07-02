import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { eadBrandAdminApi, brandAdminToken } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Loader2, Plus, Trash2, Edit, Upload, X, ArrowLeft, Images, FileText, LogOut, GripVertical, Eye, EyeOff,
} from 'lucide-react';
import enerlightLogo from '@/assets/enerlight-logo.png';
import { toast } from 'sonner';

interface Category { id: string; name: string; description?: string; order_index: number; catalog_count?: number; }
interface CatalogImg { url: string; title?: string | null; order?: number; }
interface Catalog {
  id: string; category_id: string | null; category_name?: string;
  title: string; description?: string; type: 'gallery' | 'pdf';
  cover_url?: string | null; images: CatalogImg[]; pdf_url?: string | null;
  order_index: number; active: boolean;
}

export default function EadBrandAdminCatalogs() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Catalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>('');

  const [catDlg, setCatDlg] = useState<{ open: boolean; editing: Category | null; name: string; description: string }>({
    open: false, editing: null, name: '', description: '',
  });
  const [itemDlg, setItemDlg] = useState<{ open: boolean; editing: Catalog | null; form: CatalogFormState }>({
    open: false, editing: null, form: emptyForm(),
  });

  useEffect(() => {
    if (!brandAdminToken.get()) { nav(`/marca/${slug}/admin/login`, { replace: true }); return; }
    Promise.all([eadBrandAdminApi.me(), eadBrandAdminApi.catalogCategories(), eadBrandAdminApi.catalogs()])
      .then(([m, cs, is]) => { setAdmin(m.admin); setCats(cs); setItems(is); })
      .catch(() => { brandAdminToken.clear(); nav(`/marca/${slug}/admin/login`, { replace: true }); })
      .finally(() => setLoading(false));
  }, [slug, nav]);

  async function reloadAll() {
    const [cs, is] = await Promise.all([eadBrandAdminApi.catalogCategories(), eadBrandAdminApi.catalogs(filterCat || undefined)]);
    setCats(cs); setItems(is);
  }
  useEffect(() => { if (!loading) eadBrandAdminApi.catalogs(filterCat || undefined).then(setItems); }, [filterCat, loading]);

  // ---- Categoria
  function openCatNew() { setCatDlg({ open: true, editing: null, name: '', description: '' }); }
  function openCatEdit(c: Category) { setCatDlg({ open: true, editing: c, name: c.name, description: c.description || '' }); }
  async function saveCat() {
    if (!catDlg.name.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      if (catDlg.editing) {
        await eadBrandAdminApi.updateCatalogCategory(catDlg.editing.id, { name: catDlg.name.trim(), description: catDlg.description });
      } else {
        await eadBrandAdminApi.createCatalogCategory({ name: catDlg.name.trim(), description: catDlg.description });
      }
      toast.success('Categoria salva');
      setCatDlg({ open: false, editing: null, name: '', description: '' });
      reloadAll();
    } catch (e: any) { toast.error(e.message || 'Erro'); }
  }
  async function delCat(c: Category) {
    if (!confirm(`Excluir categoria "${c.name}"? Os catálogos ficarão sem categoria.`)) return;
    await eadBrandAdminApi.deleteCatalogCategory(c.id);
    toast.success('Categoria excluída');
    reloadAll();
  }

  // ---- Catálogo
  function openItemNew() { setItemDlg({ open: true, editing: null, form: emptyForm() }); }
  function openItemEdit(it: Catalog) {
    setItemDlg({
      open: true, editing: it,
      form: {
        title: it.title, description: it.description || '',
        category_id: it.category_id || '', type: it.type,
        cover_url: it.cover_url || '', pdf_url: it.pdf_url || '',
        images: (it.images || []).map(x => ({ url: x.url, title: x.title || '' })),
        active: it.active,
      },
    });
  }
  async function saveItem() {
    const f = itemDlg.form;
    if (!f.title.trim()) { toast.error('Título obrigatório'); return; }
    if (f.type === 'pdf' && !f.pdf_url) { toast.error('Envie o PDF'); return; }
    if (f.type === 'gallery' && f.images.length === 0) { toast.error('Adicione ao menos uma imagem'); return; }
    const body: any = {
      title: f.title.trim(), description: f.description || null,
      category_id: f.category_id || null, type: f.type,
      cover_url: f.cover_url || null, pdf_url: f.pdf_url || null,
      images: f.images.map((im, i) => ({ url: im.url, title: im.title || null, order: i })),
      active: f.active,
    };
    try {
      if (itemDlg.editing) await eadBrandAdminApi.updateCatalog(itemDlg.editing.id, body);
      else await eadBrandAdminApi.createCatalog(body);
      toast.success('Catálogo salvo');
      setItemDlg({ open: false, editing: null, form: emptyForm() });
      reloadAll();
    } catch (e: any) { toast.error(e.message || 'Erro'); }
  }
  async function delItem(it: Catalog) {
    if (!confirm(`Excluir catálogo "${it.title}"?`)) return;
    await eadBrandAdminApi.deleteCatalog(it.id);
    toast.success('Catálogo excluído');
    reloadAll();
  }

  const logoUrl = resolveMediaUrl(admin?.brand?.logo_url);
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, #2563eb, #06b6d4, #2563eb)', boxShadow: '0 0 10px rgba(6,182,212,0.6)' }} />
        <div className="max-w-7xl mx-auto px-4 py-3 grid grid-cols-3 items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {logoUrl ? <img src={logoUrl} alt="" className="h-10 w-auto max-w-[140px] object-contain" /> : <div className="h-8 w-8 rounded bg-primary" />}
            <div className="min-w-0 hidden sm:block">
              <div className="text-sm font-semibold truncate">{admin?.brand?.name}</div>
              <div className="text-xs text-muted-foreground">Gestão de catálogos</div>
            </div>
          </div>
          <div className="flex justify-center">
            <img src={enerlightLogo} alt="Enerlight" className="h-8 w-auto opacity-90" />
          </div>
          <div className="flex justify-end gap-1">
            <Link to={`/marca/${slug}/admin`}><Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Dashboard</Button></Link>
            <Button variant="ghost" size="sm" onClick={() => { brandAdminToken.clear(); nav(`/marca/${slug}/admin/login`); }}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6 flex-1 w-full">
        {/* Categorias */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Categorias</CardTitle>
            <Button size="sm" onClick={openCatNew}><Plus className="h-4 w-4 mr-1" /> Nova categoria</Button>
          </CardHeader>
          <CardContent>
            {cats.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">Nenhuma categoria criada.</div>
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nome</TableHead><TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Catálogos</TableHead><TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {cats.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{c.description || '—'}</TableCell>
                      <TableCell className="text-right">{c.catalog_count || 0}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button size="icon" variant="ghost" onClick={() => openCatEdit(c)}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => delCat(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Catálogos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CardTitle>Catálogos</CardTitle>
              <Select value={filterCat || '__all__'} onValueChange={v => setFilterCat(v === '__all__' ? '' : v)}>
                <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Todas as categorias" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as categorias</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={openItemNew}><Plus className="h-4 w-4 mr-1" /> Novo catálogo</Button>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">Nenhum catálogo cadastrado.</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {items.map(it => {
                  const cover = resolveMediaUrl(it.cover_url || (it.type === 'gallery' && it.images?.[0]?.url) || '');
                  return (
                    <Card key={it.id} className="overflow-hidden flex flex-col">
                      <div className="aspect-video bg-muted flex items-center justify-center relative">
                        {cover ? <img src={cover} alt="" className="w-full h-full object-cover" /> :
                          it.type === 'pdf' ? <FileText className="h-12 w-12 text-muted-foreground" /> : <Images className="h-12 w-12 text-muted-foreground" />}
                        <div className="absolute top-2 right-2 flex gap-1">
                          <Badge variant="secondary">{it.type === 'pdf' ? 'PDF' : `${it.images?.length || 0} imgs`}</Badge>
                          {!it.active && <Badge variant="outline"><EyeOff className="h-3 w-3" /></Badge>}
                        </div>
                      </div>
                      <CardContent className="p-3 flex-1 flex flex-col gap-2">
                        <div className="flex-1">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">{it.category_name || 'Sem categoria'}</div>
                          <div className="font-semibold line-clamp-2">{it.title}</div>
                          {it.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{it.description}</div>}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="secondary" className="flex-1" onClick={() => openItemEdit(it)}><Edit className="h-3 w-3 mr-1" /> Editar</Button>
                          <Button size="icon" variant="ghost" onClick={() => delItem(it)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialog Categoria */}
      <Dialog open={catDlg.open} onOpenChange={o => !o && setCatDlg(v => ({ ...v, open: false }))}>
        <DialogContent aria-describedby="cat-desc">
          <DialogHeader>
            <DialogTitle>{catDlg.editing ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription id="cat-desc">Ex.: Linha Residencial, Linha Industrial, Painéis solares…</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={catDlg.name} onChange={e => setCatDlg(v => ({ ...v, name: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Textarea value={catDlg.description} onChange={e => setCatDlg(v => ({ ...v, description: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCatDlg(v => ({ ...v, open: false }))}>Cancelar</Button>
            <Button onClick={saveCat}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Catálogo */}
      <CatalogDialog
        open={itemDlg.open}
        editing={itemDlg.editing}
        form={itemDlg.form}
        setForm={(f) => setItemDlg(v => ({ ...v, form: f }))}
        cats={cats}
        onClose={() => setItemDlg({ open: false, editing: null, form: emptyForm() })}
        onSave={saveItem}
      />
    </div>
  );
}

// ---------- Form state ----------
interface CatalogFormState {
  title: string; description: string; category_id: string;
  type: 'gallery' | 'pdf'; cover_url: string; pdf_url: string;
  images: { url: string; title: string }[]; active: boolean;
}
function emptyForm(): CatalogFormState {
  return { title: '', description: '', category_id: '', type: 'gallery', cover_url: '', pdf_url: '', images: [], active: true };
}

// ---------- Dialog Catálogo ----------
function CatalogDialog({ open, editing, form, setForm, cats, onClose, onSave }: {
  open: boolean; editing: Catalog | null; form: CatalogFormState;
  setForm: (f: CatalogFormState) => void; cats: Category[];
  onClose: () => void; onSave: () => void;
}) {
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadingImgs, setUploadingImgs] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const imgsRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    return (await eadBrandAdminApi.uploadCatalogFile(file)).url;
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploadingCover(true);
    try { const url = await upload(f); setForm({ ...form, cover_url: url }); toast.success('Capa enviada'); }
    catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setUploadingCover(false); if (coverRef.current) coverRef.current.value = ''; }
  }
  async function pickPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setUploadingPdf(true);
    try { const url = await upload(f); setForm({ ...form, pdf_url: url }); toast.success('PDF enviado'); }
    catch (err: any) { toast.error(err.message || 'Erro'); }
    finally { setUploadingPdf(false); if (pdfRef.current) pdfRef.current.value = ''; }
  }
  async function pickImgs(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingImgs(true);
    const added: { url: string; title: string }[] = [];
    for (const f of files) {
      try { const url = await upload(f); added.push({ url, title: f.name.replace(/\.[^.]+$/, '') }); }
      catch (err: any) { toast.error(`${f.name}: ${err.message || 'erro'}`); }
    }
    setForm({ ...form, images: [...form.images, ...added] });
    setUploadingImgs(false);
    if (imgsRef.current) imgsRef.current.value = '';
    if (added.length) toast.success(`${added.length} imagem(ns) enviada(s)`);
  }
  function removeImg(i: number) {
    const next = form.images.filter((_, idx) => idx !== i);
    setForm({ ...form, images: next });
  }
  function moveImg(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= form.images.length) return;
    const arr = [...form.images];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setForm({ ...form, images: arr });
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby="cat-item-desc">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar catálogo' : 'Novo catálogo'}</DialogTitle>
          <DialogDescription id="cat-item-desc">
            Escolha o tipo: galeria de imagens (instalador passa uma a uma) ou PDF pronto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Título</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id || '__none__'} onValueChange={v => setForm({ ...form, category_id: v === '__none__' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem categoria</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gallery">Galeria de imagens</SelectItem>
                  <SelectItem value="pdf">PDF pronto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.active ? 'on' : 'off'} onValueChange={v => setForm({ ...form, active: v === 'on' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="on">Ativo (visível para instaladores)</SelectItem>
                  <SelectItem value="off">Rascunho (oculto)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Capa (opcional)</Label>
            <div className="flex items-center gap-2 mt-1">
              {form.cover_url && <img src={resolveMediaUrl(form.cover_url) || ''} alt="" className="h-14 w-14 object-cover rounded border" />}
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={pickCover} />
              <Button type="button" variant="secondary" size="sm" disabled={uploadingCover} onClick={() => coverRef.current?.click()}>
                {uploadingCover ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                {form.cover_url ? 'Trocar capa' : 'Enviar capa'}
              </Button>
              {form.cover_url && <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, cover_url: '' })}><X className="h-4 w-4" /></Button>}
            </div>
          </div>

          {form.type === 'pdf' ? (
            <div>
              <Label>Arquivo PDF</Label>
              <div className="flex items-center gap-2 mt-1">
                <input ref={pdfRef} type="file" accept="application/pdf" className="hidden" onChange={pickPdf} />
                <Button type="button" variant="secondary" size="sm" disabled={uploadingPdf} onClick={() => pdfRef.current?.click()}>
                  {uploadingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {form.pdf_url ? 'Trocar PDF' : 'Enviar PDF'}
                </Button>
                {form.pdf_url && (
                  <>
                    <a href={resolveMediaUrl(form.pdf_url) || '#'} target="_blank" rel="noreferrer" className="text-sm text-primary underline truncate max-w-[200px]">Ver PDF atual</a>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm({ ...form, pdf_url: '' })}><X className="h-4 w-4" /></Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Imagens da galeria ({form.images.length})</Label>
                <div>
                  <input ref={imgsRef} type="file" accept="image/*" multiple className="hidden" onChange={pickImgs} />
                  <Button type="button" variant="secondary" size="sm" disabled={uploadingImgs} onClick={() => imgsRef.current?.click()}>
                    {uploadingImgs ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                    Adicionar imagens
                  </Button>
                </div>
              </div>
              {form.images.length === 0 ? (
                <div className="border border-dashed rounded-lg p-6 text-center text-sm text-muted-foreground">
                  Nenhuma imagem. Envie os slides do catálogo — o instalador poderá passar uma a uma e baixar tudo em PDF.
                </div>
              ) : (
                <div className="space-y-2">
                  {form.images.map((im, i) => (
                    <div key={i} className="flex items-center gap-2 border rounded p-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <img src={resolveMediaUrl(im.url) || ''} alt="" className="h-14 w-14 rounded object-cover border" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground truncate">{i + 1}/{form.images.length}</div>
                        <Input
                          value={im.title}
                          placeholder="Título / legenda (opcional)"
                          onChange={e => {
                            const arr = [...form.images]; arr[i] = { ...arr[i], title: e.target.value };
                            setForm({ ...form, images: arr });
                          }}
                          className="h-8 mt-1"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveImg(i, -1)} disabled={i === 0}>↑</Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => moveImg(i, 1)} disabled={i === form.images.length - 1}>↓</Button>
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => removeImg(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave}>Salvar catálogo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
