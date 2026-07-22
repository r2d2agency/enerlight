import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDevolucaoMutations, Devolucao } from "@/hooks/use-devolucoes";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { ClientSearchField } from "./ClientSearchField";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  devolucao?: Devolucao | null;
}

interface OrgMember { user_id: string; name: string; email: string; role: string; }

export function DevolucaoFormDialog({ open, onOpenChange, devolucao }: Props) {
  const { user } = useAuth();
  const { create, update } = useDevolucaoMutations();
  const isEdit = !!devolucao;

  const [form, setForm] = useState<any>({});
  const [itens, setItens] = useState<any[]>([{ product_name: '', quantity: 1 }]);

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ["org-members", user?.organization_id],
    queryFn: () => api(`/api/organizations/${user?.organization_id}/members`),
    enabled: !!user?.organization_id && open,
  });

  useEffect(() => {
    if (open) {
      if (devolucao) {
        setForm({
          rma_type: devolucao.rma_type || 'cliente',
          customer_name: devolucao.customer_name || '',
          customer_document: devolucao.customer_document || '',
          customer_whatsapp: devolucao.customer_whatsapp || '',
          customer_email: devolucao.customer_email || '',
          customer_address: devolucao.customer_address || '',
          opened_channel: devolucao.opened_channel,
          seller_user_id: devolucao.seller_user_id || user?.id,
          priority: devolucao.priority,
          reason: devolucao.reason,
          description: devolucao.description || '',
          original_order_number: devolucao.original_order_number || '',
          original_invoice_number: devolucao.original_invoice_number || '',
          original_invoice_date: devolucao.original_invoice_date || '',
          supplier_name: devolucao.supplier_name || '',
          supplier_document: devolucao.supplier_document || '',
          supplier_contact_name: devolucao.supplier_contact_name || '',
          supplier_whatsapp: devolucao.supplier_whatsapp || '',
          supplier_email: devolucao.supplier_email || '',
          supplier_address: devolucao.supplier_address || '',
          supplier_rma_number: devolucao.supplier_rma_number || '',
          supplier_expected_return_date: devolucao.supplier_expected_return_date?.slice(0,10) || '',
          warranty_type: devolucao.warranty_type || '',
          supplier_charge_status: devolucao.supplier_charge_status || '',
          supplier_credit_value: devolucao.supplier_credit_value ?? '',
        });
        setItens(devolucao.itens?.length ? devolucao.itens.map(i => ({ ...i })) : [{ product_name: '', quantity: 1 }]);
      } else {
        setForm({
          rma_type: 'cliente',
          customer_name: '', customer_document: '', customer_whatsapp: '', customer_email: '', customer_address: '',
          opened_channel: 'sac', seller_user_id: user?.id, priority: 'normal', reason: 'defeito',
          description: '', original_order_number: '', original_invoice_number: '', original_invoice_date: '',
          supplier_name: '', supplier_document: '', supplier_contact_name: '', supplier_whatsapp: '',
          supplier_email: '', supplier_address: '', supplier_rma_number: '', supplier_expected_return_date: '',
          warranty_type: 'garantia_fabrica', supplier_charge_status: 'pendente', supplier_credit_value: '',
        });
        setItens([{ product_name: '', quantity: 1, sku: '', serial_number: '' }]);
      }
    }
  }, [open, devolucao, user?.id]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));
  const setItem = (i: number, k: string, v: any) => setItens(arr => arr.map((it, idx) => idx === i ? { ...it, [k]: v } : it));
  const addItem = () => setItens(arr => [...arr, { product_name: '', quantity: 1 }]);
  const removeItem = (i: number) => setItens(arr => arr.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    if (!form.customer_name?.trim()) return;
    const payload = { ...form, original_invoice_date: form.original_invoice_date || null, itens: itens.filter(it => it.product_name?.trim()) };
    if (isEdit) await update.mutateAsync({ id: devolucao!.id, ...payload });
    else await create.mutateAsync(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar Devolução #${devolucao?.numero}` : 'Nova Devolução'}</DialogTitle>
          <DialogDescription>Preencha as informações do cliente, motivo e produtos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <ClientSearchField
              currentName={form.customer_name}
              onSelect={(c) => setForm((f: any) => ({
                ...f,
                customer_name: c.name,
                ...(c.document !== undefined ? { customer_document: c.document } : {}),
                ...(c.email !== undefined ? { customer_email: c.email } : {}),
                ...(c.phone !== undefined ? { customer_whatsapp: c.phone } : {}),
                ...(c.address !== undefined ? { customer_address: c.address } : {}),
              }))}
            />
            <div><Label>CPF/CNPJ</Label><Input value={form.customer_document || ''} onChange={e => set('customer_document', e.target.value)} /></div>
            <div><Label>WhatsApp</Label><Input value={form.customer_whatsapp || ''} onChange={e => set('customer_whatsapp', e.target.value)} /></div>
            <div><Label>E-mail</Label><Input value={form.customer_email || ''} onChange={e => set('customer_email', e.target.value)} /></div>
            <div><Label>Endereço</Label><Input value={form.customer_address || ''} onChange={e => set('customer_address', e.target.value)} /></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label>Canal</Label>
              <Select value={form.opened_channel} onValueChange={v => set('opened_channel', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sac">SAC</SelectItem>
                  <SelectItem value="vendedor">Vendedor</SelectItem>
                  <SelectItem value="site">Site</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vendedor responsável</Label>
              <Select value={form.seller_user_id || ''} onValueChange={v => set('seller_user_id', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {members.map(m => <SelectItem key={m.user_id} value={m.user_id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo</Label>
              <Select value={form.reason} onValueChange={v => set('reason', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="defeito">Defeito</SelectItem>
                  <SelectItem value="arrependimento">Arrependimento</SelectItem>
                  <SelectItem value="erro_envio">Erro de envio</SelectItem>
                  <SelectItem value="garantia">Garantia</SelectItem>
                  <SelectItem value="avaria_transporte">Avaria no transporte</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Prioridade</Label>
              <Select value={form.priority} onValueChange={v => set('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><Label>Nº Pedido original</Label><Input value={form.original_order_number || ''} onChange={e => set('original_order_number', e.target.value)} /></div>
            <div><Label>NF original</Label><Input value={form.original_invoice_number || ''} onChange={e => set('original_invoice_number', e.target.value)} /></div>
            <div><Label>Data NF original</Label><Input type="date" value={form.original_invoice_date || ''} onChange={e => set('original_invoice_date', e.target.value)} /></div>
          </div>

          <div>
            <Label>Descrição da solicitação</Label>
            <Textarea rows={3} value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Relato do cliente, sintomas, contexto..." />
          </div>

          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base">Produtos</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
            </div>
            {itens.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 md:col-span-5"><Label className="text-xs">Produto</Label><Input value={it.product_name || ''} onChange={e => setItem(i, 'product_name', e.target.value)} /></div>
                <div className="col-span-4 md:col-span-2"><Label className="text-xs">SKU</Label><Input value={it.sku || ''} onChange={e => setItem(i, 'sku', e.target.value)} /></div>
                <div className="col-span-4 md:col-span-1"><Label className="text-xs">Qtd</Label><Input type="number" value={it.quantity || 1} onChange={e => setItem(i, 'quantity', Number(e.target.value) || 1)} /></div>
                <div className="col-span-4 md:col-span-3"><Label className="text-xs">Nº Série</Label><Input value={it.serial_number || ''} onChange={e => setItem(i, 'serial_number', e.target.value)} /></div>
                <div className="col-span-12 md:col-span-1">
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i)} disabled={itens.length === 1}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={create.isPending || update.isPending}>
            {isEdit ? 'Salvar' : 'Abrir devolução'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
