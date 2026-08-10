import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";
import * as faceapi from '@vladmandic/face-api';
const tf: any = (faceapi as any).tf;

interface FacialValidationProps {
  onValidated: (success: boolean) => void;
  onCancel: () => void;
  mode?: 'register' | 'validate';
  sensitivity?: number;
  /** ID usado para chave no localStorage. Em validate compara com o descritor cadastrado deste ID. */
  targetId?: string;
}

const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';
const DESC_KEY = (id: string) => `facial_desc_${id}`;
const REG_KEY = (id: string) => `facial_reg_${id}`;

let modelsLoaded = false;
let backendReady: 'webgl' | 'cpu' | null = null;

async function ensureModels() {
  if (!backendReady) {
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      backendReady = 'webgl';
    } catch {
      await tf.setBackend('cpu');
      await tf.ready();
      backendReady = 'cpu';
    }
  }
  if (!modelsLoaded) {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
  }
}

async function detectOnce(video: HTMLVideoElement) {
  const tiny = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  let det = await faceapi
    .detectSingleFace(video, tiny)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!det) {
    const ssd = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });
    det = await faceapi
      .detectSingleFace(video, ssd)
      .withFaceLandmarks()
      .withFaceDescriptor();
  }
  return det;
}

function distanceToScore(distance: number): number {
  if (distance <= 0.6) return 100 - (distance / 0.6) * 40;
  if (distance <= 1.0) return 60 - ((distance - 0.6) / 0.4) * 60;
  return 0;
}

type Phase = 'idle' | 'camera' | 'captured' | 'done';

export default function FacialValidation({
  onValidated,
  onCancel,
  mode = 'validate',
  sensitivity = 0.5,
  targetId,
}: FacialValidationProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<string>('Carregando modelos...');
  const [pending, setPending] = useState<number[] | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; score: number } | null>(null);
  const [visualStatus, setVisualStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    ensureModels()
      .then(() => {
        if (cancelled) return;
        setLoading(false);
        setStatus(mode === 'register' ? 'Prepare-se para o cadastro' : 'Posicione seu rosto no centro');
      })
      .catch((e) => {
        console.error('face-api load error', e);
        setStatus('Erro ao carregar modelos faciais');
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // Attach the stream once the <video> is in the DOM (it is always mounted).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stream) {
      if (v.srcObject !== stream) v.srcObject = stream;
      v.play().catch(() => {});
    } else {
      v.srcObject = null;
    }
  }, [stream]);

  const startCamera = async () => {
    setTestResult(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('Câmera indisponível neste navegador (requer HTTPS).');
        return;
      }
      let mediaStream: MediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch {
        // fallback: qualquer câmera disponível
        mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setPhase('camera');
      setStatus(mode === 'register' ? 'Enquadre o rosto e confirme a coleta' : 'Posicione seu rosto no centro');
    } catch (err: any) {
      console.error('Erro ao acessar câmera:', err);
      const name = err?.name || '';
      if (name === 'NotAllowedError') setStatus('Permissão de câmera negada. Libere o acesso nas configurações do navegador.');
      else if (name === 'NotFoundError') setStatus('Nenhuma câmera encontrada no dispositivo.');
      else if (name === 'NotReadableError') setStatus('Câmera em uso por outro aplicativo. Feche e tente novamente.');
      else setStatus('Erro ao acessar câmera. Verifique as permissões.');
    }
  };

  const grabDescriptor = async (): Promise<number[] | null> => {
    if (!videoRef.current) return null;
    const maxAttempts = 8;
    const delay = backendReady === 'cpu' ? 350 : 200;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const det = await detectOnce(videoRef.current);
        if (det) return Array.from(det.descriptor);
      } catch (e) {
        console.error('detect error', e);
      }
      await new Promise((r) => setTimeout(r, delay));
    }
    return null;
  };

  const threshold = 0.75 - sensitivity * 0.30;

  // ---- REGISTER: coleta -> teste obrigatório -> salva
  const captureRegister = async () => {
    if (processing) return;
    setProcessing(true);
    setVisualStatus('processing');
    setStatus('Capturando...');
    const desc = await grabDescriptor();
    if (!desc) {
      setStatus('Nenhum rosto detectado. Ajuste a iluminação e tente novamente.');
      setVisualStatus('error');
      setProcessing(false);
      return;
    }
    setPending(desc);
    setPhase('captured');
    setVisualStatus('success');
    setTestResult(null);
    setStatus('Coleta feita. Agora faça o teste de validação.');
    setProcessing(false);
  };

  const runTest = async () => {
    if (processing || !pending) return;
    setProcessing(true);
    setVisualStatus('processing');
    setTestResult(null);
    setStatus('Testando reconhecimento...');
    const desc = await grabDescriptor();
    if (!desc) {
      setStatus('Nenhum rosto detectado no teste. Tente novamente.');
      setVisualStatus('error');
      setProcessing(false);
      return;
    }
    const distance = faceapi.euclideanDistance(new Float32Array(desc), new Float32Array(pending));
    const score = distanceToScore(distance);
    const ok = distance <= threshold;
    setTestResult({ ok, score });
    setVisualStatus(ok ? 'success' : 'error');
    setStatus(ok
      ? `Teste aprovado (score ${score.toFixed(0)}). Você pode salvar o cadastro.`
      : `Teste reprovado (score ${score.toFixed(0)}). Colete a facial novamente.`);
    setProcessing(false);
  };

  const saveRegister = () => {
    if (!pending || !targetId) {
      setStatus('ID de destino ausente. Não foi possível salvar o cadastro.');
      return;
    }
    localStorage.setItem(DESC_KEY(targetId), JSON.stringify(pending));
    localStorage.setItem(REG_KEY(targetId), 'true');
    setPhase('done');
    setStatus('Face cadastrada com sucesso!');
    setTimeout(() => {
      stopCamera();
      onValidated(true);
    }, 700);
  };

  const recollect = () => {
    setPending(null);
    setTestResult(null);
    setVisualStatus('idle');
    setPhase('camera');
    setStatus('Enquadre o rosto e confirme a coleta');
  };

  // ---- VALIDATE
  const captureValidate = async () => {
    if (processing) return;
    if (!targetId) {
      setStatus('ID de destino ausente.');
      return;
    }
    setProcessing(true);
    setStatus('Validando...');
    const desc = await grabDescriptor();
    if (!desc) {
      setStatus('Nenhum rosto detectado. Ajuste a iluminação e tente novamente.');
      setProcessing(false);
      return;
    }
    const raw = localStorage.getItem(DESC_KEY(targetId));
    if (!raw) {
      setStatus('Nenhum cadastro facial encontrado para este usuário.');
      setTimeout(() => { stopCamera(); onValidated(false); }, 1200);
      return;
    }
    let stored: number[] = [];
    try {
      stored = JSON.parse(raw);
    } catch {
      setStatus('Cadastro facial corrompido.');
      setProcessing(false);
      return;
    }
    const distance = faceapi.euclideanDistance(new Float32Array(desc), new Float32Array(stored));
    const score = distanceToScore(distance);
    if (distance <= threshold) {
      setStatus(`Identidade validada! (score ${score.toFixed(0)})`);
      setTimeout(() => { stopCamera(); onValidated(true); }, 800);
    } else {
      setStatus(`Rosto não confere (score ${score.toFixed(0)}). Tente novamente.`);
      setProcessing(false);
    }
  };

  const showVideo = phase === 'camera' || phase === 'captured';

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{mode === 'register' ? 'Cadastro Facial' : 'Validação Facial'}</h2>
          <p className="text-muted-foreground text-sm min-h-[20px]">{status}</p>
        </div>

        <div className="relative aspect-square w-full max-w-[320px] mx-auto overflow-hidden rounded-full border-4 border-primary/20 bg-muted flex items-center justify-center">
          {/* Video sempre montado para que o stream possa ser anexado */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover -scale-x-100 ${showVideo ? '' : 'hidden'}`}
          />
          {showVideo ? (
            <div className="absolute inset-0 border-[16px] border-background/40 rounded-full pointer-events-none">
              <div className={`h-full w-full rounded-full border-2 border-dashed ${testResult?.ok ? 'border-primary' : 'border-primary/50'}`} />
            </div>
          ) : loading ? (
            <Loader2 className="h-16 w-16 text-muted-foreground/50 animate-spin" />
          ) : phase === 'done' ? (
            <CheckCircle2 className="h-16 w-16 text-primary" />
          ) : (
            <Camera className="h-16 w-16 text-muted-foreground/50" />
          )}
        </div>

        <div className="flex flex-col gap-3">
          {phase === 'idle' && (
            <Button size="lg" onClick={startCamera} className="w-full gap-2" disabled={loading}>
              <Camera className="h-5 w-5" />
              {loading ? 'Carregando modelos...' : 'Abrir Câmera'}
            </Button>
          )}

          {phase === 'camera' && (
            <Button
              size="lg"
              onClick={mode === 'register' ? captureRegister : captureValidate}
              className="w-full gap-2"
              disabled={processing}
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
              {mode === 'register' ? 'Coletar Facial' : 'Validar Rosto'}
            </Button>
          )}

          {phase === 'captured' && (
            <>
              <Button size="lg" onClick={runTest} className="w-full gap-2" disabled={processing}>
                {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                {testResult ? 'Testar novamente' : 'Testar reconhecimento'}
              </Button>
              {testResult?.ok && (
                <Button size="lg" variant="default" onClick={saveRegister} className="w-full gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  Salvar cadastro
                </Button>
              )}
              <Button variant="outline" onClick={recollect} className="w-full gap-2" disabled={processing}>
                <RefreshCw className="h-4 w-4" />
                Coletar novamente
              </Button>
            </>
          )}

          <Button variant="ghost" onClick={() => { stopCamera(); onCancel(); }} className="w-full gap-2">
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </div>

        <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
          Privacidade: apenas o descritor numérico (128-D) é armazenado localmente
        </p>
      </div>
    </div>
  );
}
