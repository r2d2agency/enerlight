import { useEffect, useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAIAgents, AIAgent, ExpenseContact, AgentConnection } from "@/hooks/use-ai-agents";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  Bot, Plus, Trash2, Send, Loader2, User, CheckCircle2,
  AlertCircle, MessageSquare, Wallet, Link as LinkIcon, ArrowLeft, Power
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Connection { id: string; name: string; phone_number?: string; status?: string; }
interface Member { user_id: string; name: string; email: string; }

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tool_calls?: Array<{ tool: string; arguments: Record<string, unknown>; response_preview: string }>;
  error?: boolean;
}

const LOCKED_PROMPT = `Você é um Assistente de Prestação de Contas via WhatsApp. Sua única função é registrar e consultar despesas dos colaboradores autorizados. Seja direto, objetivo e em português brasileiro. Confirme valores e categorias com base em recibos, fotos e mensagens. Nunca invente confirmações: só diga que "salvou" se a ferramenta retornou ✅.`;

export default function PrestacaoContasAgente() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    getAgents, createAgent, updateAgent, deleteAgent, toggleAgent,
    getExpenseContacts, addExpenseContact, removeExpenseContact,
    getAgentConnections, linkAgentToConnection, unlinkAgentFromConnection,
  } = useAIAgents();

  const [agents, setAgents] = useState<AIAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AIAgent | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");

  // detail panel state
  const [contacts, setContacts] = useState<ExpenseContact[]>([]);
  const [agentConns, setAgentConns] = useState<AgentConnection[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactUserId, setNewContactUserId] = useState("");
  const [linkConnectionId, setLinkConnectionId] = useState("");

  // test chat
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadAgents = async () => {
    setLoading(true);
    const all = await getAgents();
    setAgents(all.filter(a => (a as AIAgent & { agent_type?: string }).agent_type === "expense_only"));
    setLoading(false);
  };

  useEffect(() => { loadAgents(); }, []);

  useEffect(() => {
    api<Connection[]>("/api/connections").then(setConnections).catch(() => setConnections([]));
    api<Member[]>("/api/organizations/members").then((m) => setMembers(Array.isArray(m) ? m : [])).catch(() => setMembers([]));
  }, []);

  useEffect(() => {
    if (!selected) return;
    getExpenseContacts(selected.id).then(setContacts);
    getAgentConnections(selected.id).then(setAgentConns);
    setMessages([{ id: "sys", role: "system", content: `Modo de teste: você é o usuário autorizado. Envie "gastei 50 reais de gasolina hoje" para testar.` }]);
  }, [selected?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCreate = async () => {
    if (!createName.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    try {
      const created = await createAgent({
        name: createName.trim(),
        description: "Agente dedicado à Prestação de Contas via WhatsApp",
        ai_provider: "gemini",
        ai_model: "gemini-2.5-flash",
        system_prompt: LOCKED_PROMPT,
        temperature: 0.2,
        max_tokens: 800,
        context_window: 8,
        capabilities: ["manage_expenses"],
        greeting_message: "Olá! Sou seu assistente de prestação de contas. Envie a foto do recibo ou descreva o gasto (ex: 'almoço R$45 cartão').",
        fallback_message: "Não consegui processar. Reenvie o recibo ou descreva: valor, categoria e descrição.",
        language: "pt-BR",
        is_active: true,
        ...({ agent_type: "expense_only" } as Partial<AIAgent>),
      } as Partial<AIAgent>);
      if (created) {
        toast({ title: "Agente criado", description: "Agora vincule à conexão WhatsApp e cadastre contatos." });
        setShowCreate(false);
        setCreateName("");
        await loadAgents();
        setSelected(created);
      }
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Falha ao criar", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este agente? Os contatos e histórico serão removidos.")) return;
    const ok = await deleteAgent(id);
    if (ok) {
      toast({ title: "Excluído" });
      setSelected(null);
      await loadAgents();
    }
  };

  const handleToggle = async (a: AIAgent) => {
    await toggleAgent(a.id);
    await loadAgents();
    if (selected?.id === a.id) setSelected({ ...selected, is_active: !selected.is_active });
  };

  const handleAddContact = async () => {
    if (!selected || !newContactName || !newContactPhone || !newContactUserId) {
      toast({ title: "Preencha nome, telefone e membro interno", variant: "destructive" });
      return;
    }
    const added = await addExpenseContact(selected.id, {
      name: newContactName,
      phone: newContactPhone,
      user_id: newContactUserId,
    });
    if (added) {
      setContacts(await getExpenseContacts(selected.id));
      setNewContactName(""); setNewContactPhone(""); setNewContactUserId("");
      toast({ title: "Contato autorizado" });
    }
  };

  const handleRemoveContact = async (cid: string) => {
    if (!selected) return;
    await removeExpenseContact(selected.id, cid);
    setContacts(await getExpenseContacts(selected.id));
  };

  const handleLinkConnection = async () => {
    if (!selected || !linkConnectionId) return;
    await linkAgentToConnection(selected.id, { connection_id: linkConnectionId, mode: "always", is_active: true });
    setAgentConns(await getAgentConnections(selected.id));
    setLinkConnectionId("");
    toast({ title: "Conexão vinculada", description: "A IA já responderá nesse WhatsApp." });
  };

  const handleUnlinkConnection = async (connId: string) => {
    if (!selected) return;
    await unlinkAgentFromConnection(selected.id, connId);
    setAgentConns(await getAgentConnections(selected.id));
  };

  const handleSendTest = async () => {
    if (!chatInput.trim() || !selected || chatLoading) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: chatInput.trim() };
    setMessages(prev => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    try {
      const history = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
      const resp = await api<{ response: string; tool_calls?: ChatMsg["tool_calls"] }>(
        `/api/ai-agents/${selected.id}/test`,
        { method: "POST", body: { message: userMsg.content, history }, auth: true }
      );
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: resp.response || "(sem resposta)",
        tool_calls: resp.tool_calls,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: e instanceof Error ? e.message : "Erro",
        error: true,
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <MainLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/prestacao-contas")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Wallet className="h-6 w-6" /> Agente de Prestação de Contas
              </h1>
              <p className="text-sm text-muted-foreground">IA dedicada que recebe recibos por WhatsApp e lança despesas automaticamente.</p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" /> Novo Agente</Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Agent list */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Agentes</CardTitle>
              <CardDescription>{agents.length} agente(s) dedicado(s)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && <div className="text-sm text-muted-foreground">Carregando...</div>}
              {!loading && agents.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center border rounded">
                  Nenhum agente. Clique em "Novo Agente".
                </div>
              )}
              {agents.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className={`w-full text-left p-3 rounded border transition ${selected?.id === a.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bot className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium truncate">{a.name}</span>
                    </div>
                    <Badge variant={a.is_active ? "default" : "secondary"} className="text-xs">
                      {a.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {a.connections_count || 0} conexão(ões) · {a.knowledge_sources_count || 0} contato(s)
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Detail panel */}
          <div className="lg:col-span-2">
            {!selected ? (
              <Card>
                <CardContent className="p-10 text-center text-muted-foreground">
                  Selecione um agente para configurar contatos, conexão WhatsApp e testar.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Bot className="h-5 w-5" /> {selected.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={selected.is_active} onCheckedChange={() => handleToggle(selected)} />
                        <span className="text-sm">Ativo</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(selected.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="connection">
                    <TabsList className="grid grid-cols-3">
                      <TabsTrigger value="connection"><LinkIcon className="h-4 w-4 mr-1" /> Conexão</TabsTrigger>
                      <TabsTrigger value="contacts"><User className="h-4 w-4 mr-1" /> Contatos</TabsTrigger>
                      <TabsTrigger value="test"><MessageSquare className="h-4 w-4 mr-1" /> Testar</TabsTrigger>
                    </TabsList>

                    {/* CONNECTION TAB */}
                    <TabsContent value="connection" className="space-y-3 mt-4">
                      <div className="text-sm text-muted-foreground">
                        Vincule este agente a uma conexão WhatsApp. Ele responderá automaticamente apenas a contatos autorizados.
                      </div>
                      <div className="flex gap-2">
                        <Select value={linkConnectionId} onValueChange={setLinkConnectionId}>
                          <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione uma conexão" /></SelectTrigger>
                          <SelectContent>
                            {connections.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name} {c.phone_number ? `(${c.phone_number})` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleLinkConnection} disabled={!linkConnectionId}><Plus className="h-4 w-4 mr-1" /> Vincular</Button>
                      </div>
                      <div className="space-y-2">
                        {agentConns.length === 0 && (
                          <div className="text-sm text-muted-foreground border rounded p-3 text-center">Nenhuma conexão vinculada.</div>
                        )}
                        {agentConns.map(ac => (
                          <div key={ac.id} className="flex items-center justify-between border rounded p-3">
                            <div>
                              <div className="font-medium text-sm">{ac.connection_name || ac.connection_id}</div>
                              <div className="text-xs text-muted-foreground">Modo: {ac.mode} · {ac.is_active ? "ativa" : "inativa"}</div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleUnlinkConnection(ac.connection_id)}>
                              <Power className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* CONTACTS TAB */}
                    <TabsContent value="contacts" className="space-y-3 mt-4">
                      <div className="text-sm text-muted-foreground">
                        Cadastre os números que podem enviar despesas. Cada número é vinculado a um membro interno (proprietário do lançamento).
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <Input placeholder="Nome" value={newContactName} onChange={e => setNewContactName(e.target.value)} />
                        <Input placeholder="Telefone (DDD)" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} />
                        <Select value={newContactUserId} onValueChange={setNewContactUserId}>
                          <SelectTrigger><SelectValue placeholder="Membro interno" /></SelectTrigger>
                          <SelectContent>
                            {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name || m.email}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button onClick={handleAddContact}><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
                      </div>
                      <div className="space-y-2">
                        {contacts.length === 0 && (
                          <div className="text-sm text-muted-foreground border rounded p-3 text-center">Nenhum contato autorizado ainda.</div>
                        )}
                        {contacts.map(c => (
                          <div key={c.id} className="flex items-center justify-between border rounded p-3">
                            <div>
                              <div className="font-medium text-sm">{c.name}</div>
                              <div className="text-xs text-muted-foreground">{c.phone} {c.user_id ? "· vinculado" : "· SEM membro"}</div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveContact(c.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* TEST TAB */}
                    <TabsContent value="test" className="mt-4">
                      <div className="border rounded-lg flex flex-col h-[500px]">
                        <ScrollArea className="flex-1 p-3">
                          <div className="space-y-3">
                            {messages.map(m => (
                              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                                  m.role === "user" ? "bg-primary text-primary-foreground"
                                  : m.role === "system" ? "bg-muted text-xs"
                                  : m.error ? "bg-destructive/10 text-destructive"
                                  : "bg-muted"
                                }`}>
                                  <div className="whitespace-pre-wrap">{m.content}</div>
                                  {m.tool_calls && m.tool_calls.length > 0 && (
                                    <div className="mt-2 space-y-1">
                                      {m.tool_calls.map((tc, i) => (
                                        <div key={i} className="text-xs bg-background/50 border rounded p-2">
                                          <div className="flex items-center gap-1 font-mono font-semibold">
                                            {tc.response_preview.startsWith("✅") ? (
                                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                                            ) : (
                                              <AlertCircle className="h-3 w-3 text-amber-600" />
                                            )}
                                            {tc.tool}
                                          </div>
                                          <div className="text-muted-foreground mt-1 whitespace-pre-wrap">{tc.response_preview}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {chatLoading && (
                              <div className="flex justify-start">
                                <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                                  <Loader2 className="h-3 w-3 animate-spin" /> processando...
                                </div>
                              </div>
                            )}
                            <div ref={chatEndRef} />
                          </div>
                        </ScrollArea>
                        <div className="border-t p-2 flex gap-2">
                          <Input
                            placeholder="Ex.: gastei R$45 de almoço hoje no cartão"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSendTest())}
                            disabled={chatLoading}
                          />
                          <Button onClick={handleSendTest} disabled={chatLoading || !chatInput.trim()}>
                            <Send className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        No modo teste, VOCÊ é o usuário autorizado — as despesas criadas serão lançadas na sua conta para validação.
                      </p>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Agente de Prestação de Contas</DialogTitle>
            <DialogDescription>
              Criamos com configurações otimizadas: Gemini 2.5 Flash, temperatura 0.2, capacidade única de gestão de despesas. Você só precisa dar um nome.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nome do agente</Label>
            <Input
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="Ex.: Financeiro - Despesas"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
