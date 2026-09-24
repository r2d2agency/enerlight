import { useEffect, useMemo, useState } from 'react';
import { Copy, Download, Eye, FileText, Grid2X2, Image, Link as LinkIcon, List, Loader2, Megaphone, Search, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { comercialExternalApi, comercialInternalApi, ComercialMarketingMaterial } from '@/lib/comercial-api';
import { resolveMediaUrl } from '@/lib/media';
import ComercialLayout from './ComercialLayout';

export default function ComercialMarketing({ internal = false }: { internal?: boolean }) {
  if (internal) return <MarketingContent internal />;
  return <ComercialLayout>{() => <MarketingContent />}</ComercialLayout>;
}

function MarketingContent({ internal = false }: { internal?: boolean }) {
  const [items, setItems] = useState<ComercialMarketingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [tag, setTag] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem('marketing-view') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; }
  });
  const [preview, setPreview] = useState<ComercialMarketingMaterial | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const apiClient = internal ? comercialInternalApi : comercialExternalApi;

  useEffect(() => {
    apiClient.listMarketingMaterials().then((res) => setItems(res.materials)).catch((e) => setError(e.message || 'Não foi possível carregar os materiais.')).finally(() => setLoading(false));
  }, [internal]);

  const categories = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    items.forEach((item) => {
      if (typeof item.category === 'string') byId.set(item.category, { id: item.category, name: item.category });
      else if (item.category) byId.set(item.category.id, item.category);
    });
    return [...byId.values()];
  }, [items]);
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags || []))].sort(), [items]);
  const filtered = items.filter((item) => {
    const categoryId = typeof item.category === 'string' ? item.category : item.category?.id;
    return (category === 'all' || categoryId === category)
      && (tag === 'all' || item.tags?.includes(tag))
      && (!search || `${item.title} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  });
  const setViewMode = (mode: 'grid' | 'list') => {
    setView(mode);
    try { localStorage.setItem('marketing-view', mode); } catch { /* Storage is optional. */ }
  };
  const download = async (item: ComercialMarketingMaterial) => {
    if (item.material_type === 'link') { window.open(resolveMediaUrl(item.file_url), '_blank', 'noopener,noreferrer'); return; }
    setDownloading(item.id);
    try {
      const result = await apiClient.downloadMarketingMaterial(item.id);
      const url = result.url || result.file_url;
      if (!url) throw new Error('Arquivo indisponível');
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename || item.title; anchor.target = '_blank'; anchor.click();
    } catch (e: any) { setError(e.message || 'Não foi possível baixar o material.'); } finally { setDownloading(null); }
  };
  const copy = async (text?: string | null) => { if (text) await navigator.clipboard.writeText(text); };
  const icon = (type?: string | null) => type === 'video' ? <Video className="h-5 w-5" /> : type === 'image' ? <Image className="h-5 w-5" /> : type === 'link' ? <LinkIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />;
  const previewType = (item: ComercialMarketingMaterial) => item.material_type === 'video' ? 'video' : item.material_type === 'image' || item.mime_type?.startsWith('image/') ? 'image' : item.mime_type === 'application/pdf' ? 'pdf' : 'other';

  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Megaphone className="h-6 w-6 text-primary" />Marketing</h1><p className="text-muted-foreground">Biblioteca de materiais por categoria, tag e formato.</p></div>
    {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>}
    {error && <p className="text-destructive">{error}</p>}
    {!loading && !error && <>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant={category === 'all' ? 'default' : 'outline'} onClick={() => setCategory('all')}>Todos</Button>{categories.map((c) => <Button key={c.id} size="sm" variant={category === c.id ? 'default' : 'outline'} onClick={() => setCategory(c.id)}>{c.name}</Button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar material" value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="rounded-md border bg-background p-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)}><option value="all">Todas as tags</option>{tags.map((t) => <option key={t}>{t}</option>)}</select><Button size="icon" variant={view === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')}><Grid2X2 className="h-4 w-4" /></Button><Button size="icon" variant={view === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button></div>
      {filtered.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum material encontrado com esses filtros.</CardContent></Card>}
      <div className={view === 'grid' ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' : 'space-y-3'}>
        {filtered.map((item) => <Card key={item.id} className={view === 'list' ? 'flex items-center gap-4 p-3' : ''}>
          {item.thumbnail_url ? <img src={resolveMediaUrl(item.thumbnail_url) || undefined} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); }} className={view === 'grid' ? 'h-40 w-full rounded-t object-cover' : 'h-20 w-28 rounded object-cover'} /> : null}<div className={`${view === 'grid' ? 'h-40 w-full rounded-t' : 'h-20 w-28 rounded'} hidden items-center justify-center bg-muted text-muted-foreground`}>{icon(item.material_type)}</div>
          <div className="min-w-0 flex-1"><CardHeader className={view === 'list' ? 'p-0' : ''}><CardTitle className="flex gap-2 text-base">{icon(item.material_type)}{item.title}</CardTitle></CardHeader><CardContent className={view === 'list' ? 'p-0' : 'space-y-3'}>
            <p className="text-sm text-muted-foreground">{item.description || 'Material comercial'}</p><div className="flex flex-wrap gap-1">{item.tags?.map((t) => <Badge key={t} variant="secondary">#{t}</Badge>)}</div>
            {item.copy_text && <p className="line-clamp-2 whitespace-pre-wrap rounded bg-muted p-2 text-xs">{item.copy_text}</p>}
            <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setPreview(item)}><Eye className="mr-1 h-4 w-4" />Visualizar</Button>{item.copy_text && <Button size="sm" variant="outline" onClick={() => copy(item.copy_text)}><Copy className="mr-1 h-4 w-4" />Copiar copy</Button>}<Button size="sm" onClick={() => download(item)} disabled={downloading === item.id}><Download className="mr-1 h-4 w-4" />{downloading === item.id ? 'Baixando...' : 'Baixar'}</Button></div>
          </CardContent></div>
        </Card>)}
      </div>
    </>}
    <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>{preview && <div className="space-y-4">{previewType(preview) === 'image' && <img src={resolveMediaUrl(preview.file_url)} alt={preview.title} className="max-h-[65vh] w-full object-contain" />}{previewType(preview) === 'video' && <video src={resolveMediaUrl(preview.file_url)} controls className="max-h-[65vh] w-full" />}{previewType(preview) === 'pdf' && <iframe src={resolveMediaUrl(preview.file_url)} title={preview.title} className="h-[65vh] w-full" />}{previewType(preview) === 'other' && <div className="rounded border p-6 text-center text-muted-foreground">Este formato não possui prévia no navegador. Use Baixar para acessar o arquivo.</div>}{preview.copy_text && <div className="whitespace-pre-wrap rounded bg-muted p-4 text-sm">{preview.copy_text}</div>}</div>}</DialogContent></Dialog>
  </div>;
}
