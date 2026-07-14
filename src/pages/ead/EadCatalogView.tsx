import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { API_URL } from '@/lib/api';
import { resolveMediaUrl } from '@/lib/media';
import { EadLayout } from './EadLayout';
import { useBrand } from './EadLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface Catalog {
  id: string; title: string; description?: string; type: 'gallery' | 'pdf';
  cover_url?: string; images?: { url: string; title?: string }[]; pdf_url?: string; category_name?: string;
}

export default function EadCatalogView() {
  return (
    <EadLayout>
      <CatalogViewInner />
    </EadLayout>
  );
}

function CatalogViewInner() {
  const { id = '' } = useParams();
  const { link } = useBrand();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    eadApi.myCatalog(id).then(setCat).catch(() => setCat(null)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>;
  if (!cat) return <Card><CardContent className="p-10 text-center text-muted-foreground">Catálogo não encontrado.</CardContent></Card>;

  const isGallery = cat.type === 'gallery';
  const imgs = cat.images || [];
  const cur = imgs[idx];
  const curUrl = cur ? resolveMediaUrl(cur.url) : null;

  async function downloadCurrent() {
    if (!cur) return;
    const url = resolveMediaUrl(cur.url);
    if (!url) return;
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${(cur.title || cat!.title || 'imagem').replace(/[^\w-]+/g, '_')}-${idx + 1}.${(cur.url.split('.').pop() || 'jpg').split('?')[0]}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    } catch { toast.error('Erro ao baixar imagem'); }
  }

  async function downloadAllPdf() {
    setDownloadingPdf(true);
    try {
      const token = eadToken.get();
      const r = await fetch(`${API_URL}/api/ead/my/catalogs/${cat!.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error('Erro');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${cat!.title.replace(/[^\w-]+/g, '_')}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { toast.error('Erro ao gerar PDF'); }
    finally { setDownloadingPdf(false); }
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-1">{cat.title}</h1>
        {cat.category_name && <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{cat.category_name}</div>}
        {cat.description && <p className="text-muted-foreground">{cat.description}</p>}
      </div>

      {!isGallery ? (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild>
                <a href={resolveMediaUrl(cat.pdf_url || '') || '#'} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" /> Abrir PDF em nova aba
                </a>
              </Button>
              <Button asChild variant="secondary">
                <a href={resolveMediaUrl(cat.pdf_url || '') || '#'} download>
                  <Download className="h-4 w-4 mr-2" /> Baixar PDF
                </a>
              </Button>
            </div>
            <div className="border rounded-lg overflow-hidden bg-muted" style={{ height: '75vh' }}>
              {cat.pdf_url ? (
                <iframe src={resolveMediaUrl(cat.pdf_url) || ''} title={cat.title} className="w-full h-full" />
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground"><FileText className="h-12 w-12" /></div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : imgs.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Este catálogo ainda não possui imagens.</CardContent></Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="relative bg-black/90 flex items-center justify-center" style={{ minHeight: '60vh' }}>
              {curUrl && <img src={curUrl} alt={cur?.title || cat.title} className="max-h-[70vh] w-auto object-contain" />}
              {imgs.length > 1 && (
                <>
                  <button
                    onClick={() => setIdx(i => (i - 1 + imgs.length) % imgs.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"
                    aria-label="Anterior"
                  ><ChevronLeft className="h-5 w-5" /></button>
                  <button
                    onClick={() => setIdx(i => (i + 1) % imgs.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow"
                    aria-label="Próxima"
                  ><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                {idx + 1} / {imgs.length}
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Button onClick={downloadCurrent} variant="secondary">
              <Download className="h-4 w-4 mr-2" /> Baixar esta imagem
            </Button>
            <Button onClick={downloadAllPdf} disabled={downloadingPdf}>
              {downloadingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Baixar tudo em PDF
            </Button>
            {cur?.title && <div className="text-sm text-muted-foreground ml-2">{cur.title}</div>}
          </div>

          {/* Miniaturas */}
          <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
            {imgs.map((im, i) => {
              const u = resolveMediaUrl(im.url);
              return (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  className={`aspect-square rounded overflow-hidden border-2 transition ${i === idx ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40'}`}
                >
                  {u && <img src={u} alt="" className="w-full h-full object-cover" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
