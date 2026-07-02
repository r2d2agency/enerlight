import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { eadBrandAdminApi, brandAdminToken } from '@/lib/ead-api';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export default function EadBrandAdminLogin() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await eadBrandAdminApi.login(slug, email, password);
      brandAdminToken.set(r.token);
      nav(`/marca/${slug}/admin`, { replace: true });
    } catch (err: any) {
      toast.error(err.message || 'Erro no login');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Painel da Marca</CardTitle>
          <p className="text-sm text-muted-foreground">/{slug}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div><Label>E-mail</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></div>
            <div><Label>Senha</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
            </Button>
            <Link to={`/marca/${slug}`} className="block text-xs text-center text-muted-foreground hover:underline">← Voltar para a área do instalador</Link>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
