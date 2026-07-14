import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eadApi } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { EadLayout } from './EadLayout';
import { useBrand } from './EadLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, FileText, Images, Loader2 } from 'lucide-react';

interface CatalogItem {
  id: string; title: string; description?: string; type: 'gallery' | 'pdf';
  cover_url?: string; images?: { url: string; title?: string }[]; pdf_url?: string;
}
interface Category { id: string; name: string; description?: string; items: CatalogItem[]; }

export default function EadCatalogs() {
  return (
    <EadLayout breadcrumbs={[{ label: 'Catálogos' }]}>
      <CatalogsInner />
    </EadLayout>
  );
}

function CatalogsInner() {
  const { link } = useBrand();
  const [data, setData] = useState<{ categories: Category[]; uncategorized: CatalogItem[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    eadApi.myCatalogs().then(setData).finally(() => setLoading(false));
  }, []);

  const empty = !loading && data && data.categories.every(c => c.items.length === 0) && data.uncategorized.length === 0;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Layers className="h-6 w-6" /> Catálogos</h1>
        <p className="text-muted-foreground">Materiais e catálogos oficiais da marca — visualize ou baixe.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
      ) : empty ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhum catálogo disponível ainda.</CardContent></Card>
      ) : (
        <div className="space-y-10">
          {data!.categories.filter(c => c.items.length > 0).map(cat => (
            <Section key={cat.id} title={cat.name} description={cat.description} items={cat.items} link={link} />
          ))}
          {data!.uncategorized.length > 0 && (
            <Section title="Outros" items={data!.uncategorized} link={link} />
          )}
        </div>
      )}
    </>
  );
}

function Section({ title, description, items, link }: { title: string; description?: string; items: CatalogItem[]; link: (s?: string) => string }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(it => {
          const cover = resolveMediaUrl(it.cover_url) || (it.type === 'gallery' && it.images?.[0]?.url ? resolveMediaUrl(it.images[0].url) : null);
          return (
            <Link key={it.id} to={link(`catalogo/${it.id}`)} className="group">
              <Card className="overflow-hidden flex flex-col hover:shadow-md transition h-full">
                <div className="aspect-video bg-muted flex items-center justify-center relative">
                  {cover ? (
                    <img src={cover} alt={it.title} className="w-full h-full object-cover group-hover:scale-105 transition" />
                  ) : (
                    it.type === 'pdf' ? <FileText className="h-14 w-14 text-muted-foreground" /> : <Images className="h-14 w-14 text-muted-foreground" />
                  )}
                  <Badge className="absolute top-2 right-2" variant="secondary">
                    {it.type === 'pdf' ? 'PDF' : `${it.images?.length || 0} imagens`}
                  </Badge>
                </div>
                <CardContent className="p-4 flex-1">
                  <h3 className="font-semibold line-clamp-2 mb-1">{it.title}</h3>
                  {it.description && <p className="text-sm text-muted-foreground line-clamp-2">{it.description}</p>}
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
