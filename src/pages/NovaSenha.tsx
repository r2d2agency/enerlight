import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useThemedBranding } from '@/hooks/use-branding';
import { Loader2, KeyRound, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const newPasswordSchema = z
  .object({
    newPassword: z.string().min(6, { message: 'Senha deve ter no mínimo 6 caracteres' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'As senhas não conferem',
    path: ['confirmPassword'],
  });

const NovaSenha = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const { logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { branding } = useThemedBranding();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = newPasswordSchema.safeParse({ newPassword, confirmPassword });
    if (!result.success) {
      const fieldErrors: { newPassword?: string; confirmPassword?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'newPassword') fieldErrors.newPassword = err.message;
        if (err.path[0] === 'confirmPassword') fieldErrors.confirmPassword = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      await authApi.setNewPassword(result.data.newPassword);
      toast({ title: 'Senha atualizada com sucesso!', description: 'Faça login novamente com a nova senha.' });
      logout();
      navigate('/login', { replace: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível atualizar a senha. Tente novamente.';
      toast({ title: 'Erro ao atualizar senha', description: message, variant: 'destructive' });
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
                    <KeyRound className="h-8 w-8 text-primary-foreground" />
                  </div>
                )}
              </div>
              <CardTitle>Cadastre uma nova senha</CardTitle>
              <CardDescription>
                Você entrou com uma senha temporária. Defina uma nova senha para continuar.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
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
                      <span className="sr-only">
                        {showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      </span>
                    </Button>
                  </div>
                  {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
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
              <CardFooter className="flex flex-col gap-4">
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar nova senha
                </Button>
              </CardFooter>
            </form>
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

export default NovaSenha;
