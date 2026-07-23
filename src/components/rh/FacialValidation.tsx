import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X, Loader2 } from "lucide-react";
import * as faceapi from '@vladmandic/face-api';
import * as tf from '@vladmandic/face-api/dist/tfjs.esm.js';

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

export default function FacialValidation({
  onValidated,
  onCancel,
  mode = 'validate',
  sensitivity = 0.5,
  targetId,
}: FacialValidationProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>('Carregando modelos...');

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
    if (stream) stream.getTracks().forEach((t) => t.stop());
    setStream(null);
    setIsCapturing(false);
  }, [stream]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play().catch(() => {});
      }
      setIsCapturing(true);
    } catch (err) {
      console.error('Erro ao acessar câmera:', err);
      setStatus('Erro ao acessar câmera. Verifique as permissões.');
    }
  };

  const capture = async () => {
    if (!videoRef.current || processing) return;
    setProcessing(true);
    setStatus(mode === 'register' ? 'Capturando...' : 'Validando...');

    // Retry loop to give tempo do rosto ser detectado
    const maxAttempts = 8;
    const delay = backendReady === 'cpu' ? 350 : 200;
    let det: Awaited<ReturnType<typeof detectOnce>> = null;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        det = await detectOnce(videoRef.current);
      } catch (e) {
        console.error('detect error', e);
      }
      if (det) break;
      await new Promise((r) => setTimeout(r, delay));
    }

    if (!det) {
      setStatus('Nenhum rosto detectado. Ajuste a iluminação e tente novamente.');
      setProcessing(false);
      return;
    }

    const descriptor = Array.from(det.descriptor);

    if (mode === 'register') {
      if (!targetId) {
        setStatus('ID de destino ausente. Não foi possível salvar o cadastro.');
        setProcessing(false);
        return;
      }
      localStorage.setItem(DESC_KEY(targetId), JSON.stringify(descriptor));
      localStorage.setItem(REG_KEY(targetId), 'true');
      setStatus('Face cadastrada com sucesso!');
      setTimeout(() => {
        stopCamera();
        onValidated(true);
      }, 800);
      return;
    }

    // validate
    if (!targetId) {
      setStatus('ID de destino ausente.');
      setProcessing(false);
      return;
    }
    const raw = localStorage.getItem(DESC_KEY(targetId));
    if (!raw) {
      setStatus('Nenhum cadastro facial encontrado para este usuário.');
      setTimeout(() => {
        stopCamera();
        onValidated(false);
      }, 1200);
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
    const a = new Float32Array(descriptor);
    const b = new Float32Array(stored);
    const distance = faceapi.euclideanDistance(a, b);
    const score = distanceToScore(distance);
    // sensitivity 0..1 -> threshold 0.75 (permissivo) .. 0.45 (rigoroso)
    const threshold = 0.75 - sensitivity * 0.30;
    const success = distance <= threshold;

    console.log('[FacialValidation] distance=', distance.toFixed(3), 'threshold=', threshold.toFixed(3), 'score=', score.toFixed(1));

    if (success) {
      setStatus(`Identidade validada! (score ${score.toFixed(0)})`);
      setTimeout(() => {
        stopCamera();
        onValidated(true);
      }, 800);
    } else {
      setStatus(`Rosto não confere (score ${score.toFixed(0)}). Tente novamente.`);
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{mode === 'register' ? 'Cadastro Facial' : 'Validação Facial'}</h2>
          <p className="text-muted-foreground text-sm min-h-[20px]">{status}</p>
        </div>

        <div className="relative aspect-square w-full max-w-[320px] mx-auto overflow-hidden rounded-full border-4 border-primary/20 bg-muted flex items-center justify-center">
          {!isCapturing ? (
            loading ? (
              <Loader2 className="h-16 w-16 text-muted-foreground/50 animate-spin" />
            ) : (
              <Camera className="h-16 w-16 text-muted-foreground/50" />
            )
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover -scale-x-100"
              />
              <div className="absolute inset-0 border-[16px] border-background/40 rounded-full pointer-events-none">
                <div className="h-full w-full rounded-full border-2 border-primary/50 border-dashed" />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {!isCapturing ? (
            <Button size="lg" onClick={startCamera} className="w-full gap-2" disabled={loading}>
              <Camera className="h-5 w-5" />
              {loading ? 'Carregando modelos...' : 'Abrir Câmera'}
            </Button>
          ) : (
            <Button size="lg" onClick={capture} className="w-full gap-2" disabled={processing}>
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-5 w-5" />}
              {mode === 'register' ? 'Confirmar Cadastro' : 'Validar Rosto'}
            </Button>
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
