import { useEffect, useState } from 'react';
import { Download, FileText, Image, Link as LinkIcon, Loader2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { comercialExternalApi, comercialInternalApi, ComercialMarketingMaterial } from '@/lib/comercial-api';
import ComercialLayout from './ComercialLayout';

export default function ComercialMarketing({ internal = false }: { internal?: boolean }) {
  if (internal) return <MarketingContent internal />;
  return <ComercialLayout>{(actor) => <MarketingContent actorId={actor.id} />}</ComercialLayout>;
}

function MarketingContent({ internal = false, actorId }: { internal?: boolean; actorId?: string }) {
  const [items, setItems] = useState<ComercialMarketingMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const request = internal ? comercialInternalApi.listMarketingMaterials() : comercialExternalApi.listMarketingMaterials();
    request.then((res) => setItems(res.materials)).catch((e) => setError(e.message || 'Não foi possível carregar os materiais.')).finally(() => setLoading(false));
  }, [internal]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const icon = (type?: string) => type?.toLowerCase().includes('image') ? <Image className="h-5 w-5" /> : type?.toLowerCase().includes('link') ? <LinkIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />;
  const download = async (item: ComercialMarketingMaterial) => {
    if (item.material_type === 'link') { window.open(item.file_url, '_blank', 'noopener,noreferrer'); return; }
    setDownloading(item.id);
    try {
      const result = internal ? await comercialInternalApi.downloadMarketingMaterial(item.id) : await comercialExternalApi.downloadMarketingMaterial(item.id);
      const url = result.url || result.file_url;
      if (!url) throw new Error('Arquivo indisponível');
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.filename || item.title; anchor.target = '_blank'; anchor.click();
    } catch (e: any) { setError(e.message || 'Não foi possível baixar o material.'); } finally { setDownloading(null); }
  };
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-semibold flex items-center gap-2"><Megaphone className="h-6 w-6 text-primary" /> Marketing</h1><p className="text-muted-foreground">Materiais comerciais disponíveis para sua equipe.</p></div>
    {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>}
    {error && <p className="text-destructive">{error}</p>}
    {!loading && !error && items.length === 0 && <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum material disponível no momento.</CardContent></Card>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <Card key={item.id}><CardHeader><CardTitle className="flex gap-2 text-base">{icon(item.material_type)}{item.title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{item.description || 'Material comercial'}</p>{item.category && <span className="text-xs text-muted-foreground">{typeof item.category === 'string' ? item.category : item.category.name}</span>}<Button className="w-full" variant="outline" onClick={() => download(item)} disabled={downloading === item.id}><Download className="mr-2 h-4 w-4" />{downloading === item.id ? 'Baixando...' : item.material_type === 'link' ? 'Abrir material' : 'Baixar material'}</Button></CardContent></Card>)}</div>
  </div>;
}
