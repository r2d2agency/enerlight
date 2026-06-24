import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { eadApi, ytEmbedUrl } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { EadLayout } from './EadLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, PlayCircle, CheckCircle2, Award, Download, BookOpen } from 'lucide-react';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReadyPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytReadyPromise) return ytReadyPromise;
  ytReadyPromise = new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
  });
  return ytReadyPromise;
}

function extractYouTubeId(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.searchParams.get('v')) return u.searchParams.get('v')!;
    if (u.pathname.startsWith('/embed/')) return u.pathname.split('/embed/')[1];
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/shorts/')[1];
  } catch {}
  return '';
}

export default function EadCourse() {
  const { id, slug } = useParams<{ id: string; slug?: string }>();
  const nav = useNavigate();
  const brandBase = slug ? `/marca/${slug}` : '/ead';
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeLesson, setActiveLesson] = useState<any>(null);
  const [progressMap, setProgressMap] = useState<Record<string, any>>({});

  // local watched seconds tracker per session
  const watchedRef = useRef<number>(0);
  const totalRef = useRef<number>(0);
  const lastPosRef = useRef<number>(0);
  const lastSyncRef = useRef<number>(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    eadApi.course(id).then(d => {
      setData(d);
      setActiveLesson(d.lessons[0] || null);
      const map: Record<string, any> = {};
      for (const p of (d.progress || [])) map[p.lesson_id] = p;
      setProgressMap(map);
    }).finally(() => setLoading(false));
  }, [id]);

  // Reset trackers when lesson changes
  useEffect(() => {
    watchedRef.current = 0;
    totalRef.current = activeLesson?.duration_seconds || 0;
    lastPosRef.current = progressMap[activeLesson?.id]?.last_position || 0;
    lastSyncRef.current = 0;
  }, [activeLesson?.id]);

  function applyProgressResponse(p: any) {
    if (!p) return;
    setProgressMap(prev => ({ ...prev, [p.lesson_id]: p }));
  }

  async function sendProgress(force = false) {
    if (!activeLesson) return;
    const now = Date.now();
    if (!force && now - lastSyncRef.current < 5000) return;
    lastSyncRef.current = now;
    try {
      const r = await eadApi.lessonProgress(activeLesson.id, {
        watched_seconds: Math.floor(watchedRef.current),
        last_position: Math.floor(lastPosRef.current),
        total_seconds: totalRef.current ? Math.floor(totalRef.current) : null,
      });
      applyProgressResponse(r);
    } catch {}
  }

  // Native HTML5 video tracking
  useEffect(() => {
    if (!activeLesson || activeLesson.video_type !== 'upload') return;
    const v = videoRef.current;
    if (!v) return;
    let lastT = 0;
    const onLoaded = () => { totalRef.current = v.duration || totalRef.current; };
    const onTime = () => {
      const t = v.currentTime;
      const dt = t - lastT;
      if (dt > 0 && dt < 2) watchedRef.current += dt; // ignore seeks/forward jumps
      lastT = t;
      lastPosRef.current = t;
      sendProgress(false);
    };
    const onPause = () => sendProgress(true);
    const onEnded = () => { watchedRef.current = totalRef.current || watchedRef.current; sendProgress(true); };
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
      sendProgress(true);
    };
  }, [activeLesson?.id]);

  // YouTube IFrame API tracking
  useEffect(() => {
    if (!activeLesson || activeLesson.video_type === 'upload') return;
    const vid = extractYouTubeId(activeLesson.youtube_url || '');
    if (!vid || !ytContainerRef.current) return;
    let interval: any;
    let lastT = 0;
    let destroyed = false;
    loadYouTubeApi().then(() => {
      if (destroyed || !ytContainerRef.current) return;
      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: vid,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          onReady: (e: any) => {
            totalRef.current = e.target.getDuration() || totalRef.current;
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              interval = setInterval(() => {
                const t = e.target.getCurrentTime();
                const dt = t - lastT;
                if (dt > 0 && dt < 2) watchedRef.current += dt;
                lastT = t;
                lastPosRef.current = t;
                if (!totalRef.current) totalRef.current = e.target.getDuration() || 0;
                sendProgress(false);
              }, 1000);
            } else {
              if (interval) { clearInterval(interval); interval = null; }
              if (e.data === window.YT.PlayerState.PAUSED || e.data === window.YT.PlayerState.ENDED) {
                if (e.data === window.YT.PlayerState.ENDED) watchedRef.current = totalRef.current || watchedRef.current;
                sendProgress(true);
              }
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      if (interval) clearInterval(interval);
      sendProgress(true);
      try { ytPlayerRef.current?.destroy?.(); } catch {}
      ytPlayerRef.current = null;
    };
  }, [activeLesson?.id]);

  async function manualComplete() {
    if (!activeLesson) return;
    try {
      const r = await eadApi.lessonComplete(activeLesson.id);
      applyProgressResponse(r);
    } catch {}
  }

  if (loading) return <EadLayout><div className="flex justify-center py-12"><Loader2 className="animate-spin h-6 w-6" /></div></EadLayout>;
  if (!data) return <EadLayout><p>Curso não encontrado</p></EadLayout>;

  const { course, lessons, modules = [], manuals = [], certificate } = data;
  const approved = !!certificate;
  const hasCert = course.has_certificate !== false;
  const passingScore = course.passing_score ?? 100;

  const grouped: { id: string | null; title: string; description?: string; lessons: any[] }[] = [];
  for (const m of modules) grouped.push({ id: m.id, title: m.title, description: m.description, lessons: lessons.filter((l: any) => l.module_id === m.id) });
  const orphan = lessons.filter((l: any) => !l.module_id);
  if (orphan.length) grouped.push({ id: null, title: modules.length ? 'Outras aulas' : 'Aulas', lessons: orphan });

  const doneCount = lessons.filter((l: any) => progressMap[l.id]?.completed).length;
  const overallPct = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;


  const activeProg = activeLesson ? progressMap[activeLesson.id] : null;
  const watchedPct = activeProg && activeProg.total_seconds
    ? Math.min(100, Math.round((activeProg.watched_seconds / activeProg.total_seconds) * 100))
    : 0;

  let counter = 0;

  return (
    <EadLayout breadcrumbs={[{ label: 'Cursos', to: `${brandBase}/cursos` }, { label: course.title }]}>

      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="text-muted-foreground">{course.description}</p>
        </div>
        {approved && (
          <Badge className="bg-green-100 text-green-800 border-green-300"><Award className="h-4 w-4 mr-1" />Aprovado</Badge>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
          <span>Progresso do curso</span>
          <span>{overallPct}%</span>
        </div>
        <Progress value={overallPct} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {!activeLesson ? (
              <div className="flex items-center justify-center h-full text-white">Sem aulas</div>
            ) : activeLesson.video_type === 'upload' ? (
              <video
                ref={videoRef}
                key={activeLesson.id}
                src={resolveMediaUrl(activeLesson.video_url) || ''}
                controls
                playsInline
                controlsList="nodownload"
                className="w-full h-full"
              />
            ) : (
              <div key={activeLesson.id} className="w-full h-full">
                <div ref={ytContainerRef} className="w-full h-full" />
              </div>
            )}
          </div>

          {activeLesson && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold truncate">{activeLesson.title}</h2>
                  {activeLesson.description && <p className="text-sm text-muted-foreground">{activeLesson.description}</p>}
                </div>
                <Button size="sm" variant={activeProg?.completed ? 'secondary' : 'default'} onClick={manualComplete}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />{activeProg?.completed ? 'Aula concluída' : 'Marcar concluída'}
                </Button>
              </div>
              {activeProg && activeProg.total_seconds ? (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                    <span>Assistido</span>
                    <span>{watchedPct}%</span>
                  </div>
                  <Progress value={watchedPct} className="h-1.5" />
                </div>
              ) : null}
            </div>
          )}

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Manuais</CardTitle></CardHeader>
            <CardContent>
              {manuals.length ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {manuals.map((manual: any) => (
                    <a key={manual.id} href={resolveMediaUrl(manual.file_url) || '#'} target="_blank" rel="noreferrer" className="group rounded-md border overflow-hidden hover:bg-muted/40 transition">
                      <div className="aspect-video bg-muted flex items-center justify-center">
                        {manual.cover_url ? <img src={resolveMediaUrl(manual.cover_url)} alt={manual.title} className="w-full h-full object-cover" /> : <BookOpen className="h-8 w-8 text-muted-foreground" />}
                      </div>
                      <div className="p-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium line-clamp-2">{manual.title}</h3>
                          {manual.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{manual.description}</p>}
                        </div>
                        <Download className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-0.5" />
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum manual cadastrado.</p>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base">Prova final</CardTitle></CardHeader>
            <CardContent>
              {approved ? (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">Você já foi aprovado!{hasCert ? ' Baixe seu certificado.' : ''}</p>
                  {hasCert && certificate && (
                    <a href={certificate.pdf_url} target="_blank" rel="noreferrer">
                      <Button><Download className="h-4 w-4 mr-1" />Baixar certificado</Button>
                    </a>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Acerte ao menos <strong>{passingScore}%</strong> para ser aprovado{hasCert ? ' e receber o certificado' : ''}.</p>
                  <Button onClick={() => nav(`/ead/curso/${id}/prova`)}>Fazer prova</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Conteúdo</CardTitle></CardHeader>
          <CardContent className="p-0">
            {grouped.length === 0 && <p className="p-4 text-sm text-muted-foreground">Sem aulas cadastradas.</p>}
            {grouped.map((g) => (
              <div key={g.id ?? 'none'}>
                <div className="px-4 py-2 bg-muted/30 border-t text-xs font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</div>
                <ul>
                  {g.lessons.map((l: any) => {
                    counter += 1;
                    const idx = counter;
                    const done = !!progressMap[l.id]?.completed;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => setActiveLesson(l)}
                          className={`w-full text-left px-4 py-3 border-t flex items-center gap-3 hover:bg-muted/50 ${activeLesson?.id === l.id ? 'bg-muted' : ''}`}
                        >
                          {done ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <PlayCircle className="h-4 w-4 text-muted-foreground" />}
                          <span className="text-sm font-medium flex-1">{idx}. {l.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </EadLayout>
  );
}
