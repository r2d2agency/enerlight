import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useDevolucao, useDevolucaoMutations, useDevolucaoAnexoMutations, useDevolucaoEventoMutations,
  useDevolucaoItemMutations,
  STATUS_LABELS, STATUS_ORDER, REASON_LABELS, DevolucaoStatus
} from "@/hooks/use-devolucoes";
import { useLogisticsCarriers } from "@/hooks/use-logistics";
import { useUpload } from "@/hooks/use-upload";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { safeFormatDate } from "@/lib/utils";
import { Loader2, Upload, FileText, Image as ImageIcon, Truck, Wrench, MessageCircle, Trash2, Send, History, ChevronRight, Check, X, Ban, ArrowRight, CheckCircle2, MoreHorizontal, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  solicitado: 'bg-slate-100 text-slate-700',
  aguardando_nf_produto: 'bg-amber-100 text-amber-700',
  recebido: 'bg-blue-100 text-blue-700',
  em_analise: 'bg-purple-100 text-purple-700',
  cliente_notificado: 'bg-cyan-100 text-cyan-700',
  aguardando_nf_retorno: 'bg-orange-100 text-orange-700',
  troca_conserto: 'bg-indigo-100 text-indigo-700',
  enviado: 'bg-teal-100 text-teal-700',
  concluido: 'bg-green-100 text-green-700',
  recusado: 'bg-red-100 text-red-700',
  cancelado: 'bg-gray-200 text-gray-700',
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  devolucaoId: string | null;
}

export function DevolucaoDetailDialog({ open, onOpenChange, devolucaoId }: Props) {
  const { user } = useAuth();
  const { data: dev, isLoading } = useDevolucao(devolucaoId);
  const { data: carriers = [] } = useLogisticsCarriers();
  const { update, changeStatus } = useDevolucaoMutations();
  const anexoMut = useDevolucaoAnexoMutations();
  const eventoMut = useDevolucaoEventoMutations();
  const itemMut = useDevolucaoItemMutations();
  const { uploadFile, isUploading, progress } = useUpload();

  const { data: members = [] } = useQuery<Array<{ user_id: string; name: string }>>({
    queryKey: ["org-members", user?.organization_id],
    queryFn: () => api(`/api/organizations/${user?.organization_id}/members`),
    enabled: !!user?.organization_id && open,
  });

  const [noteText, setNoteText] = useState("");
  const [anexoCat, setAnexoCat] = useState<'foto' | 'nf_entrada' | 'nf_saida' | 'laudo' | 'outro'>('foto');
  const [newItem, setNewItem] = useState<{ product_name: string; sku: string; quantity: number; serial_number: string }>({ product_name: '', sku: '', quantity: 1, serial_number: '' });

  if (!devolucaoId) return null;

  const save = (patch: any) => dev && update.mutate({ id: dev.id, _silent: true, ...patch });
  const moveStatus = (status: DevolucaoStatus) => dev && changeStatus.mutate({ id: dev.id, status });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !dev) return;
    try {
      const url = await uploadFile(file);
      if (url) {
        await anexoMut.create.mutateAsync({
          devolucaoId: dev.id, category: anexoCat, name: file.name, url, mimetype: file.type, size: file.size,
        });
      }
    } catch (err: any) { console.error(err); }
    e.target.value = '';
  };

  const addNote = async () => {
    if (!noteText.trim() || !dev) return;
    await eventoMut.mutateAsync({ devolucaoId: dev.id, event_type: 'note', message: noteText.trim() });
    setNoteText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[98vw] xl:max-w-[1400px] w-[98vw] h-[95vh] max-h-[95vh] flex flex-col overflow-hidden p-0">
        <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading || !dev ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-xl">Devolução #{dev.numero}</DialogTitle>
                <Badge className={STATUS_COLORS[dev.status]}>{STATUS_LABELS[dev.status]}</Badge>
                <Badge variant="outline">{REASON_LABELS[dev.reason] || dev.reason}</Badge>
                {dev.priority === 'urgent' && <Badge variant="destructive">URGENTE</Badge>}
              </div>
              <DialogDescription>
                Cliente: <b>{dev.customer_name}</b> · Vendedor: {dev.seller_name || '—'} · Aberto em {safeFormatDate(dev.created_at, 'dd/MM/yyyy HH:mm')}
              </DialogDescription>
            </DialogHeader>

            {/* Workflow header: stepper + grouped actions */}
            <StatusWorkflow
              status={dev.status}
              onMove={moveStatus}
              isPending={changeStatus.isPending}
            />


            <Tabs defaultValue="resumo" className="w-full">
              <TabsList className="grid grid-cols-2 md:grid-cols-6">
                <TabsTrigger value="resumo">Resumo</TabsTrigger>
                <TabsTrigger value="recebimento">Recebimento</TabsTrigger>
                <TabsTrigger value="analise">Análise</TabsTrigger>
                <TabsTrigger value="envio">Envio</TabsTrigger>
                <TabsTrigger value="anexos">Anexos</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>

              {/* RESUMO */}
              <TabsContent value="resumo" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <InfoRow label="Cliente" value={dev.customer_name} />
                  <InfoRow label="CPF/CNPJ" value={dev.customer_document} />
                  <InfoRow label="WhatsApp" value={dev.customer_whatsapp} />
                  <InfoRow label="E-mail" value={dev.customer_email} />
                  <InfoRow label="Endereço" value={dev.customer_address} />
                  <InfoRow label="Canal" value={dev.opened_channel?.toUpperCase()} />
                  <InfoRow label="Pedido original" value={dev.original_order_number} />
                  <InfoRow label="NF original" value={dev.original_invoice_number} />
                  <div>
                    <Label className="text-xs text-muted-foreground">Vendedor responsável</Label>
                    <Select value={dev.seller_user_id || ''} onValueChange={v => save({ seller_user_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea defaultValue={dev.description || ''} onBlur={e => save({ description: e.target.value })} rows={3} />
                </div>
                <div className="border rounded-lg">
                  <div className="px-3 py-2 border-b font-medium text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Produtos ({dev.itens?.length || 0})</div>
                  <div className="divide-y">
                    {dev.itens?.map(it => (
                      <div key={it.id} className="px-3 py-2 grid grid-cols-12 gap-2 text-sm items-center">
                        <div className="col-span-12 md:col-span-5 font-medium">{it.product_name}</div>
                        <div className="col-span-4 md:col-span-2 text-muted-foreground">{it.sku || '—'}</div>
                        <div className="col-span-2 md:col-span-1">Qtd: {it.quantity}</div>
                        <div className="col-span-5 md:col-span-3 text-muted-foreground text-xs">{it.serial_number || ''}</div>
                        <div className="col-span-1 flex justify-end">
                          <Button size="icon" variant="ghost" onClick={() => itemMut.remove.mutate({ itemId: it.id, devolucaoId: dev.id })}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!dev.itens?.length && <div className="px-3 py-4 text-sm text-muted-foreground">Nenhum item.</div>}
                  </div>
                  <div className="border-t bg-muted/30 px-3 py-2 grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-5">
                      <Label className="text-[10px] text-muted-foreground">Novo produto</Label>
                      <Input value={newItem.product_name} onChange={e => setNewItem(p => ({ ...p, product_name: e.target.value }))} placeholder="Nome do produto" />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <Label className="text-[10px] text-muted-foreground">SKU</Label>
                      <Input value={newItem.sku} onChange={e => setNewItem(p => ({ ...p, sku: e.target.value }))} />
                    </div>
                    <div className="col-span-3 md:col-span-1">
                      <Label className="text-[10px] text-muted-foreground">Qtd</Label>
                      <Input type="number" min={1} value={newItem.quantity} onChange={e => setNewItem(p => ({ ...p, quantity: Number(e.target.value) || 1 }))} />
                    </div>
                    <div className="col-span-4 md:col-span-3">
                      <Label className="text-[10px] text-muted-foreground">Nº Série</Label>
                      <Input value={newItem.serial_number} onChange={e => setNewItem(p => ({ ...p, serial_number: e.target.value }))} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={!newItem.product_name.trim() || itemMut.create.isPending}
                        onClick={async () => {
                          await itemMut.create.mutateAsync({ devolucaoId: dev.id, ...newItem });
                          setNewItem({ product_name: '', sku: '', quantity: 1, serial_number: '' });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>


              {/* RECEBIMENTO */}
              <TabsContent value="recebimento" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>NF de devolução (cliente → Enerlight)</Label><Input key={`inb-num-${dev.id}`} defaultValue={dev.inbound_invoice_number || ''} onBlur={e => save({ inbound_invoice_number: e.target.value })} /></div>
                  <div><Label>Chave de acesso (44 dígitos)</Label><Input defaultValue={dev.inbound_invoice_key || ''} onBlur={e => save({ inbound_invoice_key: e.target.value })} /></div>
                  <div><Label>Data da NF</Label><Input type="date" defaultValue={dev.inbound_invoice_date?.slice(0,10) || ''} onBlur={e => save({ inbound_invoice_date: e.target.value || null })} /></div>
                  <div><Label>Valor (R$)</Label><Input type="number" step="0.01" defaultValue={dev.inbound_invoice_value || ''} onBlur={e => save({ inbound_invoice_value: Number(e.target.value) || null })} /></div>
                  <div><Label>Recebido em</Label><Input type="datetime-local" defaultValue={dev.received_at?.slice(0,16) || ''} onBlur={e => save({ received_at: e.target.value || null })} /></div>
                </div>
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="font-medium text-sm flex items-center gap-2"><Truck className="h-4 w-4" />Frete de entrada</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div><Label>Transportadora</Label><Input list="devolucao-carriers-list" placeholder="Selecione ou cadastre uma nova" defaultValue={dev.inbound_carrier || ''} onBlur={e => save({ inbound_carrier: e.target.value })} /></div>
                    <div><Label>Código rastreio</Label><Input defaultValue={dev.inbound_tracking_code || ''} onBlur={e => save({ inbound_tracking_code: e.target.value })} /></div>
                    <div><Label>Custo (R$)</Label><Input type="number" step="0.01" defaultValue={dev.inbound_freight_cost || ''} onBlur={e => save({ inbound_freight_cost: Number(e.target.value) || 0 })} /></div>
                    <div>
                      <Label>Status</Label>
                      <Select defaultValue={dev.inbound_freight_status || ''} onValueChange={v => save({ inbound_freight_status: v })}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aguardando_coleta">Aguardando coleta</SelectItem>
                          <SelectItem value="em_transito">Em trânsito</SelectItem>
                          <SelectItem value="recebido">Recebido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ANÁLISE */}
              <TabsContent value="analise" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Status técnico</Label>
                    <Select defaultValue={dev.analysis_status || ''} onValueChange={v => save({ analysis_status: v, analyzed_at: new Date().toISOString() })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="com_defeito">Com defeito</SelectItem>
                        <SelectItem value="sem_defeito">Sem defeito</SelectItem>
                        <SelectItem value="fora_garantia">Fora de garantia</SelectItem>
                        <SelectItem value="constatado_uso_indevido">Uso indevido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Decisão</Label>
                    <Select defaultValue={dev.analysis_decision || ''} onValueChange={v => save({ analysis_decision: v })}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="troca">Troca</SelectItem>
                        <SelectItem value="conserto">Conserto</SelectItem>
                        <SelectItem value="reembolso">Reembolso</SelectItem>
                        <SelectItem value="descarte">Descarte</SelectItem>
                        <SelectItem value="devolver_cliente">Devolver ao cliente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Laudo técnico</Label>
                  <Textarea rows={5} defaultValue={dev.analysis_report || ''} onBlur={e => save({ analysis_report: e.target.value })} placeholder="Descreva os testes realizados, achados, peças afetadas..." />
                </div>
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="font-medium text-sm flex items-center gap-2"><MessageCircle className="h-4 w-4" />Notificação ao cliente</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><Label>Notificado em</Label><Input type="datetime-local" defaultValue={dev.customer_notified_at?.slice(0,16) || ''} onBlur={e => save({ customer_notified_at: e.target.value || null })} /></div>
                    <div>
                      <Label>Canal</Label>
                      <Select defaultValue={dev.customer_notification_channel || ''} onValueChange={v => save({ customer_notification_channel: v })}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="email">E-mail</SelectItem>
                          <SelectItem value="telefone">Telefone</SelectItem>
                          <SelectItem value="presencial">Presencial</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Textarea rows={2} defaultValue={dev.customer_notification_notes || ''} onBlur={e => save({ customer_notification_notes: e.target.value })} placeholder="Notas da comunicação com o cliente..." />
                </div>
              </TabsContent>

              {/* ENVIO */}
              <TabsContent value="envio" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div><Label>NF de saída (Enerlight → cliente)</Label><Input defaultValue={dev.outbound_invoice_number || ''} onBlur={e => save({ outbound_invoice_number: e.target.value })} /></div>
                  <div><Label>Data da NF</Label><Input type="date" defaultValue={dev.outbound_invoice_date?.slice(0,10) || ''} onBlur={e => save({ outbound_invoice_date: e.target.value || null })} /></div>
                  <div><Label>Valor (R$)</Label><Input type="number" step="0.01" defaultValue={dev.outbound_invoice_value || ''} onBlur={e => save({ outbound_invoice_value: Number(e.target.value) || null })} /></div>
                  <div><Label>Enviado em</Label><Input type="datetime-local" defaultValue={dev.outbound_sent_at?.slice(0,16) || ''} onBlur={e => save({ outbound_sent_at: e.target.value || null })} /></div>
                </div>
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="font-medium text-sm flex items-center gap-2"><Truck className="h-4 w-4" />Frete de saída</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div><Label>Transportadora</Label><Input list="devolucao-carriers-list" placeholder="Selecione ou cadastre uma nova" defaultValue={dev.outbound_carrier || ''} onBlur={e => save({ outbound_carrier: e.target.value })} /></div>
                    <div><Label>Código rastreio</Label><Input defaultValue={dev.outbound_tracking_code || ''} onBlur={e => save({ outbound_tracking_code: e.target.value })} /></div>
                    <div><Label>Custo (R$)</Label><Input type="number" step="0.01" defaultValue={dev.outbound_freight_cost || ''} onBlur={e => save({ outbound_freight_cost: Number(e.target.value) || 0 })} /></div>
                    <div>
                      <Label>Status</Label>
                      <Select defaultValue={dev.outbound_freight_status || ''} onValueChange={v => save({ outbound_freight_status: v })}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="aguardando_coleta">Aguardando coleta</SelectItem>
                          <SelectItem value="em_transito">Em trânsito</SelectItem>
                          <SelectItem value="entregue">Entregue</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Resumo da resolução</Label>
                  <Textarea rows={3} defaultValue={dev.resolution_summary || ''} onBlur={e => save({ resolution_summary: e.target.value })} placeholder="O que foi feito, peças trocadas, conclusão final..." />
                </div>
                <div className="rounded-md bg-muted/40 px-3 py-2 text-sm flex items-center justify-between">
                  <span>Custo total de fretes</span>
                  <b>R$ {((Number(dev.inbound_freight_cost)||0) + (Number(dev.outbound_freight_cost)||0)).toFixed(2)}</b>
                </div>
              </TabsContent>

              {/* ANEXOS */}
              <TabsContent value="anexos" className="space-y-3 pt-3">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={anexoCat} onValueChange={(v: any) => setAnexoCat(v)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="foto">Foto</SelectItem>
                        <SelectItem value="nf_entrada">NF de entrada</SelectItem>
                        <SelectItem value="nf_saida">NF de saída</SelectItem>
                        <SelectItem value="laudo">Laudo</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button asChild variant="outline" disabled={isUploading}>
                    <label className="cursor-pointer">
                      <Upload className="h-4 w-4 mr-2" />{isUploading ? `Enviando ${progress}%` : 'Enviar arquivo'}
                      <input type="file" className="hidden" onChange={handleFile} />
                    </label>
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {dev.anexos?.map(a => (
                    <div key={a.id} className="border rounded-lg p-2 space-y-1 text-xs">
                      <div className="aspect-square bg-muted rounded flex items-center justify-center overflow-hidden">
                        {a.mimetype?.startsWith('image/')
                          ? <img src={a.url} alt={a.name} className="object-cover w-full h-full" />
                          : <FileText className="h-10 w-10 text-muted-foreground" />}
                      </div>
                      <Badge variant="outline" className="text-[10px]">{a.category}</Badge>
                      <div className="truncate" title={a.name}>{a.name || 'arquivo'}</div>
                      <div className="flex items-center justify-between">
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">Abrir</a>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => anexoMut.remove.mutate({ attId: a.id, devolucaoId: dev.id })}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!dev.anexos?.length && <div className="col-span-full text-sm text-muted-foreground">Nenhum anexo ainda.</div>}
                </div>
              </TabsContent>

              {/* HISTÓRICO */}
              <TabsContent value="historico" className="space-y-3 pt-3">
                <div className="flex gap-2">
                  <Input value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Adicionar nota interna..." />
                  <Button onClick={addNote} disabled={!noteText.trim()}><Send className="h-4 w-4 mr-1" />Nota</Button>
                </div>
                <div className="space-y-2">
                  {dev.eventos?.map(ev => (
                    <div key={ev.id} className="flex gap-3 text-sm border-l-2 border-primary/30 pl-3 py-1">
                      <History className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <div className="text-xs text-muted-foreground">
                          {safeFormatDate(ev.created_at, 'dd/MM/yyyy HH:mm')} · {ev.user_name || 'Sistema'}
                        </div>
                        {ev.event_type === 'status_change' ? (
                          <div>Status: <Badge variant="outline" className="text-[10px]">{STATUS_LABELS[ev.from_status as DevolucaoStatus] || ev.from_status || '—'}</Badge> → <Badge className="text-[10px]">{STATUS_LABELS[ev.to_status as DevolucaoStatus] || ev.to_status}</Badge> {ev.message && <span className="text-muted-foreground"> · {ev.message}</span>}</div>
                        ) : (
                          <div>{ev.message}</div>
                        )}
                      </div>
                    </div>
                  ))}
                  {!dev.eventos?.length && <div className="text-sm text-muted-foreground">Nenhum evento.</div>}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="text-sm">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="font-medium">{value || '—'}</div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Workflow header: visual stepper + grouped primary actions
   ---------------------------------------------------------------- */
const STEPS: { key: DevolucaoStatus; label: string; short: string }[] = [
  { key: 'solicitado',            label: 'Solicitado',            short: 'Aberto' },
  { key: 'aguardando_nf_produto', label: 'Aguardando NF/Produto', short: 'NF/Produto' },
  { key: 'recebido',              label: 'Recebido',              short: 'Recebido' },
  { key: 'em_analise',            label: 'Em Análise',            short: 'Análise' },
  { key: 'cliente_notificado',    label: 'Cliente Notificado',    short: 'Notificado' },
  { key: 'aguardando_nf_retorno', label: 'Aguardando NF Retorno', short: 'NF Retorno' },
  { key: 'troca_conserto',        label: 'Troca/Conserto',        short: 'Troca' },
  { key: 'enviado',               label: 'Enviado',               short: 'Enviado' },
  { key: 'concluido',             label: 'Concluído',             short: 'OK' },
];

function StatusWorkflow({
  status, onMove, isPending,
}: { status: DevolucaoStatus; onMove: (s: DevolucaoStatus) => void; isPending: boolean }) {
  const isTerminal = status === 'cancelado' || status === 'recusado';
  const currentIdx = STEPS.findIndex(s => s.key === status);
  const nextStep = currentIdx >= 0 && currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
  const canConclude = currentIdx === STEPS.length - 2; // próximo = concluido

  return (
    <div className="rounded-lg border bg-card">
      {/* Stepper */}
      <div className="px-4 pt-3 pb-2 overflow-x-auto">
        {isTerminal ? (
          <div className="flex items-center gap-2 py-1">
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              status === 'cancelado' ? "bg-muted text-muted-foreground" : "bg-destructive/10 text-destructive"
            )}>
              {status === 'cancelado' ? <Ban className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {STATUS_LABELS[status]}
            </span>
            <span className="text-xs text-muted-foreground">RMA encerrado</span>
          </div>
        ) : (
          <ol className="flex items-center gap-1 min-w-max">
            {STEPS.map((s, i) => {
              const done = i < currentIdx;
              const active = i === currentIdx;
              return (
                <li key={s.key} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onMove(s.key)}
                    disabled={isPending}
                    title={`Ir para: ${s.label}`}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                      active && "bg-primary/10 text-primary font-semibold",
                      done && "text-foreground hover:bg-muted",
                      !done && !active && "text-muted-foreground hover:bg-muted",
                      isPending && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    <span className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold border",
                      active && "bg-primary text-primary-foreground border-primary",
                      done && "bg-emerald-500 text-white border-emerald-500",
                      !done && !active && "bg-background border-border"
                    )}>
                      {done ? <Check className="h-3 w-3" /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{s.short}</span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <ChevronRight className={cn(
                      "h-3.5 w-3.5 mx-0.5 shrink-0",
                      i < currentIdx ? "text-emerald-500" : "text-muted-foreground/40"
                    )} />
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {!isTerminal && nextStep && (
            <Button
              size="sm"
              onClick={() => onMove(nextStep.key)}
              disabled={isPending}
              className="gap-1.5"
            >
              {canConclude ? <><CheckCircle2 className="h-4 w-4" /> Concluir RMA</> : <>Avançar para "{nextStep.label}" <ArrowRight className="h-4 w-4" /></>}
            </Button>
          )}
          {isTerminal && (
            <Button size="sm" variant="outline" onClick={() => onMove('solicitado')} disabled={isPending}>
              Reabrir devolução
            </Button>
          )}

          {!isTerminal && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <MoreHorizontal className="h-4 w-4" /> Ir para etapa
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">Selecione a etapa</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STEPS.map(s => (
                  <DropdownMenuItem
                    key={s.key}
                    disabled={s.key === status || isPending}
                    onClick={() => onMove(s.key)}
                    className="text-sm"
                  >
                    <span className={cn(
                      "mr-2 inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px]",
                      s.key === status && "bg-primary text-primary-foreground border-primary"
                    )}>
                      {s.key === status ? <Check className="h-2.5 w-2.5" /> : ''}
                    </span>
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!isTerminal && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMove('recusado')}
              disabled={isPending}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1.5"
            >
              <X className="h-4 w-4" /> Recusar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onMove('cancelado')}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Ban className="h-4 w-4" /> Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

