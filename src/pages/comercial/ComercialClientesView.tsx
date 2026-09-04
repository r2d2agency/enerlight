import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ComercialActor, ComercialCustomer } from '@/lib/comercial-api';
import { Loader2, Plus, Users, Building2, User } from 'lucide-react';

const emptyForm = {
  type: 'pj' as 'pj' | 'pf',
  company_name: '', trade_name: '', cnpj: '', cpf: '', state_registration: '',
  phone: '', whatsapp: '', email: '', contact_name: '', contact_role: '',
  zip_code: '', address: '', address_number: '', address_complement: '', neighborhood: '',
  city: '', state: '', origin: '', notes: '',
};

interface Props {
  actor: ComercialActor;
  listCustomers: () => Promise<{ customers: ComercialCustomer[] }>;
  createCustomer: (body: Partial<ComercialCustomer>) => Promise<{ customer: ComercialCustomer }>;
  updateCustomer: (id: string, body: Partial<ComercialCustomer>) => Promise<{ customer: ComercialCustomer }>;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  active: { label: 'Ativo', variant: 'default' },
  inactive: { label: 'Inativo', variant: 'secondary' },
};

export default function ComercialClientesView({ actor, listCustomers, createCustomer, updateCustomer }: Props) {
  const [customers, setCustomers] = useState<ComercialCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComercialCustomer | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    listCustomers()
      .then((res) => setCustomers(res.customers))
      .catch((error) => toast({ title: 'Erro ao carregar clientes', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: ComercialCustomer) => {
    setEditing(c);
    setForm({
      type: c.type,
      company_name: c.company_name, trade_name: c.trade_name || '', cnpj: c.cnpj || '', cpf: c.cpf || '',
      state_registration: c.state_registration || '', phone: c.phone || '', whatsapp: c.whatsapp || '',
      email: c.email || '', contact_name: c.contact_name || '', contact_role: c.contact_role || '',
      zip_code: c.zip_code || '', address: c.address || '', address_number: c.address_number || '',
      address_complement: c.address_complement || '', neighborhood: c.neighborhood || '', city: c.city || '',
      state: c.state || '', origin: c.origin || '', notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) {
      toast({ title: form.type === 'pf' ? 'Nome é obrigatório' : 'Razão social é obrigatória', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateCustomer(editing.id, form);
        toast({ title: 'Cliente atualizado' });
      } else {
        await createCustomer(form);
        toast({ title: 'Cliente cadastrado' });
      }
      setDialogOpen(false);
      load();
    } catch (error: any) {
      if (error?.status === 409) {
        toast({ title: 'Este cliente já existe no sistema', description: error?.message, variant: 'destructive' });
      } else {
        const message = error instanceof Error ? error.message : 'Tente novamente.';
        toast({ title: 'Erro ao salvar cliente', description: message, variant: 'destructive' });
      }
    } finally {
      setSaving(false);
    }
  };

  const canSeeOwner = actor.profile === 'admin' || actor.profile === 'gerente';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {actor.profile === 'admin' ? 'Todos os clientes da organização' : actor.profile === 'gerente' ? 'Seus clientes e os da sua equipe' : 'Seus clientes'}
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              Novo cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {!editing && (
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as 'pj' | 'pf' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                      <SelectItem value="pf">Pessoa Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label>{form.type === 'pf' ? 'Nome *' : 'Razão social *'}</Label>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
              </div>
              {form.type === 'pj' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Nome fantasia</Label>
                      <Input value={form.trade_name} onChange={(e) => setForm({ ...form, trade_name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label>CNPJ</Label>
                      <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} disabled={!!editing} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Inscrição estadual</Label>
                    <Input value={form.state_registration} onChange={(e) => setForm({ ...form, state_registration: e.target.value })} />
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Label>CPF</Label>
                  <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} disabled={!!editing} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>WhatsApp</Label>
                  <Input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              {form.type === 'pj' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Responsável</Label>
                    <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Cargo</Label>
                    <Input value={form.contact_role} onChange={(e) => setForm({ ...form, contact_role: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>CEP</Label>
                  <Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Endereço</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Número</Label>
                  <Input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Complemento</Label>
                  <Input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Bairro</Label>
                  <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Estado</Label>
                  <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} maxLength={2} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Origem</Label>
                <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} placeholder="Indicação, site, evento..." />
              </div>
              <div className="space-y-1">
                <Label>Observações</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {editing ? 'Salvar alterações' : 'Cadastrar cliente'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum cliente cadastrado ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Contato</TableHead>
                  {canSeeOwner && <TableHead>Responsável</TableHead>}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openEdit(c)}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.type === 'pj' ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> : <User className="h-3.5 w-3.5 text-muted-foreground" />}
                        {c.company_name}
                      </div>
                      {c.trade_name && <div className="text-xs text-muted-foreground">{c.trade_name}</div>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.cnpj || c.cpf || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {[c.city, c.state].filter(Boolean).join('/') || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.phone || c.whatsapp || c.email || '—'}</TableCell>
                    {canSeeOwner && (
                      <TableCell className="text-sm text-muted-foreground">{c.owner_actor_name || '—'}</TableCell>
                    )}
                    <TableCell>
                      <Badge variant={statusConfig[c.status]?.variant || 'secondary'}>
                        {statusConfig[c.status]?.label || c.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
