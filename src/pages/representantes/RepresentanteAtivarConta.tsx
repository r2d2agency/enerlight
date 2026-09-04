import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { representantesApi } from '@/lib/representantes-api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { z } from 'zod';

const passwordSchema = z
  .object({
    password: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });

const RepresentanteAtivarConta = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [purpose, setPurpose] = useState<'invite' | 'reset' | undefined>();
  const [name, setName] = useState<string>();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    representantesApi
      .validarToken(token)
      .then((res) => {
        setTokenValid(res.valid);
        setPurpose(res.purpose);
        setName(res.name);
      })
      .catch(() => setTokenValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = passwordSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const fieldErrors: { password?: string; confirmPassword?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'password') fieldErrors.password = err.message;
        if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      await representantesApi.ativarConta(token, result.data.password);
      toast({ title: 'Senha definida com sucesso!', description: 'Faça login para continuar.' });
      navigate('/representantes/login', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível definir a senha. Tente novamente.';
      toast({ title: 'Erro ao definir senha', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const title = purpose === 'reset' ? 'Redefinir senha' : 'Ativar sua conta';
  const description = purpose === 'reset'
    ? 'Defina uma nova senha para acessar o portal.'
    : 'Defina sua senha para ativar o acesso ao portal de representantes.';

  return (
    <div className="min-h-screen flex flex-col bg-background overflow-x-hidden w-full max-w-full">
      <div className="flex-1 flex items-center justify-center px-4 py-8 w-full max-w-full">
        <div className="w-full max-w-md space-y-6 min-w-0">
          <Card className="shadow-neon w-full overflow-hidden">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="gradient-primary p-3 rounded-full neon-glow">
                  <KeyRound className="h-8 w-8 text-primary-foreground" />
                </div>
              </div>
              <CardTitle>{checking ? 'Verificando link...' : title}</CardTitle>
              {!checking && tokenValid && (
                <CardDescription>{name ? `Olá, ${name}! ` : ''}{description}</CardDescription>
              )}
            </CardHeader>

            {checking ? (
              <CardContent className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </CardContent>
            ) : !tokenValid ? (
              <CardContent className="space-y-4 text-center">
                <div className="flex justify-center">
                  <AlertTriangle className="h-10 w-10 text-destructive" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Este link é inválido ou expirou. Solicite um novo em "Esqueci minha senha" ou peça para o administrador reenviar o convite.
                </p>
                <Link to="/representantes/esqueci-senha" className="text-sm text-primary hover:underline block">
                  Solicitar novo link
                </Link>
              </CardContent>
            ) : (
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="password">Nova senha</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={isLoading}
                        autoComplete="new-password"
                        autoFocus
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Eye className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="sr-only">{showPassword ? 'Ocultar senha' : 'Mostrar senha'}</span>
                      </Button>
                    </div>
                    {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar senha</Label>
                    <Input
                      id="confirmPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="new-password"
                    />
                    {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar e continuar
                  </Button>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default RepresentanteAtivarConta;
