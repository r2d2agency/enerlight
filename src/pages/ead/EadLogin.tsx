import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, GraduationCap } from 'lucide-react';

export default function EadLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await eadApi.login(email, password);
      eadToken.set(r.token);
      toast.success(`Bem-vindo(a), ${r.student.name}!`);
      nav('/ead');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao entrar');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2"><GraduationCap className="h-10 w-10 text-primary" /></div>
          <CardTitle>Academia do Instalador</CardTitle>
          <CardDescription>Entre para acessar seus cursos e certificados</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div><Label>Senha</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Entrar
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Não tem cadastro? <Link to="/ead/cadastro" className="text-primary font-medium">Cadastre-se</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
