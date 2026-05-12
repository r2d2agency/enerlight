import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Users, 
  Clock, 
  MapPin, 
  AlertTriangle, 
  CheckCircle,
  BarChart3,
  Calendar
} from "lucide-react";
import MyPoint from "@/components/rh/MyPoint";

export default function RhModule() {
  const [activeTab, setActiveTab] = useState("my-point");

  const stats = [
    { title: "Presentes", value: "42", icon: Users, color: "text-blue-500" },
    { title: "Em Intervalo", value: "8", icon: Clock, color: "text-orange-500" },
    { title: "Pendentes", value: "3", icon: AlertTriangle, color: "text-red-500" },
    { title: "Regulares", value: "39", icon: CheckCircle, color: "text-green-500" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">RH / Registro de Ponto</h1>
          <p className="text-muted-foreground text-sm">Gestão de jornada e controle de frequência</p>
        </div>
      </div>

      <Tabs defaultValue="my-point" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="my-point">Meu Ponto</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="registers">Registros</TabsTrigger>
          <TabsTrigger value="locations">Locais</TabsTrigger>
          <TabsTrigger value="settings">Jornadas</TabsTrigger>
        </TabsList>

        <TabsContent value="my-point" className="mt-0">
          <MyPoint />
        </TabsContent>

        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          {/* Add charts and more stats here */}
        </TabsContent>

        <TabsContent value="registers">
          <Card>
            <CardHeader>
              <CardTitle>Histórico de Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-10 text-muted-foreground">
                Tabela de registros será exibida aqui.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations">
          <Card>
            <CardHeader>
              <CardTitle>Locais de Atuação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-10 text-muted-foreground">
                Cadastro de locais será exibido aqui.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de Jornada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-10 text-muted-foreground">
                Configurações de jornada serão exibidas aqui.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
