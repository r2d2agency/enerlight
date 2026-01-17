import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Send, Loader2, Upload, FileText, X } from "lucide-react";
import { api } from "@/lib/api";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";

interface Connection {
  id: string;
  name: string;
  instance_name: string;
  status: string;
}

interface TestMessageDialogProps {
  connection: Connection | null;
  open: boolean;
  onClose: () => void;
}

export function TestMessageDialog({ connection, open, onClose }: TestMessageDialogProps) {
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string; type: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      const url = await uploadFile(selectedFile);
      if (url) {
        setFile({
          url,
          name: selectedFile.name,
          type: selectedFile.type,
        });
        toast.success("Arquivo enviado!");
      }
    } catch (error) {
      toast.error("Erro ao enviar arquivo");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = () => {
    setFile(null);
  };

  const handleSend = async () => {
    if (!phone.trim()) {
      toast.error("Digite o número de telefone");
      return;
    }

    if (!message.trim() && !file) {
      toast.error("Digite uma mensagem ou selecione um arquivo");
      return;
    }

    setSending(true);
    try {
      await api(`/api/evolution/${connection?.id}/test`, {
        method: 'POST',
        body: {
          phone: phone.replace(/\D/g, ''), // Remove non-digits
          message: message.trim() || undefined,
          mediaUrl: file?.url,
          mediaType: file ? getMediaType(file.type) : undefined,
          fileName: file?.name,
        },
      });

      toast.success("Mensagem de teste enviada!");
      handleClose();
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar mensagem de teste");
    } finally {
      setSending(false);
    }
  };

  const getMediaType = (mimeType: string): 'image' | 'video' | 'audio' | 'document' => {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const handleClose = () => {
    setPhone("");
    setMessage("");
    setFile(null);
    onClose();
  };

  const getFileIcon = () => {
    if (!file) return null;
    
    if (file.type.startsWith('image/')) {
      return (
        <img src={file.url} alt="Preview" className="w-10 h-10 object-cover rounded" />
      );
    }
    
    return (
      <div className="flex items-center justify-center w-10 h-10 bg-red-500 rounded">
        <FileText className="h-5 w-5 text-white" />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Enviar Mensagem de Teste
          </DialogTitle>
          <DialogDescription>
            Teste a conexão "{connection?.name}" enviando uma mensagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Número de Telefone</Label>
            <Input
              id="phone"
              placeholder="5511999999999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Digite o número com código do país (ex: 5511999999999)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Mensagem</Label>
            <Textarea
              id="message"
              placeholder="Digite sua mensagem de teste..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Arquivo (opcional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
              onChange={handleFileSelect}
            />
            
            {file ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                {getFileIcon()}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {file.type.split('/').pop()?.toUpperCase()}
                  </p>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-8 w-8"
                  onClick={removeFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full h-20 border-dashed"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-5 w-5 mr-2" />
                    Selecionar arquivo
                  </>
                )}
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSend}
            disabled={sending || isUploading || (!message.trim() && !file)}
          >
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar Teste
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
