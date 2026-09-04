import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  comercialAdminApi, ComercialAdminActor, ComercialTeam, ComercialProfile,
} from '@/lib/comercial-api';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Briefcase, Send, Lock, Unlock, UserPlus, Users2 } from 'lucide-react';

interface OrgMember { id: string; name: string; email: string; is_active: boolean }

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  active: { label: 'Ativo', variant: 'default' },
  blocked: { label: 'Bloqueado', variant: 'destructive' },
};

const profileLabel: Record<ComercialProfile, string> = {
  admin: 'Administrador',
  gerente: 'Gerente Comercial',
  vendedor: 'Vendedor',
  parceiro: 'Parceiro Comercial',
};

export default function AdminComercialPortal() {
  const { userPermissions, user } = useAuth();
  const canManage = user?.is_superadmin || ['owner', 'admin'].includes(user?.role || '') || userPermissions?.can_manage_comercial_portal;

  const [actors, setActors] = useState<ComercialAdminActor[]>([]);
  const [teams, setTeams] = useState<ComercialTeam[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [linkForm, setLinkForm] = useState<{ user_id: string; profile: ComercialProfile }>({ user_id: '', profile: 'vendedor' });
  const [inviteForm, setInviteForm] = useState<{ name: string; email: string; phone: string; profile: ComercialProfile }>({
    name: '', email: '', phone: '', profile: 'parceiro',
  });
  const [teamForm, setTeamForm] = useState({ name: '' });

  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      comercialAdminApi.listActors(),
      comercialAdminApi.listTeams(),
      api<OrgMember[]>('/api/crm/org-members'),
    ])
      .then(([actorsRes, teamsRes, members]) => {
        setActors(actorsRes.actors);
        setTeams(teamsRes.teams);
        setOrgMembers(members);
      })
      .catch((error) => toast({ title: 'Erro ao carregar Portal Comercial', description: error?.message, variant: 'destructive' }))
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
            Você não tem permissão para acessar o Portal Comercial.
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  const linkedUserIds = new Set(actors.filter((a) => a.user_id).map((a) => a.user_id));
  const availableMembers = orgMembers.filter((m) => m.is_active && !linkedUserIds.has(m.id));

  const handleLinkInternal = async () => {
    if (!linkForm.user_id) {
      toast({ title: 'Selecione um usuário', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.linkInternal(linkForm);
      toast({ title: 'Acesso liberado', description: 'O usuário já pode acessar o Portal Comercial com a conta atual.' });
      setLinkForm({ user_id: '', profile: 'vendedor' });
      setLinkDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao vincular usuário', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleInviteExternal = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      toast({ title: 'Nome e email são obrigatórios', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.inviteExternal(inviteForm);
      toast({ title: 'Convite enviado', description: 'Um email de ativação foi enviado.' });
      setInviteForm({ name: '', email: '', phone: '', profile: 'parceiro' });
      setInviteDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao convidar', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!teamForm.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await comercialAdminApi.createTeam(teamForm);
      toast({ title: 'Equipe criada' });
      setTeamForm({ name: '' });
      setTeamDialogOpen(false);
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao criar equipe', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleResendInvite = async (actor: ComercialAdminActor) => {
    setActionLoadingId(actor.id);
    try {
      await comercialAdminApi.resendInvite(actor.id);
      toast({ title: 'Convite reenviado' });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao reenviar convite', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleBlock = async (actor: ComercialAdminActor) => {
    setActionLoadingId(actor.id);
    try {
      if (actor.status === 'blocked') {
        await comercialAdminApi.unblock(actor.id);
        toast({ title: 'Acesso liberado' });
      } else {
        await comercialAdminApi.block(actor.id);
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

  const handleActorTeamChange = async (actor: ComercialAdminActor, teamId: string) => {
    setActionLoadingId(actor.id);
    try {
      await comercialAdminApi.updateActor(actor.id, { team_id: teamId === 'none' ? null : teamId });
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tente novamente.';
      toast({ title: 'Erro ao atualizar equipe', description: message, variant: 'destructive' });
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <MainLayout>
      <div className="flex items-center gap-3 mb-6">
        <Briefcase className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Portal Comercial</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie usuários, equipes e permissões do módulo comercial.
          </p>
        </div>
      </div>

      <Tabs defaultValue="atores">
        <TabsList>
          <TabsTrigger value="atores">Usuários</TabsTrigger>
          <TabsTrigger value="equipes">Equipes</TabsTrigger>
        </TabsList>

        <TabsContent value="atores" className="space-y-4 mt-4">
          <div className="flex justify-end gap-2 flex-wrap">
            <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <UserPlus className="h-4 w-4 mr-1" />
                  Vincular usuário interno
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Vincular usuário interno</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    O usuário continua logando com a mesma conta do CRM — sem senha nova.
                  </p>
                  <div className="space-y-1">
                    <Label>Usuário *</Label>
                    <Select value={linkForm.user_id} onValueChange={(v) => setLinkForm({ ...linkForm, user_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                      <SelectContent>
                        {availableMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name} ({m.email})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Perfil</Label>
                    <Select value={linkForm.profile} onValueChange={(v) => setLinkForm({ ...linkForm, profile: v as ComercialProfile })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(profileLabel) as ComercialProfile[]).map((p) => (
                          <SelectItem key={p} value={p}>{profileLabel[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleLinkInternal} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Liberar acesso
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Convidar representante/parceiro
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Convidar representante/parceiro</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Nome *</Label>
                    <Input value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Email *</Label>
                    <Input type="email" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Telefone</Label>
                    <Input value={inviteForm.phone} onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Perfil</Label>
                    <Select value={inviteForm.profile} onValueChange={(v) => setInviteForm({ ...inviteForm, profile: v as ComercialProfile })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vendedor">{profileLabel.vendedor}</SelectItem>
                        <SelectItem value="parceiro">{profileLabel.parceiro}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Um email com o link de ativação será enviado automaticamente.
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={handleInviteExternal} disabled={saving}>
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
              ) : actors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Briefcase className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum usuário do Portal Comercial ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Perfil</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actors.map((actor) => {
                      const cfg = statusConfig[actor.status] || statusConfig.pending;
                      const isBusy = actionLoadingId === actor.id;
                      return (
                        <TableRow key={actor.id}>
                          <TableCell className="font-medium">{actor.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{actor.email}</TableCell>
                          <TableCell className="text-sm">{profileLabel[actor.profile] || actor.profile}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {actor.user_id ? 'Interno (login CRM)' : 'Externo'}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={actor.team_id || 'none'}
                              onValueChange={(v) => handleActorTeamChange(actor, v)}
                              disabled={isBusy}
                            >
                              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem equipe</SelectItem>
                                {teams.map((t) => (
                                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right space-x-1">
                            {!actor.user_id && actor.status === 'pending' && (
                              <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleResendInvite(actor)}>
                                <Send className="h-4 w-4 mr-1" />
                                Reenviar convite
                              </Button>
                            )}
                            {actor.status !== 'pending' && (
                              <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => handleToggleBlock(actor)}>
                                {actor.status === 'blocked' ? (
                                  <><Unlock className="h-4 w-4 mr-1" />Desbloquear</>
                                ) : (
                                  <><Lock className="h-4 w-4 mr-1" />Bloquear</>
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
        </TabsContent>

        <TabsContent value="equipes" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-1" />
                  Nova equipe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova equipe</DialogTitle>
                </DialogHeader>
                <div className="space-y-1">
                  <Label>Nome *</Label>
                  <Input value={teamForm.name} onChange={(e) => setTeamForm({ name: e.target.value })} />
                </div>
                <DialogFooter>
                  <Button onClick={handleCreateTeam} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Criar equipe
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
              ) : teams.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhuma equipe cadastrada ainda.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Membros</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams.map((team) => (
                      <TableRow key={team.id}>
                        <TableCell className="font-medium">{team.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{team.members_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
