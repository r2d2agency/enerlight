import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Copy, Download, Eye, FileText, Grid2X2, Image, Link as LinkIcon, List, Loader2, Megaphone, Search, Send, SlidersHorizontal, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { comercialExternalApi, comercialInternalApi, ComercialMarketingMaterial } from '@/lib/comercial-api';
import { resolveMediaUrl } from '@/lib/media';
import ComercialLayout from './ComercialLayout';

const formatLabel = (item: ComercialMarketingMaterial) => {
  if (item.material_type === 'video') return 'Vídeo';
  if (item.material_type === 'image') return item.mime_type?.includes('png') ? 'PNG' : 'Imagem';
  if (item.material_type === 'link') return 'Link';
  if (item.mime_type === 'application/pdf' || item.material_type === 'document') return 'PDF';
  if (item.mime_type?.includes('presentation')) return 'PPT';
  return 'Material';
};

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
  const [format, setFormat] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState<'grid' | 'list'>(() => { try { return (localStorage.getItem('marketing-view') as 'grid' | 'list') || 'grid'; } catch { return 'grid'; } });
  const [preview, setPreview] = useState<ComercialMarketingMaterial | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const apiClient = internal ? comercialInternalApi : comercialExternalApi;

  const load = () => {
    setLoading(true); setError('');
    apiClient.listMarketingMaterials().then((res) => setItems(res.materials || [])).catch((e) => setError(e.message || 'Não foi possível carregar os materiais.')).finally(() => setLoading(false));
  };
  useEffect(load, [internal]);

  const categories = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    items.forEach((item) => { if (typeof item.category === 'string') byId.set(item.category, { id: item.category, name: item.category }); else if (item.category) byId.set(item.category.id, item.category); });
    return [...byId.values()];
  }, [items]);
  const tags = useMemo(() => [...new Set(items.flatMap((item) => item.tags || []))].sort(), [items]);
  const featured = items.find((item) => item.thumbnail_url) || items[0];
  const filtered = useMemo(() => items.filter((item) => {
    const categoryId = typeof item.category === 'string' ? item.category : item.category?.id;
    const haystack = `${item.title} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    return (category === 'all' || categoryId === category) && (tag === 'all' || item.tags?.includes(tag)) && (format === 'all' || formatLabel(item) === format) && (!search || haystack.includes(search.toLowerCase()));
  }).sort((a, b) => sort === 'alphabetical' ? a.title.localeCompare(b.title) : sort === 'downloads' ? 0 : (b.position || 0) - (a.position || 0)), [items, category, tag, format, search, sort]);

  const setViewMode = (mode: 'grid' | 'list') => { setView(mode); try { localStorage.setItem('marketing-view', mode); } catch { /* optional */ } };
  const download = async (item: ComercialMarketingMaterial) => {
    if (item.material_type === 'link') { window.open(resolveMediaUrl(item.file_url), '_blank', 'noopener,noreferrer'); return; }
    setDownloading(item.id);
    try { const result = await apiClient.downloadMarketingMaterial(item.id); const url = result.url || result.file_url; if (!url) throw new Error('Arquivo indisponível'); const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename || item.title; anchor.target = '_blank'; anchor.click(); } catch (e: any) { setError(e.message || 'Não foi possível baixar o material.'); } finally { setDownloading(null); }
  };
  const copy = async (text?: string | null) => { if (text) await navigator.clipboard.writeText(text); };
  const icon = (type?: string | null) => type === 'video' ? <Video className="h-5 w-5" /> : type === 'image' ? <Image className="h-5 w-5" /> : type === 'link' ? <LinkIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />;
  const previewType = (item: ComercialMarketingMaterial) => item.material_type === 'video' ? 'video' : item.material_type === 'image' || item.mime_type?.startsWith('image/') ? 'image' : item.mime_type === 'application/pdf' ? 'pdf' : 'other';
  const surface = internal ? 'border-[#22314A] bg-[#101927]' : '';
  const muted = internal ? 'text-[#9FB0C9]' : 'text-muted-foreground';

  return <div className={internal ? 'min-h-[calc(100vh-3rem)] -m-4 space-y-6 bg-[#0A101A] p-4 text-[#F4F8FF] sm:-m-6 sm:p-6 lg:-m-7 lg:p-7' : 'space-y-6'}>
    <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className={internal ? 'mb-2 text-xs font-semibold uppercase tracking-[.18em] text-[#58A6FF]' : 'mb-2 text-xs font-semibold uppercase tracking-[.18em] text-primary'}>Biblioteca comercial</p><h1 className={internal ? 'flex items-center gap-2 text-3xl font-bold tracking-tight' : 'flex items-center gap-2 text-2xl font-semibold'}><Megaphone className="h-6 w-6 text-[#58A6FF]" />Central de Marketing</h1><p className={`mt-2 ${muted}`}>Materiais para apresentar, vender e fechar.</p></div><Button className={internal ? 'bg-[#297BFF] text-white hover:bg-[#1769E8]' : ''}><Send className="mr-2 h-4 w-4" />Solicitar material</Button></header>
    {loading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((key) => <div key={key} className={`h-72 animate-pulse rounded-xl ${internal ? 'bg-[#101927]' : 'bg-muted'}`} />)}</div>}
    {error && <Card className={surface}><CardContent className="flex flex-col items-center gap-3 py-12 text-center"><p className="text-red-400">{error}</p><Button variant="outline" onClick={load}>Tentar novamente</Button></CardContent></Card>}
    {!loading && !error && <>
      {featured && <Card className={`overflow-hidden ${surface}`}><div className="grid lg:grid-cols-[minmax(280px,1fr)_1.2fr]">{featured.thumbnail_url ? <img src={resolveMediaUrl(featured.thumbnail_url) || undefined} alt={featured.title} className="h-56 w-full object-cover lg:h-full" /> : <div className="flex h-56 items-center justify-center bg-[#123968] text-[#58A6FF] lg:h-full">{icon(featured.material_type)}</div>}<div className="flex flex-col justify-center gap-4 p-6 lg:p-8"><Badge className="w-fit border-[#297BFF]/30 bg-[#297BFF]/15 text-[#58A6FF]">Material em destaque</Badge><div><h2 className="text-2xl font-bold">{featured.title}</h2><p className={`mt-2 ${muted}`}>{featured.description || 'Conteúdo comercial pronto para sua próxima apresentação.'}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{formatLabel(featured)}</Badge>{featured.tags?.slice(0, 3).map((itemTag) => <Badge key={itemTag} variant="outline">#{itemTag}</Badge>)}</div><Button className="w-fit bg-[#297BFF] hover:bg-[#1769E8]" onClick={() => setPreview(featured)}>Ver prévia <ArrowRight className="ml-2 h-4 w-4" /></Button></div></div></Card>}
      <div className="flex flex-wrap gap-2 border-b border-[#22314A] pb-4"><Button size="sm" variant={category === 'all' ? 'default' : 'outline'} onClick={() => setCategory('all')}>Todos</Button>{categories.map((item) => <Button key={item.id} size="sm" variant={category === item.id ? 'default' : 'outline'} onClick={() => setCategory(item.id)}>{item.name}</Button>)}</div>
      <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#70819A]" /><Input className={internal ? 'h-11 border-[#22314A] bg-[#101927] pl-10 text-[#F4F8FF] placeholder:text-[#70819A]' : 'pl-8'} placeholder="Busque por produto, aplicação ou material..." value={search} onChange={(e) => setSearch(e.target.value)} /><SlidersHorizontal className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#70819A]" /></div><select className="h-11 rounded-[10px] border border-[#22314A] bg-[#101927] px-3 text-sm text-[#9FB0C9]" value={tag} onChange={(e) => setTag(e.target.value)}><option value="all">Todas as tags</option>{tags.map((item) => <option key={item}>{item}</option>)}</select><select className="h-11 rounded-[10px] border border-[#22314A] bg-[#101927] px-3 text-sm text-[#9FB0C9]" value={format} onChange={(e) => setFormat(e.target.value)}><option value="all">Todos os formatos</option>{['PDF', 'PPT', 'PNG', 'Imagem', 'Vídeo', 'Link', 'Material'].map((item) => <option key={item}>{item}</option>)}</select><select className="h-11 rounded-[10px] border border-[#22314A] bg-[#101927] px-3 text-sm text-[#9FB0C9]" value={sort} onChange={(e) => setSort(e.target.value)}><option value="recent">Mais recentes</option><option value="downloads">Mais baixados</option><option value="alphabetical">A-Z</option></select><Button size="icon" variant={view === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')}><Grid2X2 className="h-4 w-4" /></Button><Button size="icon" variant={view === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}><List className="h-4 w-4" /></Button></div>
      <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Materiais recomendados para você</h2><p className={`text-sm ${muted}`}>{filtered.length} materiais encontrados</p></div></div>
      {filtered.length === 0 && <Card className={surface}><CardContent className="py-12 text-center"><p className="font-medium">Nenhum material encontrado</p><p className={`mt-1 text-sm ${muted}`}>Tente remover algum filtro ou buscar outro termo.</p><Button className="mt-4" variant="outline" onClick={() => { setSearch(''); setTag('all'); setFormat('all'); setCategory('all'); }}>Limpar filtros</Button></CardContent></Card>}
      <div className={view === 'grid' ? 'grid gap-[18px] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'space-y-3'}>{filtered.map((item) => <Card key={item.id} className={`group overflow-hidden transition-colors hover:border-[#297BFF]/60 ${surface} ${view === 'list' ? 'flex items-center gap-4 p-3' : ''}`}><div className="relative">{item.thumbnail_url ? <img src={resolveMediaUrl(item.thumbnail_url) || undefined} alt={item.title} onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('hidden'); }} className={view === 'grid' ? 'h-44 w-full object-cover' : 'h-20 w-32 rounded object-cover'} /> : null}<div className={`${view === 'grid' ? 'h-44 w-full' : 'hidden h-20 w-32'} hidden items-center justify-center bg-[#123968] text-[#58A6FF]`}>{icon(item.material_type)}</div><Badge className="absolute left-3 top-3 bg-[#0A101A]/90 text-[#F4F8FF]">{formatLabel(item)}</Badge></div><div className="min-w-0 flex-1"><CardHeader className={view === 'list' ? 'p-0' : 'pb-2'}><CardTitle className="line-clamp-2 text-base">{item.title}</CardTitle></CardHeader><CardContent className={view === 'list' ? 'p-0' : 'space-y-3'}><p className={`line-clamp-2 text-sm ${muted}`}>{item.description || 'Material comercial'}</p><div className="flex flex-wrap gap-1">{item.tags?.slice(0, 3).map((itemTag) => <Badge key={itemTag} variant="secondary">#{itemTag}</Badge>)}</div>{item.copy_text && <p className={`line-clamp-2 rounded p-2 text-xs ${internal ? 'bg-[#0A101A] text-[#9FB0C9]' : 'bg-muted'}`}>{item.copy_text}</p>}<div className="flex gap-2"><Button className="flex-1" size="sm" variant="outline" onClick={() => setPreview(item)}><Eye className="mr-1 h-4 w-4" />Prévia</Button><Button className="flex-1 bg-[#297BFF] hover:bg-[#1769E8]" size="sm" onClick={() => download(item)} disabled={downloading === item.id}><Download className="mr-1 h-4 w-4" />{downloading === item.id ? 'Baixando...' : 'Baixar'}</Button></div></CardContent></div></Card>)}</div>
    </>}
    <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle></DialogHeader>{preview && <div className="space-y-4">{previewType(preview) === 'image' && <img src={resolveMediaUrl(preview.file_url) || undefined} alt={preview.title} className="max-h-[65vh] w-full object-contain" />}{previewType(preview) === 'video' && <video src={resolveMediaUrl(preview.file_url) || undefined} controls className="max-h-[65vh] w-full" />}{previewType(preview) === 'pdf' && <iframe src={resolveMediaUrl(preview.file_url) || undefined} title={preview.title} className="h-[65vh] w-full" />}{previewType(preview) === 'other' && <div className="rounded border p-6 text-center text-muted-foreground">Este formato não possui prévia no navegador.</div>}{preview.copy_text && <div><p className="mb-2 text-sm font-medium">Copy para publicação</p><div className="flex gap-2"><p className="flex-1 whitespace-pre-wrap rounded bg-muted p-4 text-sm">{preview.copy_text}</p><Button size="icon" variant="outline" onClick={() => copy(preview.copy_text)}><Copy className="h-4 w-4" /></Button></div></div>}</div>}</DialogContent></Dialog>
  </div>;
}
