import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { eadApi } from '@/lib/ead-api';
import { EadLayout, useBrand } from './EadLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle, BookOpen } from 'lucide-react';

function CatalogInner() {
  const { link } = useBrand();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { eadApi.courses().then(setCourses).finally(() => setLoading(false)); }, []);

  return (
    <>
      <h1 className="text-2xl font-bold mb-1">Cursos disponíveis</h1>
      <p className="text-muted-foreground mb-6">Escolha um curso, assista às aulas e faça a prova para ganhar seu certificado.</p>
      {loading ? <div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div> : courses.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">Nenhum curso publicado ainda.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map(c => (
            <Link key={c.id} to={link(`curso/${c.id}`)}>
              <Card className="overflow-hidden hover:shadow-md transition cursor-pointer h-full">
                <div className="aspect-video bg-muted flex items-center justify-center">
                  {c.cover_url ? <img src={resolveMediaUrl(c.cover_url) || ''} alt={c.title} className="w-full h-full object-cover" /> : <BookOpen className="h-12 w-12 text-muted-foreground" />}
                </div>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-1 line-clamp-2">{c.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.description || 'Sem descrição'}</p>
                  <div className="flex items-center justify-between text-xs">
                    <Badge variant="secondary"><PlayCircle className="h-3 w-3 mr-1" />{c.lesson_count} aulas</Badge>
                    <span className="text-muted-foreground">{c.question_count} perguntas</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function EadCatalog() {
  return (
    <EadLayout breadcrumbs={[{ label: 'Cursos' }]}>
      <CatalogInner />
    </EadLayout>
  );
}
