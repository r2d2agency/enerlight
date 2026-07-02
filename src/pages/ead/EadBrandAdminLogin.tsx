import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { eadBrandAdminApi, brandAdminToken, eadApi } from '@/lib/ead-api';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { resolveMediaUrl } from '@/lib/media';

export default function EadBrandAdminLogin() {
  const { slug = '' } = useParams();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [brand, setBrand] = useState<any>(null);
  const [brandLoading, setBrandLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setBrandLoading(true);
    eadApi.getBrand(slug)
      .then(b => setBrand(b))
      .catch(() => setBrand(null))
      .finally(() => setBrandLoading(false));
  }, [slug]);

  const logoUrl = resolveMediaUrl(brand?.logo_url);
  const brandName = brand?.name || 'Painel da Marca';

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
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto h-24 w-full flex items-center justify-center">
            {logoUrl && !brandLoading ? (
              <img
                src={logoUrl}
                alt={brandName}
                className="max-h-24 max-w-[200px] object-contain"
                onError={() => setBrand((prev: any) => ({ ...prev, logo_url: null }))}
              />
            ) : (
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <CardTitle>{brandName}</CardTitle>
            <p className="text-sm text-muted-foreground">Painel administrativo</p>
          </div>
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

