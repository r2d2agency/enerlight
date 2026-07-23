import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Clock,
  Fingerprint,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useRh } from '@/hooks/use-rh';
import {
  ensureFaceModels,
  detectDescriptor,
  matchBest,
  loadLocalCandidates,
  type FaceCandidate,
} from '@/lib/face-recognition';
import { getAssignedJourney } from '@/lib/rh-journeys';

const LABEL_MAP: Record<string, string> = {
  entrada: 'Entrada',
  cafe_ini: 'Intervalo',
  cafe_fim: 'Retorno intervalo',
  almoco_ini: 'Almoço (saída)',
  almoco_fim: 'Almoço (volta)',
  saida: 'Saída',
  extra: 'Extra',
};

const MATCH_THRESHOLD = 0.55; // rigoroso para kiosk

export default function RhKiosk() {
  const navigate = useNavigate();
  const { getEmployees } = useRh();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);

  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<FaceCandidate[]>([]);
  const [status, setStatus] = useState('Carregando modelos faciais...');
  const [pending, setPending] = useState(false);
  const [recognized, setRecognized] = useState<{ name: string; type: string; score: number; time: string } | null>(null);
  const [lastRegisters, setLastRegisters] = useState<Array<{ name: string; type: string; time: string }>>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await ensureFaceModels();
        const employees = await getEmployees();
        const namesById: Record<string, string> = {};
        employees.forEach((e: any) => {
          if (e.user_id) namesById[e.user_id] = e.name;
          if (e.id) namesById[e.id] = e.name;
        });
        const cands = loadLocalCandidates(namesById);
        if (cancelled) return;
        setCandidates(cands);

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setLoading(false);
        setStatus(cands.length ? 'Selecione o tipo de ponto e olhe para a câmera' : 'Nenhum colaborador com face cadastrada. Cadastre no menu RH → Colaboradores.');
      } catch (e) {
        console.error(e);
        setStatus('Erro ao iniciar câmera ou modelos faciais.');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [getEmployees, stopCamera]);

  const registerPoint = useCallback(
    async () => {
      if (busyRef.current || !videoRef.current) return;
      if (!candidates.length) {
        toast.error('Nenhum colaborador cadastrado facialmente.');
        return;
      }
      busyRef.current = true;
      setPending(true);
      setStatus('Identificando rosto...');

      let descriptor: number[] | null = null;
      for (let i = 0; i < 8; i++) {
        try {
          descriptor = await detectDescriptor(videoRef.current);
        } catch {}
        if (descriptor) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      if (!descriptor) {
        setStatus('Nenhum rosto detectado. Tente novamente.');
        toast.error('Não foi possível detectar seu rosto.');
        busyRef.current = false;
        setPending(false);
        return;
      }

      const match = matchBest(descriptor, candidates);
      if (!match || match.distance > MATCH_THRESHOLD) {
        setStatus(`Colaborador não reconhecido (score ${match ? match.score.toFixed(0) : '0'}).`);
        toast.error('Rosto não reconhecido. Aproxime-se e tente novamente.');
        busyRef.current = false;
        setPending(false);
        return;
      }

      const time = new Date().toLocaleTimeString('pt-BR');

      // Persistir batida no backend (auto-classifica tipo)
      let typeLabel = 'Batida';
      try {
        const { api } = await import('@/lib/api');
        const p: any = await api('/api/rh/punches', {
          method: 'POST',
          body: {
            user_id: match.candidate.id,
            source: 'kiosk',
          },
        });
        typeLabel = LABEL_MAP[p?.punch_type] || 'Batida';
      } catch (err: any) {
        console.error('Erro ao salvar batida', err);
        toast.error('Batida reconhecida, mas falhou ao salvar: ' + (err?.message || 'erro'));
        busyRef.current = false;
        setPending(false);
        return;
      }
      void getAssignedJourney(match.candidate.id);

      setRecognized({ name: match.candidate.name, type: typeLabel, score: match.score, time });
      setLastRegisters((prev) => [{ name: match.candidate.name, type: typeLabel, time }, ...prev].slice(0, 6));
      toast.success(`${typeLabel} de ${match.candidate.name} registrado!`);
      setStatus('Toque em "Bater Ponto" e olhe para a câmera');

      setTimeout(() => setRecognized(null), 5000);
      busyRef.current = false;
      setPending(false);
    },
    [candidates],
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b">
        <Button variant="ghost" size="sm" onClick={() => navigate('/rh')} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Sair do modo Kiosk
        </Button>
        <div className="text-center">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">Ponto Eletrônico</div>
          <div className="text-sm font-semibold">{candidates.length} colaboradores cadastrados</div>
        </div>
        <div className="text-right font-mono">
          <div className="text-2xl font-bold">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-xs text-muted-foreground">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 p-6 overflow-hidden">
        <div className="flex flex-col items-center justify-center gap-6">
          <div className="relative w-full max-w-[480px] aspect-square rounded-3xl overflow-hidden bg-muted border-4 border-primary/20 shadow-xl">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">{status}</p>
              </div>
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
                <div className="absolute inset-0 border-[24px] border-background/30 rounded-3xl pointer-events-none">
                  <div className="w-full h-full rounded-2xl border-2 border-primary/60 border-dashed" />
                </div>
                {pending && (
                  <div className="absolute inset-0 bg-background/70 flex flex-col items-center justify-center gap-3">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="font-semibold">Registrando {pending}...</p>
                  </div>
                )}
                {recognized && (
                  <div className="absolute inset-x-0 bottom-0 bg-emerald-600/90 text-white px-4 py-3 flex items-center gap-3">
                    <CheckCircle2 className="h-6 w-6 shrink-0" />
                    <div className="flex-1">
                      <div className="font-bold">{recognized.name}</div>
                      <div className="text-xs opacity-90">{recognized.type} às {recognized.time} • score {recognized.score.toFixed(0)}</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <p className="text-center text-muted-foreground text-sm min-h-[20px]">{status}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-[720px]">
            {btns.map((b) => (
              <Button
                key={b.type}
                size="lg"
                variant={b.variant}
                onClick={() => registerPoint(b.type)}
                disabled={loading || !!pending || !candidates.length}
                className="h-24 flex flex-col gap-2 rounded-2xl text-base font-bold"
              >
                <b.icon className="h-6 w-6" />
                {b.type}
              </Button>
            ))}
          </div>
        </div>

        <aside className="hidden md:flex flex-col gap-3 overflow-hidden">
          <Card className="p-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Últimos registros</h3>
            </div>
            <div className="flex-1 overflow-auto space-y-2">
              {lastRegisters.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-10 flex flex-col items-center gap-2">
                  <Camera className="h-8 w-8 opacity-30" />
                  Nenhum registro nesta sessão.
                </div>
              ) : (
                lastRegisters.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/50">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.name}</div>
                      <div className="text-xs text-muted-foreground">{r.type}</div>
                    </div>
                    <div className="text-xs font-mono">{r.time}</div>
                  </div>
                ))
              )}
            </div>
          </Card>
          {!candidates.length && !loading && (
            <Card className="p-4 border-destructive/40 bg-destructive/5">
              <div className="flex gap-2 items-start text-xs">
                <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <span>Cadastre a face dos colaboradores em <b>RH → Colaboradores</b> antes de usar o modo Kiosk.</span>
              </div>
            </Card>
          )}
        </aside>
      </main>
    </div>
  );
}
