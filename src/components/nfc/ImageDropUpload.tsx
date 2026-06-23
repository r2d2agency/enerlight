import { useCallback, useEffect, useRef, useState } from "react";
import { useUpload } from "@/hooks/use-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, X, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  /** When true, listens to paste events on the whole window while mounted */
  enablePaste?: boolean;
  aspect?: "square" | "wide";
}

export function ImageDropUpload({ value, onChange, label, enablePaste = true, aspect = "square" }: Props) {
  const { uploadFile, isUploading, progress } = useUpload();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Apenas imagens são permitidas");
      return;
    }
    try {
      const url = await uploadFile(file);
      if (url) {
        onChange(url);
        toast.success("Imagem enviada");
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar imagem");
    }
  }, [uploadFile, onChange]);

  // Paste handler (window-level when enabled)
  useEffect(() => {
    if (!enablePaste) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enablePaste, handleFile]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-medium">{label}</div>}
      <div
        ref={zoneRef}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative cursor-pointer rounded-lg border-2 border-dashed transition-colors flex items-center justify-center overflow-hidden
          ${dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50 bg-muted/30"}
          ${aspect === "square" ? "aspect-square max-w-[200px]" : "aspect-[3/1]"}
        `}
      >
        {value ? (
          <>
            <img src={value} alt="preview" className="h-full w-full object-cover" />
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="absolute top-1 right-1 h-7 w-7"
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : isUploading ? (
          <div className="text-center p-4">
            <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
            <p className="text-xs mt-2 text-muted-foreground">{progress}%</p>
          </div>
        ) : (
          <div className="text-center p-4 text-muted-foreground">
            <Upload className="h-6 w-6 mx-auto mb-1" />
            <p className="text-xs">Clique, arraste ou cole (Ctrl+V)</p>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      <div className="flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ou cole uma URL https://..."
          className="text-xs h-8"
        />
      </div>
    </div>
  );
}
