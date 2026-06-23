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
  STATUS_LABELS, STATUS_ORDER, REASON_LABELS, DevolucaoStatus
} from "@/hooks/use-devolucoes";
import { useUpload } from "@/hooks/use-upload";
import { safeFormatDate } from "@/lib/utils";
import { Loader2, Upload, FileText, Image as ImageIcon, Truck, Wrench, MessageCircle, Trash2, Send, History } from "lucide-react";

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
  const { data: dev, isLoading } = useDevolucao(devolucaoId);
  const { update, changeStatus } = useDevolucaoMutations();
  const anexoMut = useDevolucaoAnexoMutations();
  const eventoMut = useDevolucaoEventoMutations();
  const { uploadFile, isUploading, progress } = useUpload();

  const [noteText, setNoteText] = useState("");
  const [anexoCat, setAnexoCat] = useState<'foto' | 'nf_entrada' | 'nf_saida' | 'laudo' | 'outro'>('foto');

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
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        {isLoading || !dev ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>Devolução #{dev.numero}</DialogTitle>
                <Badge className={STATUS_COLORS[dev.status]}>{STATUS_LABELS[dev.status]}</Badge>
                <Badge variant="outline">{REASON_LABELS[dev.reason] || dev.reason}</Badge>
                {dev.priority === 'urgent' && <Badge variant="destructive">URGENTE</Badge>}
              </div>
              <DialogDescription>
                Cliente: <b>{dev.customer_name}</b> · Vendedor: {dev.seller_name || '—'} · Aberto em {safeFormatDate(dev.created_at, 'dd/MM/yyyy HH:mm')}
              </DialogDescription>
            </DialogHeader>

            {/* Status quick-move bar */}
            <div className="flex flex-wrap gap-1 border-y py-2">
              {STATUS_ORDER.map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={dev.status === s ? 'default' : 'outline'}
                  className="text-xs h-7"
                  onClick={() => moveStatus(s)}
                  disabled={changeStatus.isPending}
                >
                  {STATUS_LABELS[s]}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive" onClick={() => moveStatus('cancelado')}>Cancelar</Button>
              <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive" onClick={() => moveStatus('recusado')}>Recusar</Button>
            </div>

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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <InfoRow label="Cliente" value={dev.customer_name} />
                  <InfoRow label="CPF/CNPJ" value={dev.customer_document} />
                  <InfoRow label="WhatsApp" value={dev.customer_whatsapp} />
                  <InfoRow label="E-mail" value={dev.customer_email} />
                  <InfoRow label="Endereço" value={dev.customer_address} />
                  <InfoRow label="Canal" value={dev.opened_channel?.toUpperCase()} />
                  <InfoRow label="Pedido original" value={dev.original_order_number} />
                  <InfoRow label="NF original" value={dev.original_invoice_number} />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea value={dev.description || ''} onChange={e => save({ description: e.target.value })} rows={3} />
                </div>
                <div className="border rounded-lg">
                  <div className="px-3 py-2 border-b font-medium text-sm flex items-center gap-2"><FileText className="h-4 w-4" />Produtos ({dev.itens?.length || 0})</div>
                  <div className="divide-y">
                    {dev.itens?.map(it => (
                      <div key={it.id} className="px-3 py-2 grid grid-cols-12 gap-2 text-sm">
                        <div className="col-span-6 font-medium">{it.product_name}</div>
                        <div className="col-span-2 text-muted-foreground">{it.sku || '—'}</div>
                        <div className="col-span-1">Qtd: {it.quantity}</div>
                        <div className="col-span-3 text-muted-foreground">{it.serial_number || ''}</div>
                      </div>
                    ))}
                    {!dev.itens?.length && <div className="px-3 py-4 text-sm text-muted-foreground">Nenhum item.</div>}
                  </div>
                </div>
              </TabsContent>

              {/* RECEBIMENTO */}
              <TabsContent value="recebimento" className="space-y-3 pt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><Label>NF de devolução (cliente → Enerlight)</Label><Input value={dev.inbound_invoice_number || ''} onBlur={e => save({ inbound_invoice_number: e.target.value })} onChange={e => (dev.inbound_invoice_number = e.target.value)} defaultValue={dev.inbound_invoice_number || ''} /></div>
                  <div><Label>Chave de acesso (44 dígitos)</Label><Input defaultValue={dev.inbound_invoice_key || ''} onBlur={e => save({ inbound_invoice_key: e.target.value })} /></div>
                  <div><Label>Data da NF</Label><Input type="date" defaultValue={dev.inbound_invoice_date?.slice(0,10) || ''} onBlur={e => save({ inbound_invoice_date: e.target.value || null })} /></div>
                  <div><Label>Valor (R$)</Label><Input type="number" step="0.01" defaultValue={dev.inbound_invoice_value || ''} onBlur={e => save({ inbound_invoice_value: Number(e.target.value) || null })} /></div>
                  <div><Label>Recebido em</Label><Input type="datetime-local" defaultValue={dev.received_at?.slice(0,16) || ''} onBlur={e => save({ received_at: e.target.value || null })} /></div>
                </div>
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="font-medium text-sm flex items-center gap-2"><Truck className="h-4 w-4" />Frete de entrada</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div><Label>Transportadora</Label><Input defaultValue={dev.inbound_carrier || ''} onBlur={e => save({ inbound_carrier: e.target.value })} /></div>
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
                    <div><Label>Transportadora</Label><Input defaultValue={dev.outbound_carrier || ''} onBlur={e => save({ outbound_carrier: e.target.value })} /></div>
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
