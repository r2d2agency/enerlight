import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { representantesAdminApi, RpAdminRepresentative } from '@/lib/representantes-api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Users, Send, Lock, Unlock } from 'lucide-react';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  blocked: { label: 'Bloqueado', variant: 'destructive' },
};

export default function AdminRepresentantesPortal() {
  const { userPermissions, user } = useAuth();
  const canManage = user?.is_superadmin || ['owner', 'admin'].includes(user?.role || '') || userPermissions?.can_manage_representatives_portal;

  const [representatives, setRepresentatives] = useState<RpAdminRepresentative[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    representantesAdminApi
      .list()
      .then((res) => setRepresentatives(res.representatives))
      .catch((error) => toast({ title: 'Erro ao carregar representantes', description: error?.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canManage) load();
    else setLoading(false);
  }, [canManage]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!canManage) {
    return (
      <MainLayout>
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Você não tem permissão para acessar o Portal de Representantes.
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      toast({ title: 'Nome e email são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await representantesAdminApi.create(form);
      toast({ title: 'Representante cadastrado', description: 'Um email de convite foi enviado.' });
      setForm({ name: '', email: '', phone: '' });
      setDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao cadastrar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async (rep: RpAdminRepresentative) => {
    setActionLoadingId(rep.id);
    try {
      await representantesAdminApi.resendInvite(rep.id);
      toast({ title: 'Convite reenviado' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao reenviar convite', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBlock = async (rep: RpAdminRepresentative) => {
    setActionLoadingId(rep.id);
    try {
      if (rep.status === 'blocked') {
        await representantesAdminApi.unblock(rep.id);
        toast({ title: 'Acesso liberado' });
      } else {
        await representantesAdminApi.block(rep.id);
        toast({ title: 'Acesso bloqueado' });
      }
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar status', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3">
          <Users className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Portal de Representantes</h1>
            <p className="text-muted-foreground text-sm">
              Cadastre representantes e gerencie a liberação/bloqueio de acesso ao portal exclusivo.
            </p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Novo representante
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo representante</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Email *</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Um email com o link de ativação será enviado automaticamente.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Cadastrar e convidar
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
          ) : representatives.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum representante cadastrado ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último login</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {representatives.map((rep) => {
                  const cfg = statusConfig[rep.status] || statusConfig.pending;
                  const isBusy = actionLoadingId === rep.id;
                  return (
                    <TableRow key={rep.id}>
                      <TableCell className="font-medium">{rep.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{rep.email}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{rep.phone || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rep.last_login_at ? new Date(rep.last_login_at).toLocaleString('pt-BR') : 'Nunca'}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        {rep.status === 'pending' && (
                          <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleResendInvite(rep)}>
                            <Send className="h-4 w-4 mr-1" />
                            Reenviar convite
                          </Button>
                        )}
                        {rep.status !== 'pending' && (
                          <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleToggleBlock(rep)}>
                            {rep.status === 'blocked' ? (
                              <>
                                <Unlock className="h-4 w-4 mr-1" />
                                Desbloquear
                              </>
                            ) : (
                              <>
                                <Lock className="h-4 w-4 mr-1" />
                                Bloquear
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
