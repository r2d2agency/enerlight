import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock, History, Map as MapIcon, Settings as SettingsIcon,
  UserPlus, Monitor, BarChart3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import MyPoint from "@/components/rh/MyPoint";
import RhRegisters from "@/components/rh/RhRegisters";
import EmployeeManagement from "@/components/rh/admin/EmployeeManagement";
import RhLocations from "@/components/rh/admin/RhLocations";
import JourneyManagement from "@/components/rh/admin/JourneyManagement";
import PunchAdmin from "@/components/rh/admin/PunchAdmin";
import { useAuth } from "@/contexts/AuthContext";

export default function RhModule() {
  const { user, permissions } = useAuth() as any;
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("my-point");

  const isAdmin = user?.role === 'owner' || user?.role === 'admin';
  const canDashboard = isAdmin || permissions?.can_view_hr_dashboard || permissions?.can_manage_rh_punches || permissions?.can_approve_rh;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">RH / Registro de Ponto</h1>
          <p className="text-muted-foreground text-sm">Gestão de jornada e controle de frequência</p>
        </div>
        <Button onClick={() => navigate('/rh/kiosk')} className="gap-2">
          <Monitor className="h-4 w-4" />
          Modo Kiosk
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto pb-2 scrollbar-none">
          <TabsList className="inline-flex min-w-full md:min-w-0 md:grid md:w-full md:grid-cols-6 h-auto p-1 bg-muted/50">
            <TabsTrigger value="my-point" className="gap-2 py-2.5">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Meu Ponto</span>
              <span className="sm:hidden">Ponto</span>
            </TabsTrigger>
            {canDashboard && (
              <TabsTrigger value="dashboard" className="gap-2 py-2.5">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Painel de Pontos</span>
                <span className="sm:hidden">Painel</span>
              </TabsTrigger>
            )}
            {isAdmin && (
              <>
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
              </>
            )}
          </TabsList>
        </div>

        <TabsContent value="my-point" className="mt-6">
          <MyPoint />
        </TabsContent>

        {canDashboard && (
          <TabsContent value="dashboard" className="mt-6">
            <PunchAdmin />
          </TabsContent>
        )}

        {isAdmin && (
          <>
            <TabsContent value="employees" className="mt-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-3"><CardTitle>Gestão de Colaboradores</CardTitle></CardHeader>
                <CardContent><EmployeeManagement /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="registers" className="mt-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-3"><CardTitle>Gestão de Registros</CardTitle></CardHeader>
                <CardContent><RhRegisters /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="locations" className="mt-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-3"><CardTitle>Gestão de Locais de Atuação</CardTitle></CardHeader>
                <CardContent><RhLocations /></CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
              <Card>
                <CardHeader><CardTitle>Configurações de Jornada</CardTitle></CardHeader>
                <CardContent><JourneyManagement /></CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

