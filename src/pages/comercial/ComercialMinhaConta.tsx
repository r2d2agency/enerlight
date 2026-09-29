import { useState } from 'react';
import ComercialLayout from './ComercialLayout';
import { comercialExternalApi } from '@/lib/comercial-api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { KeyRound, UserCircle, Loader2 } from 'lucide-react';

const profileLabels: Record<string, string> = { admin: 'Administrador', gerente: 'Supervisor', vendedor: 'Vendedor', parceiro: 'Parceiro' };

export default function ComercialMinhaConta() {
  return <ComercialLayout>{(actor) => <AccountContent actor={actor} />}</ComercialLayout>;
}

function AccountContent({ actor }: { actor: { name: string; email: string; profile: string; status: string; team_name?: string | null } }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) return toast({ title: 'Senha inválida', description: 'A senha deve ter no mínimo 6 caracteres.', variant: 'destructive' });
    if (password !== confirmation) return toast({ title: 'Senhas diferentes', description: 'Confirme a mesma senha nos dois campos.', variant: 'destructive' });
    setLoading(true);
    try {
      await comercialExternalApi.changePassword(password);
      setPassword(''); setConfirmation('');
      toast({ title: 'Senha atualizada', description: 'Sua senha foi alterada com sucesso.' });
    } catch (error) { toast({ title: 'Não foi possível alterar a senha', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Portal Comercial</p><h1 className="text-3xl font-bold">Minha conta</h1><p className="text-sm text-muted-foreground">Consulte seus dados e mantenha sua senha atualizada.</p></div>
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserCircle className="h-5 w-5 text-primary" />Dados do usuário</CardTitle></CardHeader><CardContent className="space-y-4"><div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">{actor.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div><p className="font-semibold">{actor.name}</p><p className="text-sm text-muted-foreground">{actor.email}</p></div></div><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Perfil</p><p className="font-medium">{profileLabels[actor.profile] || actor.profile}</p></div><div><p className="text-xs text-muted-foreground">Status</p><Badge variant={actor.status === 'active' ? 'default' : 'secondary'}>{actor.status === 'active' ? 'Ativo' : actor.status}</Badge></div></div><div><p className="text-xs text-muted-foreground">Equipe</p><p className="font-medium">{actor.team_name || 'Sem equipe vinculada'}</p></div></CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />Alterar senha</CardTitle></CardHeader><form onSubmit={changePassword}><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="account-password">Nova senha</Label><Input id="account-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} autoComplete="new-password" /></div><div className="space-y-2"><Label htmlFor="account-confirmation">Confirmar nova senha</Label><Input id="account-confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={loading} autoComplete="new-password" /></div><p className="text-xs text-muted-foreground">Use pelo menos 6 caracteres. A alteração mantém sua sessão ativa.</p><Button type="submit" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar nova senha</Button></CardContent></form></Card>
    </div>
  </div>;
}
