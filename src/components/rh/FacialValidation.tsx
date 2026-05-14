import { useState, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, X } from "lucide-react";

interface FacialValidationProps {
  onValidated: (success: boolean) => void;
  onCancel: () => void;
  mode?: 'register' | 'validate';
  sensitivity?: number;
}

export default function FacialValidation({ onValidated, onCancel, mode = 'validate', sensitivity = 0.5 }: FacialValidationProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<string>(mode === 'register' ? "Prepare-se para o cadastro" : "Posicione seu rosto no centro");

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "user" } 
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCapturing(true);
    } catch (err) {
      console.error("Erro ao acessar câmera:", err);
      setStatus("Erro ao acessar câmera. Verifique as permissões.");
    }
  };

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsCapturing(false);
  }, [stream]);

  const validateFace = () => {
    setStatus(mode === 'register' ? "Capturando..." : "Validando...");
    
    setTimeout(() => {
      // Sensitivity logic: higher sensitivity (0.9) makes it harder to pass
      // Lower sensitivity (0.1) makes it easier
      const threshold = 1 - sensitivity;
      const success = Math.random() < (threshold + 0.4); // Random but influenced by sensitivity
      
      if (success) {
        setStatus(mode === 'register' ? "Face cadastrada!" : "Identidade validada!");
        setTimeout(() => {
          stopCamera();
          onValidated(true);
        }, 1000);
      } else {
        setStatus("Falha na captura. Tente novamente.");
        setTimeout(() => {
          setStatus(mode === 'register' ? "Posicione seu rosto" : "Posicione seu rosto no centro");
        }, 2000);
      }
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col items-center justify-center p-6 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{mode === 'register' ? 'Cadastro Facial' : 'Validação Facial'}</h2>
          <p className="text-muted-foreground">{status}</p>
        </div>

        <div className="relative aspect-square w-full max-w-[320px] mx-auto overflow-hidden rounded-full border-4 border-primary/20 bg-muted flex items-center justify-center">
          {!isCapturing ? (
            <Camera className="h-16 w-16 text-muted-foreground/50" />
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
            <Button size="lg" onClick={startCamera} className="w-full gap-2">
              <Camera className="h-5 w-5" />
              Abrir Câmera
            </Button>
          ) : (
            <Button size="lg" onClick={validateFace} className="w-full gap-2" variant="default">
              <RefreshCw className="h-5 w-5" />
              {mode === 'register' ? 'Confirmar Cadastro' : 'Validar Rosto'}
            </Button>
          )}
          
          <Button variant="ghost" onClick={() => { stopCamera(); onCancel(); }} className="w-full gap-2">
            <X className="h-4 w-4" />
            Cancelar
          </Button>
        </div>

        <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
          Privacidade: Imagens não são armazenadas
        </p>
      </div>
    </div>
  );
}
