import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, Send, AlertCircle, Paperclip, X, FileText } from "lucide-react";
import { useSMTPStatus, useEmailTemplates, useSendEmail } from "@/hooks/use-email";
import { RichEmailEditor } from "@/components/email/RichEmailEditor";
import { useUpload } from "@/hooks/use-upload";
import { toast } from "sonner";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toEmail?: string;
  toName?: string;
  contextType?: string;
  contextId?: string;
  variables?: Record<string, string>;
}

interface Attachment {
  name: string;
  url: string;
  size?: number;
  type?: string;
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function SendEmailDialog({ 
  open, 
  onOpenChange,
  toEmail = "",
  toName = "",
  contextType,
  contextId,
  variables = {}
}: SendEmailDialogProps) {
  const { data: smtpStatus, isLoading: loadingStatus } = useSMTPStatus();
  const { data: templates = [] } = useEmailTemplates();
  const sendEmail = useSendEmail();
  const { uploadFile, uploading } = useUpload();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [form, setForm] = useState({
    to_email: "",
    to_name: "",
    subject: "",
    body_html: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        to_email: toEmail,
        to_name: toName,
        subject: "",
        body_html: "",
      });
      setSelectedTemplateId("");
      setAttachments([]);
    }
  }, [open, toEmail, toName]);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === "custom") return;

    const template = templates.find(t => t.id === templateId);
    if (template) {
      let subject = template.subject;
      let body = template.body_html;

      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\s*${key}\\s*\\}`, 'gi');
        subject = subject.replace(regex, value || '');
        body = body.replace(regex, value || '');
      });

      setForm(prev => ({ ...prev, subject, body_html: body }));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`"${file.name}" excede 10MB`);
        continue;
      }
      try {
        const url = await uploadFile(file);
        setAttachments(prev => [...prev, {
          name: file.name,
          url,
          size: file.size,
          type: file.type,
        }]);
      } catch {
        toast.error(`Erro ao enviar "${file.name}"`);
      }
    }
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!form.to_email) {
      toast.error("Email do destinatário é obrigatório");
      return;
    }
    if (!form.subject) {
      toast.error("Assunto é obrigatório");
      return;
    }

    try {
      await sendEmail.mutateAsync({
        to_email: form.to_email,
        to_name: form.to_name,
        subject: form.subject,
        body_html: form.body_html,
        template_id: selectedTemplateId && selectedTemplateId !== "custom" ? selectedTemplateId : undefined,
        variables,
        context_type: contextType,
        context_id: contextId,
        send_immediately: true,
        attachments: attachments.map(a => ({ filename: a.name, path: a.url })),
      } as any);
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  const isConfigured = smtpStatus?.configured && smtpStatus?.verified;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Enviar E-mail
          </DialogTitle>
        </DialogHeader>

        {loadingStatus ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !isConfigured ? (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <AlertCircle className="h-12 w-12 text-yellow-500" />
            <div>
              <p className="font-medium">SMTP não configurado</p>
              <p className="text-sm text-muted-foreground">
                Configure o servidor SMTP em Configurações → E-mail antes de enviar emails.
              </p>
            </div>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        ) : (
          <ScrollArea className="flex-1 max-h-[calc(90vh-120px)]">
            <div className="space-y-4 pr-4">
              {/* Template + Recipient row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Template</Label>
                  <Select value={selectedTemplateId} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom">Escrever do zero</SelectItem>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nome (opcional)</Label>
                  <Input
                    className="h-9"
                    value={form.to_name}
                    onChange={(e) => setForm({ ...form, to_name: e.target.value })}
                    placeholder="Nome do destinatário"
                  />
                </div>
              </div>

              {/* Email + Subject row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Email do destinatário *</Label>
                  <Input
                    className="h-9"
                    type="email"
                    value={form.to_email}
                    onChange={(e) => setForm({ ...form, to_email: e.target.value })}
                    placeholder="email@exemplo.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Assunto *</Label>
                  <Input
                    className="h-9"
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    placeholder="Assunto do email"
                  />
                </div>
              </div>

              <Separator />

              {/* Rich HTML Editor */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Mensagem</Label>
                <RichEmailEditor
                  value={form.body_html}
                  onChange={(val) => setForm({ ...form, body_html: val })}
                  placeholder="Escreva sua mensagem..."
                  className="min-h-[250px]"
                />
              </div>

              {/* Attachments */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium">Anexos</Label>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileUpload}
                      accept="*/*"
                    />
                    <Button variant="outline" size="sm" className="h-7 text-xs" asChild disabled={uploading}>
                      <span>
                        {uploading ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Paperclip className="h-3 w-3 mr-1" />
                        )}
                        Anexar arquivo
                      </span>
                    </Button>
                  </label>
                </div>

                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((att, i) => (
                      <Badge key={i} variant="secondary" className="flex items-center gap-1.5 py-1 px-2">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span className="text-xs truncate max-w-[150px]">{att.name}</span>
                        {att.size && (
                          <span className="text-[10px] text-muted-foreground">{formatFileSize(att.size)}</span>
                        )}
                        <button onClick={() => removeAttachment(i)} className="ml-1 hover:text-destructive">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Variables info */}
              {Object.keys(variables).length > 0 && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Variáveis disponíveis:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(variables).map(([key, value]) => (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {`{${key}}`}: {value || "(vazio)"}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 pb-1">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSend} disabled={sendEmail.isPending || uploading}>
                  {sendEmail.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Enviar
                </Button>
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
