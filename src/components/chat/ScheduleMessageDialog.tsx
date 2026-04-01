import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, Loader2, Trash2, Image, X, FileText, Mic, Square, Play, Pause, Music } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ScheduledMessage } from "@/hooks/use-chat";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

interface ScheduleMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSchedule: (data: {
    content?: string;
    message_type?: string;
    media_url?: string;
    media_mimetype?: string;
    scheduled_at: string;
  }) => Promise<void>;
  scheduledMessages: ScheduledMessage[];
  onCancelScheduled: (id: string) => Promise<void>;
  sending?: boolean;
}

export function ScheduleMessageDialog({
  open,
  onOpenChange,
  onSchedule,
  scheduledMessages,
  onCancelScheduled,
  sending,
}: ScheduleMessageDialogProps) {
  const isMobile = useIsMobile();
  const [content, setContent] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState("09:00");
  const [showCalendar, setShowCalendar] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaMimetype, setMediaMimetype] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"text" | "image" | "document" | "audio">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  
  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

  const { uploadFile, isUploading } = useUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");

    try {
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setMediaPreview(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        setMediaPreview(null);
      }

      const url = await uploadFile(file);
      if (url) {
        setMediaUrl(url);
        setMediaMimetype(file.type);
        setMediaType(isAudio ? "audio" : isImage ? "image" : "document");
        setAudioBlob(null);
        toast.success("Arquivo carregado com sucesso!");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Erro ao carregar arquivo");
      clearMedia();
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadFile(file);
      if (url) {
        setMediaUrl(url);
        setMediaMimetype(file.type);
        setMediaType("audio");
        setMediaPreview(null);
        setAudioBlob(null);
        toast.success("Áudio carregado com sucesso!");
      }
    } catch (error) {
      toast.error("Erro ao carregar áudio");
      clearMedia();
    }

    if (audioInputRef.current) audioInputRef.current.value = "";
  };

  // ---- Audio Recording ----
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration((d) => d + 1);
      }, 1000);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setIsRecording(false);
  };

  const uploadRecordedAudio = async () => {
    if (!audioBlob) return;
    try {
      const file = new File([audioBlob], `audio_${Date.now()}.webm`, { type: "audio/webm" });
      const url = await uploadFile(file);
      if (url) {
        setMediaUrl(url);
        setMediaMimetype("audio/webm");
        setMediaType("audio");
        setMediaPreview(null);
        toast.success("Áudio gravado carregado!");
      }
    } catch {
      toast.error("Erro ao enviar áudio gravado");
    }
  };

  const discardRecording = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
  };

  const togglePreview = () => {
    if (!audioBlob) return;
    if (isPlayingPreview) {
      audioPreviewRef.current?.pause();
      setIsPlayingPreview(false);
    } else {
      const url = URL.createObjectURL(audioBlob);
      const audio = new Audio(url);
      audioPreviewRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
      audio.play();
      setIsPlayingPreview(true);
    }
  };

  const formatDuration = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  const clearMedia = () => {
    setMediaPreview(null);
    setMediaUrl(null);
    setMediaMimetype(null);
    setMediaType("text");
    setAudioBlob(null);
    setRecordingDuration(0);
    if (audioPreviewRef.current) {
      audioPreviewRef.current.pause();
      setIsPlayingPreview(false);
    }
  };

  const handleSchedule = async () => {
    if (!date) return;
    
    if (!content.trim() && !mediaUrl) {
      toast.error("Adicione uma mensagem, áudio ou arquivo");
      return;
    }

    const [hours, minutes] = time.split(":").map(Number);
    const scheduledDate = new Date(date);
    scheduledDate.setHours(hours, minutes, 0, 0);

    await onSchedule({
      content: content.trim() || undefined,
      message_type: mediaUrl ? mediaType : "text",
      media_url: mediaUrl || undefined,
      media_mimetype: mediaMimetype || undefined,
      scheduled_at: scheduledDate.toISOString(),
    });

    setContent("");
    setDate(undefined);
    setTime("09:00");
    clearMedia();
    onOpenChange(false);
  };

  const formatScheduledDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getMessageIcon = (msg: ScheduledMessage) => {
    if (msg.message_type === "image") return <Image className="h-3 w-3" />;
    if (msg.message_type === "audio") return <Music className="h-3 w-3" />;
    if (msg.message_type === "document") return <FileText className="h-3 w-3" />;
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-w-md overflow-y-auto",
        isMobile ? "h-[100dvh] max-h-[100dvh] w-full rounded-none p-4" : "max-h-[90vh]"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Agendar Mensagem
          </DialogTitle>
          <DialogDescription>
            Programe uma mensagem para ser enviada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Attachments: File + Audio */}
          <div className="space-y-2">
            <Label>Anexo (opcional)</Label>
            <div className="flex gap-2">
              {/* File upload (image/document) */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileSelect}
                className="hidden"
              />
              {/* Audio file upload */}
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*"
                onChange={handleAudioFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isRecording}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Carregando...
                  </>
                ) : (
                  <>
                    <Image className="h-4 w-4 mr-1.5" />
                    Imagem/Doc
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => audioInputRef.current?.click()}
                disabled={isUploading || isRecording}
              >
                <Music className="h-4 w-4 mr-1.5" />
                Áudio
              </Button>
            </div>

            {/* Audio Recorder */}
            {!mediaUrl && (
              <div className="flex items-center gap-2">
                {!isRecording && !audioBlob && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={startRecording}
                    disabled={isUploading}
                    className="w-full"
                  >
                    <Mic className="h-4 w-4 mr-1.5 text-destructive" />
                    Gravar áudio
                  </Button>
                )}

                {isRecording && (
                  <div className="flex items-center gap-2 w-full p-2 rounded-lg border border-destructive/30 bg-destructive/5">
                    <div className="h-2.5 w-2.5 rounded-full bg-destructive animate-pulse" />
                    <span className="text-sm font-mono flex-1">{formatDuration(recordingDuration)}</span>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      onClick={stopRecording}
                    >
                      <Square className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}

                {audioBlob && !isRecording && (
                  <div className="flex items-center gap-2 w-full p-2 rounded-lg border bg-muted/30">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={togglePreview}
                    >
                      {isPlayingPreview ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <span className="text-sm font-mono flex-1">{formatDuration(recordingDuration)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={discardRecording}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={uploadRecordedAudio}
                      disabled={isUploading}
                    >
                      {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Usar"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Media Preview */}
            {mediaUrl && (
              <div className="relative inline-block">
                {mediaType === "image" && mediaPreview ? (
                  <img
                    src={mediaPreview}
                    alt="Preview"
                    className="max-h-32 rounded-lg border"
                  />
                ) : mediaType === "audio" ? (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Mic className="h-5 w-5 text-primary" />
                    <span className="text-sm">Áudio anexado</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <FileText className="h-5 w-5" />
                    <span className="text-sm">Documento anexado</span>
                  </div>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={clearMedia}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Message content */}
          <div className="space-y-2">
            <Label>Mensagem {mediaUrl ? "(legenda)" : ""}</Label>
            <Textarea
              placeholder={mediaUrl ? "Digite uma legenda (opcional)..." : "Digite a mensagem..."}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
            />
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label>Data</Label>
            <Popover open={showCalendar} onOpenChange={setShowCalendar}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarClock className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[100]" align="center" side={isMobile ? "top" : "bottom"}>
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    setDate(d);
                    setShowCalendar(false);
                  }}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time picker */}
          <div className="space-y-2">
            <Label>Horário</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          {/* Scheduled messages list */}
          {scheduledMessages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Mensagens agendadas</Label>
              <div className="max-h-[150px] overflow-y-auto space-y-2">
                {scheduledMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2 p-2 rounded-lg bg-muted text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        {getMessageIcon(msg)}
                        {formatScheduledDate(msg.scheduled_at)}
                      </p>
                      {msg.media_url && (
                        <p className="text-xs text-primary">
                          {msg.message_type === "image" ? "📷 Imagem" : msg.message_type === "audio" ? "🎤 Áudio" : "📄 Documento"}
                        </p>
                      )}
                      {msg.content && <p className="line-clamp-2">{msg.content}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive flex-shrink-0"
                      onClick={() => onCancelScheduled(msg.id)}
                      title="Cancelar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={(!content.trim() && !mediaUrl) || !date || sending || isUploading || isRecording}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Agendando...
              </>
            ) : (
              "Agendar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
