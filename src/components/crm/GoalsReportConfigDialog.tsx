import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Send, Clock, Users, MessageSquare, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useCRMMyTeam } from "@/hooks/use-crm";

interface ReportConfig {
  id: string;
  connection_id: string;
  send_time: string;
  is_active: boolean;
  include_channel_breakdown: boolean;
  include_enerlight: boolean;
  greeting_template?: string;
}

interface ReportRecipient {
  id: string;
  config_id: string;
  user_id?: string;
  phone: string;
  name: string;
  report_type: "full" | "individual";
  is_active: boolean;
}

interface Connection {
  id: string;
  name: string;
  phone_number?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GoalsReportConfigDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { data: teamMembers } = useCRMMyTeam();

  const { data: connections, isLoading: loadingConn } = useQuery<Connection[]>({
    queryKey: ["connections-list"],
    queryFn: () => api<Connection[]>("/api/connections"),
    enabled: open,
  });

  const { data: config, isLoading: loadingConfig } = useQuery<ReportConfig | null>({
    queryKey: ["goals-report-config"],
    queryFn: () => api<ReportConfig | null>("/api/crm/goals/report-config"),
    enabled: open,
  });

  const { data: recipients, isLoading: loadingRecipients } = useQuery<ReportRecipient[]>({
    queryKey: ["goals-report-recipients"],
    queryFn: () => api<ReportRecipient[]>("/api/crm/goals/report-recipients"),
    enabled: open && !!config,
  });

  const [connectionId, setConnectionId] = useState("");
  const [sendTime, setSendTime] = useState("18:00");
  const [includeChannels, setIncludeChannels] = useState(true);
  const [includeEnerlight, setIncludeEnerlight] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [greetingTemplate, setGreetingTemplate] = useState("Olá {primeiro_nome}, segue seu relatório diário! 👇");

  // New recipient form
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newUserId, setNewUserId] = useState("");
  const [newReportType, setNewReportType] = useState<"full" | "individual">("full");

  // Sync form state when config loads
  useEffect(() => {
    if (config) {
      setConnectionId(config.connection_id || "");
      setSendTime(config.send_time?.slice(0, 5) || "18:00");
      setIncludeChannels(config.include_channel_breakdown ?? true);
      setIncludeEnerlight(config.include_enerlight ?? true);
      setIsActive(config.is_active ?? true);
      setGreetingTemplate(config.greeting_template || "Olá {primeiro_nome}, segue seu relatório diário! 👇");
    }
  }, [config]);

  const saveConfig = useMutation({
    mutationFn: (data: any) => api("/api/crm/goals/report-config", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals-report-config"] });
      toast.success("Configuração salva!");
    },
  });

  const addRecipient = useMutation({
    mutationFn: (data: any) => api("/api/crm/goals/report-recipients", { method: "POST", body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals-report-recipients"] });
      setNewPhone("");
      setNewName("");
      setNewUserId("");
      toast.success("Destinatário adicionado!");
    },
  });

  const removeRecipient = useMutation({
    mutationFn: (id: string) => api(`/api/crm/goals/report-recipients/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals-report-recipients"] });
      toast.success("Destinatário removido!");
    },
  });

  const sendNow = useMutation({
    mutationFn: () => api("/api/crm/goals/report-send-now", { method: "POST" }),
    onSuccess: () => toast.success("Relatório enviado com sucesso!"),
    onError: () => toast.error("Erro ao enviar relatório"),
  });

  const previewReport = useMutation({
    mutationFn: (data: { reportType: string; userId?: string }) =>
      api<{ text: string }>("/api/crm/goals/report-preview", { method: "POST", body: data }),
  });

  const handleSaveConfig = () => {
    if (!connectionId) {
      toast.error("Selecione uma conexão");
      return;
    }
    saveConfig.mutate({
      connection_id: connectionId,
      send_time: sendTime,
      is_active: isActive,
      include_channel_breakdown: includeChannels,
      include_enerlight: includeEnerlight,
      greeting_template: greetingTemplate,
    });
  };

  const handleAddRecipient = () => {
    if (!newPhone.trim()) {
      toast.error("Informe o telefone");
      return;
    }
    addRecipient.mutate({
      phone: newPhone.trim(),
      name: newName.trim() || newPhone.trim(),
      user_id: (newUserId && newUserId !== "none") ? newUserId : null,
      report_type: newReportType,
    });
  };

  const handleSelectUser = (userId: string) => {
    setNewUserId(userId);
    const member = teamMembers?.find((m: any) => m.user_id === userId);
    if (member) {
      setNewName(member.name || "");
      if ((member as any).phone) setNewPhone((member as any).phone);
    }
  };

  const isLoading = loadingConn || loadingConfig;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Relatório Diário via WhatsApp
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            {/* Config */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Settings2 className="h-4 w-4" /> Configuração</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Conexão para envio</Label>
                    <Select value={connectionId} onValueChange={setConnectionId}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {connections?.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Horário de envio</Label>
                    <Input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>Incluir resumo por canal</Label>
                  <Switch checked={includeChannels} onCheckedChange={setIncludeChannels} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Incluir exclusão Enerlight</Label>
                  <Switch checked={includeEnerlight} onCheckedChange={setIncludeEnerlight} />
                </div>
                <div className="flex items-center justify-between">
                  <Label>Envio automático ativo</Label>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>
                <div>
                  <Label>Mensagem de saudação</Label>
                  <Input 
                    value={greetingTemplate} 
                    onChange={e => setGreetingTemplate(e.target.value)} 
                    placeholder="Olá {primeiro_nome}, segue seu relatório!"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Use <code className="bg-muted px-1 rounded">{'{primeiro_nome}'}</code> para inserir o primeiro nome do destinatário
                  </p>
                </div>
                <Button onClick={handleSaveConfig} disabled={saveConfig.isPending} className="w-full">
                  {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
                  Salvar Configuração
                </Button>
              </CardContent>
            </Card>

            {/* Recipients */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Destinatários</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Select value={newUserId} onValueChange={handleSelectUser}>
                    <SelectTrigger><SelectValue placeholder="Usuário..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Manual</SelectItem>
                      {teamMembers?.map((m: any) => (
                        <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} />
                  <Input placeholder="Telefone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                  <Select value={newReportType} onValueChange={(v: any) => setNewReportType(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Completo (Gerente)</SelectItem>
                      <SelectItem value="individual">Individual (Vendedor)</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleAddRecipient} disabled={addRecipient.isPending} size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>

                {recipients && recipients.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipients.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.phone}</TableCell>
                          <TableCell>
                            <Badge variant={r.report_type === "full" ? "default" : "secondary"}>
                              {r.report_type === "full" ? "Completo" : "Individual"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => removeRecipient.mutate(r.id)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Preview & Send */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => previewReport.mutate({ reportType: "full" })}
                disabled={previewReport.isPending}
              >
                {previewReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Pré-visualizar
              </Button>
              <Button
                className="flex-1"
                onClick={() => sendNow.mutate()}
                disabled={sendNow.isPending || !config}
              >
                {sendNow.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Enviar Agora
              </Button>
            </div>

            {previewReport.data?.text && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Pré-visualização</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg font-mono">
                    {previewReport.data.text}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
