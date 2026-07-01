import { useEffect, useMemo, useState } from 'react';
import { eadApi } from '@/lib/ead-api';
import { EadLayout } from './EadLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Download, Loader2, Search } from 'lucide-react';

interface Manual {
  id: string; title: string; description?: string; cover_url?: string; file_url: string;
  course_id: string; course_title: string;
}

export default function EadManuals() {
  const [items, setItems] = useState<Manual[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => { eadApi.myManuals().then(setItems).finally(() => setLoading(false)); }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(m =>
      m.title.toLowerCase().includes(term) ||
      (m.description || '').toLowerCase().includes(term) ||
      m.course_title.toLowerCase().includes(term)
    );
  }, [items, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, { title: string; items: Manual[] }>();
    for (const m of filtered) {
      if (!map.has(m.course_id)) map.set(m.course_id, { title: m.course_title, items: [] });
      map.get(m.course_id)!.items.push(m);
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <EadLayout breadcrumbs={[{ label: 'Manuais' }]}>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Manuais e Apostilas</h1>
          <p className="text-muted-foreground">Materiais oficiais para download e consulta offline.</p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar manual..." className="pl-9" />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div>
      ) : grouped.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">
          {items.length === 0 ? 'Nenhum manual disponível ainda.' : 'Nenhum resultado para sua busca.'}
        </CardContent></Card>
      ) : (
        <div className="space-y-8">
          {grouped.map(g => (
            <section key={g.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{g.title}</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map(m => (
                  <Card key={m.id} className="overflow-hidden flex flex-col">
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      {m.cover_url
                        ? <img src={resolveMediaUrl(m.cover_url) || ''} alt={m.title} className="w-full h-full object-cover" />
                        : <FileText className="h-14 w-14 text-muted-foreground" />}
                    </div>
                    <CardContent className="p-4 flex flex-col gap-3 flex-1">
                      <div className="flex-1">
                        <h3 className="font-semibold line-clamp-2 mb-1">{m.title}</h3>
                        {m.description && <p className="text-sm text-muted-foreground line-clamp-2">{m.description}</p>}
                      </div>
                      <Button asChild className="w-full">
                        <a href={m.file_url} target="_blank" rel="noopener noreferrer" download>
                          <Download className="h-4 w-4 mr-2" /> Baixar
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </EadLayout>
  );
}
