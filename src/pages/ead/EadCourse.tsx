import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { eadApi, ytEmbedUrl } from '@/lib/ead-api';
import { EadLayout } from './EadLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlayCircle, CheckCircle2, Award, Download } from 'lucide-react';

export default function EadCourse() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [watched, setWatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    eadApi.course(id).then(d => {
      setData(d);
      setActiveLesson(d.lessons[0] || null);
      try {
        const w = JSON.parse(localStorage.getItem(`ead_watched_${id}`) || '[]');
        setWatched(new Set(w));
      } catch {}
    }).finally(() => setLoading(false));
  }, [id]);

  function markWatched(lid: string) {
    setWatched(prev => {
      const n = new Set(prev); n.add(lid);
      localStorage.setItem(`ead_watched_${id}`, JSON.stringify([...n]));
      return n;
    });
  }

  if (loading) return <EadLayout><div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div></EadLayout>;
  if (!data) return <EadLayout><p>Curso não encontrado</p></EadLayout>;

  const { course, lessons, certificate } = data;
  const approved = !!certificate;

  return (
    <EadLayout>
      <div className="mb-4">
        <Link to="/ead" className="text-sm text-muted-foreground hover:underline">← Voltar</Link>
      </div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="text-muted-foreground">{course.description}</p>
        </div>
        {approved && (
          <Badge className="bg-green-100 text-green-800 border-green-300"><Award className="h-4 w-4 mr-1" />Aprovado</Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {activeLesson ? (
              <iframe key={activeLesson.id} src={ytEmbedUrl(activeLesson.youtube_url)} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            ) : (
              <div className="flex items-center justify-center h-full text-white">Sem aulas</div>
            )}
          </div>
          {activeLesson && (
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{activeLesson.title}</h2>
              <Button size="sm" variant={watched.has(activeLesson.id) ? 'secondary' : 'default'} onClick={() => markWatched(activeLesson.id)}>
                <CheckCircle2 className="h-4 w-4 mr-1" />{watched.has(activeLesson.id) ? 'Aula concluída' : 'Marcar como assistida'}
              </Button>
            </div>
          )}

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Prova final</CardTitle></CardHeader>
            <CardContent>
              {approved ? (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">Você já foi aprovado! Baixe seu certificado.</p>
                  <a href={certificate.pdf_url} target="_blank" rel="noreferrer">
                    <Button><Download className="h-4 w-4 mr-1" />Baixar certificado</Button>
                  </a>
                </div>
              ) : (
                <Button onClick={() => nav(`/ead/curso/${id}/prova`)}>Fazer prova</Button>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Aulas</CardTitle></CardHeader>
          <CardContent className="p-0">
            <ul>
              {lessons.map((l: any, i: number) => (
                <li key={l.id}>
                  <button
                    onClick={() => setActiveLesson(l)}
                    className={`w-full text-left px-4 py-3 border-t flex items-center gap-3 hover:bg-muted/50 ${activeLesson?.id === l.id ? 'bg-muted' : ''}`}
                  >
                    {watched.has(l.id) ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <PlayCircle className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-medium flex-1">{i + 1}. {l.title}</span>
                  </button>
                </li>
              ))}
              {!lessons.length && <li className="p-4 text-sm text-muted-foreground">Sem aulas cadastradas.</li>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </EadLayout>
  );
}
