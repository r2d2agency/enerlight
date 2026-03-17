import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Send, Trash2, RefreshCw, MessageSquare, FileText, CheckCircle, Clock, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMetaTemplates, useMetaTemplateMutations, MetaTemplate } from "@/hooks/use-meta-templates";

interface Connection {
  id: string;
  name: string;
  provider?: string;
  status: string;
}

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  APPROVED: { label: "Aprovado", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  PENDING: { label: "Pendente", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
  REJECTED: { label: "Rejeitado", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  PAUSED: { label: "Pausado", variant: "outline", icon: <AlertTriangle className="h-3 w-3" /> },
};

const categoryLabels: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilitário",
  AUTHENTICATION: "Autenticação",
};

export default function MetaTemplates() {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendTemplate, setSendTemplate] = useState<MetaTemplate | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendParams, setSendParams] = useState<Record<string, string>>({});

  // New template form
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("UTILITY");
  const [newLanguage, setNewLanguage] = useState("pt_BR");
  const [newHeaderText, setNewHeaderText] = useState("");
  const [newBodyText, setNewBodyText] = useState("");
  const [newFooterText, setNewFooterText] = useState("");

  // Get Meta connections
  const { data: connections = [] } = useQuery<Connection[]>({
    queryKey: ["connections"],
    queryFn: () => api("/api/connections"),
  });
  const metaConnections = connections.filter(c => c.provider === "meta");

  const { data: templates = [], isLoading, refetch } = useMetaTemplates(selectedConnectionId);
  const mutations = useMetaTemplateMutations(selectedConnectionId);

  const handleCreate = async () => {
    if (!newName || !newBodyText) {
      toast.error("Nome e corpo da mensagem são obrigatórios");
      return;
    }

    const components: any[] = [];
    if (newHeaderText) {
      components.push({ type: "HEADER", format: "TEXT", text: newHeaderText });
    }
    components.push({ type: "BODY", text: newBodyText });
    if (newFooterText) {
      components.push({ type: "FOOTER", text: newFooterText });
    }

    try {
      await mutations.createTemplate.mutateAsync({
        name: newName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
        language: newLanguage,
        category: newCategory,
        components,
      });
      toast.success("Template enviado para aprovação!");
      setCreateOpen(false);
      setNewName("");
      setNewBodyText("");
      setNewHeaderText("");
      setNewFooterText("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar template");
    }
  };

  const handleSend = async () => {
    if (!sendTo || !sendTemplate) {
      toast.error("Informe o número de destino");
      return;
    }

    // Build components with parameters
    const components: any[] = [];
    const paramEntries = Object.entries(sendParams).filter(([, v]) => v);
    if (paramEntries.length > 0) {
      components.push({
        type: "body",
        parameters: paramEntries.map(([, value]) => ({ type: "text", text: value })),
      });
    }

    try {
      await mutations.sendTemplate.mutateAsync({
        to: sendTo,
        template_name: sendTemplate.name,
        language_code: sendTemplate.language,
        components: components.length > 0 ? components : undefined,
      });
      toast.success("Mensagem template enviada!");
      setSendOpen(false);
      setSendTo("");
      setSendParams({});
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar template");
    }
  };

  const handleDelete = async (template: MetaTemplate) => {
    if (!confirm(`Excluir template "${template.name}"?`)) return;
    try {
      await mutations.deleteTemplate.mutateAsync(template.name);
      toast.success("Template excluído");
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir template");
    }
  };

  const extractVariables = (text?: string): string[] => {
    if (!text) return [];
    const matches = text.match(/\{\{(\d+)\}\}/g);
    return matches || [];
  };

  const openSendDialog = (template: MetaTemplate) => {
    setSendTemplate(template);
    setSendTo("");
    const bodyComponent = template.components?.find(c => c.type === "BODY");
    const vars = extractVariables(bodyComponent?.text);
    const params: Record<string, string> = {};
    vars.forEach((v, i) => { params[`param_${i + 1}`] = ""; });
    setSendParams(params);
    setSendOpen(true);
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Templates WhatsApp</h1>
            <p className="text-sm text-muted-foreground">Gerencie templates de mensagem da API Meta</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedConnectionId} onValueChange={setSelectedConnectionId}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Selecione a conexão Meta" />
              </SelectTrigger>
              <SelectContent>
                {metaConnections.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedConnectionId && (
              <>
                <Button variant="outline" size="icon" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Novo Template
                </Button>
              </>
            )}
          </div>
        </div>

        {!selectedConnectionId && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Selecione uma conexão Meta para gerenciar templates</p>
              {metaConnections.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  Nenhuma conexão Meta encontrada. Crie uma em Conexões → Nova Conexão → API Meta.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {selectedConnectionId && isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {selectedConnectionId && !isLoading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {templates.map((template) => {
              const st = statusMap[template.status] || statusMap.PENDING;
              const bodyComp = template.components?.find(c => c.type === "BODY");
              const headerComp = template.components?.find(c => c.type === "HEADER");
              const footerComp = template.components?.find(c => c.type === "FOOTER");

              return (
                <Card key={template.id} className="flex flex-col">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {template.name}
                      </CardTitle>
                      <Badge variant={st.variant} className="flex items-center gap-1 text-xs">
                        {st.icon} {st.label}
                      </Badge>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Badge variant="outline" className="text-[10px]">
                        {categoryLabels[template.category] || template.category}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {template.language}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2">
                    {headerComp?.text && (
                      <div className="text-xs">
                        <span className="font-semibold text-muted-foreground">Cabeçalho:</span>
                        <p className="mt-0.5">{headerComp.text}</p>
                      </div>
                    )}
                    {bodyComp?.text && (
                      <div className="text-xs">
                        <span className="font-semibold text-muted-foreground">Corpo:</span>
                        <p className="mt-0.5 whitespace-pre-wrap">{bodyComp.text}</p>
                      </div>
                    )}
                    {footerComp?.text && (
                      <div className="text-xs text-muted-foreground italic">{footerComp.text}</div>
                    )}

                    <div className="flex gap-2 pt-2">
                      {template.status === "APPROVED" && (
                        <Button size="sm" variant="outline" onClick={() => openSendDialog(template)}>
                          <Send className="h-3 w-3 mr-1" /> Enviar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(template)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {templates.length === 0 && (
              <Card className="col-span-full">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Nenhum template encontrado</p>
                  <Button className="mt-4" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Criar Template
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Create Template Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Criar Template de Mensagem</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Template</Label>
                <Input
                  placeholder="Ex: confirmacao_pedido"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Apenas letras minúsculas, números e underscores</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UTILITY">Utilitário</SelectItem>
                      <SelectItem value="MARKETING">Marketing</SelectItem>
                      <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Idioma</Label>
                  <Select value={newLanguage} onValueChange={setNewLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt_BR">Português (BR)</SelectItem>
                      <SelectItem value="en_US">English (US)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cabeçalho (opcional)</Label>
                <Input
                  placeholder="Texto do cabeçalho"
                  value={newHeaderText}
                  onChange={(e) => setNewHeaderText(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Corpo da Mensagem *</Label>
                <Textarea
                  placeholder={"Olá {{1}}, seu pedido {{2}} foi confirmado!\n\nUse {{1}}, {{2}} para variáveis"}
                  value={newBodyText}
                  onChange={(e) => setNewBodyText(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
              <div className="space-y-2">
                <Label>Rodapé (opcional)</Label>
                <Input
                  placeholder="Ex: Responda SAIR para cancelar"
                  value={newFooterText}
                  onChange={(e) => setNewFooterText(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={mutations.createTemplate.isPending}>
                {mutations.createTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Enviar para Aprovação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Template Dialog */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enviar Template: {sendTemplate?.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Número de Destino</Label>
                <Input
                  placeholder="5511999999999"
                  value={sendTo}
                  onChange={(e) => setSendTo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Código do país + DDD + número, sem espaços</p>
              </div>

              {Object.keys(sendParams).length > 0 && (
                <div className="space-y-2">
                  <Label>Variáveis do Template</Label>
                  {Object.entries(sendParams).map(([key, value], idx) => (
                    <div key={key} className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">{`{{${idx + 1}}}`}</Badge>
                      <Input
                        placeholder={`Valor para {{${idx + 1}}}`}
                        value={value}
                        onChange={(e) => setSendParams(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              {sendTemplate && (
                <div className="rounded-lg border p-3 bg-muted/50">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
                  <p className="text-sm whitespace-pre-wrap">
                    {sendTemplate.components?.find(c => c.type === "BODY")?.text || ""}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendOpen(false)}>Cancelar</Button>
              <Button onClick={handleSend} disabled={mutations.sendTemplate.isPending}>
                {mutations.sendTemplate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                <Send className="h-4 w-4 mr-2" /> Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
