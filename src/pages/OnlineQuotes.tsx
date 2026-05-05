import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, FileText, List, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function OnlineQuotes() {
  const { user } = useAuth();
  const isAdmin = ['owner', 'admin', 'manager'].includes(user?.role || '');

  return (
    <MainLayout>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Orçamentos Online</h1>
            <p className="text-muted-foreground">
              Gerencie tabelas de preços, permissões e gere orçamentos personalizados.
            </p>
          </div>
          <div className="flex gap-2">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Novo Orçamento
            </Button>
          </div>
        </div>

        <Tabs defaultValue="quotes" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="quotes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" /> Orçamentos
            </TabsTrigger>
            <TabsTrigger value="price-lists" className="flex items-center gap-2">
              <List className="h-4 w-4" /> Tabelas
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="access" className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Permissões
                </TabsTrigger>
                <TabsTrigger value="settings" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Ajustes
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="quotes" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Meus Orçamentos</CardTitle>
                <CardDescription>
                  Visualize e gerencie seus orçamentos gerados.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium">Nenhum orçamento encontrado</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Comece criando seu primeiro orçamento clicando no botão acima.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="price-lists" className="mt-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>Tabelas de Preços</CardTitle>
                  <CardDescription>
                    Tabelas disponíveis para seu perfil.
                  </CardDescription>
                </div>
                {isAdmin && (
                  <Button variant="outline" size="sm">
                    <Plus className="mr-2 h-4 w-4" /> Nova Tabela
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                   {/* Placeholder for price lists */}
                   <Card className="hover:border-primary/50 transition-colors cursor-pointer border-dashed">
                     <CardHeader className="pb-2">
                        <CardTitle className="text-base text-muted-foreground">Tabela Matriz</CardTitle>
                     </CardHeader>
                     <CardContent>
                        <p className="text-xs text-muted-foreground">Preços oficiais da organização.</p>
                     </CardContent>
                   </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="access" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Controle de Acesso</CardTitle>
                    <CardDescription>
                      Gerencie quais usuários ou canais podem acessar cada tabela de preços.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground italic">Em desenvolvimento...</p>
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="settings" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Configuração do Orçamento</CardTitle>
                    <CardDescription>
                      Personalize a página de rosto e o rodapé dos orçamentos gerados.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                     <div className="grid gap-2">
                        <label className="text-sm font-medium">Página de Rosto Padrão (URL)</label>
                        <input type="text" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" placeholder="https://..." />
                     </div>
                     <div className="grid gap-2">
                        <label className="text-sm font-medium">Rodapé Padrão</label>
                        <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" placeholder="Informações de contato, termos e condições..." />
                     </div>
                     <Button>Salvar Configurações</Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </MainLayout>
  );
}
