import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eadApi, eadToken } from '@/lib/ead-api';
import { resolveMediaUrl } from '@/lib/media';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, GraduationCap } from 'lucide-react';

export default function EadBrandLogin() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const [brand, setBrand] = useState<any>(null);
  const [loadingBrand, setLoadingBrand] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    eadApi.getBrand(slug).then(setBrand).catch(() => setBrand(null)).finally(() => setLoadingBrand(false));
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await eadApi.login(email, password);
      eadToken.set(r.token);
      const targetSlug = (r.student as any).brand_slug || slug;
      toast.success(`Bem-vindo(a), ${r.student.name}!`);
      nav(targetSlug ? `/marca/${targetSlug}/inicio` : '/ead');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao entrar');
    } finally { setLoading(false); }
  }

  if (loadingBrand) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const primary = brand?.primary_color || '#0ea5e9';
  const accent = brand?.accent_color || '#0284c7';
  const logo = resolveMediaUrl(brand?.logo_url);
  const cover = resolveMediaUrl(brand?.cover_url);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primary}10, ${accent}20)` }}>
      <div
        className="relative overflow-hidden shrink-0"
        style={cover
          ? { backgroundImage: `linear-gradient(135deg, ${primary}cc, ${accent}dd), url(${cover})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : { background: `linear-gradient(135deg, ${primary}, ${accent})` }}
      >
        <div className="max-w-5xl mx-auto px-4 py-5 sm:py-6 flex items-center justify-center gap-3">
          {logo ? (
            <div className="bg-white rounded-xl px-4 py-2 shadow-md flex items-center justify-center">
              <img src={logo} alt={brand?.name} className="h-10 sm:h-12 object-contain" />
            </div>
          ) : (
            <GraduationCap className="h-10 w-10 text-white" />
          )}
          <span className="text-white font-semibold text-lg sm:text-xl drop-shadow-sm">{brand?.name || 'Academia do Instalador'}</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-xl border-0">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-xl font-semibold mb-1">Entrar na área {brand?.name || ''}</h2>
            <p className="text-sm text-muted-foreground mb-6">Use seu e-mail e senha cadastrados.</p>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>E-mail</Label><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
              <div><Label>Senha</Label><Input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full text-white" disabled={loading} style={{ background: primary }}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Entrar
              </Button>
              {slug && (
                <p className="text-sm text-center text-muted-foreground">
                  Ainda não tem cadastro?{' '}
                  <Link to={`/marca/${slug}`} className="font-medium" style={{ color: primary }}>Cadastre-se</Link>
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
