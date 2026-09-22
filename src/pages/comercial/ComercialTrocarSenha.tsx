import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { comercialExternalApi, comercialToken } from '@/lib/comercial-api';
import { useToast } from '@/hooks/use-toast';
import { Briefcase, Loader2 } from 'lucide-react';

export default function ComercialTrocarSenha() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) return toast({ title: 'Senha inválida', description: 'A senha deve ter no mínimo 6 caracteres.', variant: 'destructive' });
    if (password !== confirmation) return toast({ title: 'Senhas diferentes', description: 'Confirme a mesma senha nos dois campos.', variant: 'destructive' });
    setLoading(true);
    try {
      await comercialExternalApi.changePassword(password);
      toast({ title: 'Senha atualizada', description: 'Você já pode acessar o Portal Comercial.' });
      navigate('/comercial/dashboard', { replace: true });
    } catch (error) {
      toast({ title: 'Não foi possível atualizar a senha', description: error instanceof Error ? error.message : 'Tente novamente.', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  if (!comercialToken.get()) { navigate('/comercial/login', { replace: true }); return null; }
  return <div className="min-h-screen flex items-center justify-center bg-background px-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><div className="flex justify-center mb-3"><div className="gradient-primary p-3 rounded-full"><Briefcase className="h-7 w-7 text-primary-foreground" /></div></div><CardTitle>Troque sua senha</CardTitle><CardDescription>A senha temporária é válida apenas para o primeiro acesso. Defina uma senha com no mínimo 6 caracteres.</CardDescription></CardHeader><form onSubmit={submit}><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="new-password">Nova senha</Label><Input id="new-password" type="password" value={password} onChange={e => setPassword(e.target.value)} disabled={loading} autoFocus /></div><div className="space-y-2"><Label htmlFor="confirm-password">Confirmar nova senha</Label><Input id="confirm-password" type="password" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={loading} /></div><Button className="w-full" disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar nova senha</Button></CardContent></form></Card></div>;
}
