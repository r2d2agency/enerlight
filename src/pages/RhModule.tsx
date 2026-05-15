import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Clock, 
  MapPin, 
  AlertTriangle, 
  CheckCircle,
  BarChart3,
  Calendar,
  History,
  ShieldCheck,
  Map as MapIcon,
  Settings as SettingsIcon,
  Clock8,
  UserPlus
} from "lucide-react";
import MyPoint from "@/components/rh/MyPoint";
import RhRegisters from "@/components/rh/RhRegisters";
import EmployeeManagement from "@/components/rh/admin/EmployeeManagement";
import RhLocations from "@/components/rh/admin/RhLocations";
import { useAuth } from "@/contexts/AuthContext";


export default function RhModule() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("my-point");


  const stats = [
    { title: "Presentes", value: "0", icon: Users, color: "text-blue-500" },
    { title: "Em Intervalo", value: "0", icon: Clock, color: "text-orange-500" },
    { title: "Pendentes", value: "0", icon: AlertTriangle, color: "text-red-500" },
    { title: "Regulares", value: "0", icon: CheckCircle, color: "text-green-500" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">RH / Registro de Ponto</h1>
          <p className="text-muted-foreground text-sm">Gestão de jornada e controle de frequência Enerlight</p>
        </div>
      </div>

      <Tabs defaultValue="my-point" className="w-full" onValueChange={setActiveTab}>
        <div className="overflow-x-auto pb-2 scrollbar-none">
          <TabsList className="inline-flex min-w-full md:min-w-0 md:grid md:w-full md:grid-cols-6 h-auto p-1 bg-muted/50">
            <TabsTrigger value="my-point" className="gap-2 py-2.5">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Meu Ponto</span>
              <span className="sm:hidden">Ponto</span>
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="gap-2 py-2.5">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Painel RH</span>
              <span className="sm:hidden">RH</span>
            </TabsTrigger>
            <TabsTrigger value="employees" className="gap-2 py-2.5">
              <UserPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Colaboradores</span>
              <span className="sm:hidden">Equipe</span>
            </TabsTrigger>
            <TabsTrigger value="registers" className="gap-2 py-2.5">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Registros</span>
              <span className="sm:hidden">Logs</span>
            </TabsTrigger>
            <TabsTrigger value="locations" className="gap-2 py-2.5">
              <MapIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Locais</span>
              <span className="sm:hidden">Obras</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 py-2.5">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Jornadas</span>
              <span className="sm:hidden">Cfg</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="my-point" className="mt-6">
          <MyPoint />
        </TabsContent>

        <TabsContent value="dashboard" className="mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((stat) => (
              <Card key={stat.title} className="border-none shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-[10px] text-muted-foreground mt-1">+2% em relação a ontem</p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Clock8 className="h-5 w-5 text-primary" />
                  Presença em Tempo Real
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] flex items-center justify-center border-2 border-dashed rounded-xl bg-muted/30">
                  <div className="text-center">
                    <BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-muted-foreground text-sm">Gráfico de presença consolidada</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Ações Rápidas
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full justify-start gap-2" variant="outline">
                  <CheckCircle className="h-4 w-4" /> Aprovar Todas Pendências
                </Button>
                <Button className="w-full justify-start gap-2" variant="outline">
                  <Calendar className="h-4 w-4" /> Exportar Folha Mensal
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>Gestão de Colaboradores</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="registers" className="mt-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>Gestão de Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <RhRegisters />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle>Gestão de Locais de Atuação</CardTitle>
            </CardHeader>
            <CardContent>
              <RhLocations />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Jornada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-10 text-muted-foreground">
                <SettingsIcon className="h-12 w-12 mx-auto mb-4 opacity-20" />
                Configurações de jornada serão exibidas aqui.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
