import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useThemedBranding } from '@/hooks/use-branding';
import { Loader2, Zap, MailCheck, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

const emailSchema = z.string().trim().email({ message: 'Email inválido' });

const EsqueciSenha = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const { toast } = useToast();
  const { branding } = useThemedBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError(result.error.errors[0]?.message);
      return;
    }

    setIsLoading(true);
    try {
      await authApi.forgotPassword(result.data);
      setSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível enviar o email. Tente novamente.';
      toast({ title: 'Erro ao solicitar recuperação', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden w-full max-w-full">
      <div className="flex-1 flex items-center justify-center px-4 py-8 w-full max-w-full">
        <div className="w-full max-w-md space-y-6 min-w-0">
          <Card className="shadow-neon w-full overflow-hidden">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                {branding.logo_login ? (
                  <img src={branding.logo_login} alt="Logo" className="h-[100px] max-w-[400px] object-contain" />
                ) : (
                  <div className="gradient-primary p-3 rounded-full neon-glow">
                    <Zap className="h-8 w-8 text-primary-foreground" />
                  </div>
                )}
              </div>
              <CardTitle>Esqueci minha senha</CardTitle>
              <CardDescription>
                {sent
                  ? 'Verifique sua caixa de entrada.'
                  : 'Informe seu email cadastrado para receber uma senha temporária.'}
              </CardDescription>
            </CardHeader>

            {sent ? (
              <CardContent className="space-y-4 text-center">
                <div className="flex justify-center">
                  <MailCheck className="h-10 w-10 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Se o email <b>{email}</b> estiver cadastrado, você receberá uma senha temporária em instantes.
                  Use-a para entrar e, em seguida, cadastre uma nova senha.
                </p>
              </CardContent>
            ) : (
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoFocus
                    />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-4">
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar senha temporária
                  </Button>
                </CardFooter>
              </form>
            )}

            <CardFooter className="justify-center pt-0">
              <Link to="/login" className="text-sm text-primary hover:underline flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                Voltar para o login
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>

      <footer className="py-4 px-4 border-t">
        <div className="max-w-md mx-auto text-center">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {branding.company_name || 'Enerlight'}. Todos os direitos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default EsqueciSenha;
