import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Clock, History, Map as MapIcon, Settings as SettingsIcon,
  UserPlus, Monitor, ShieldCheck, ChevronRight, FileSpreadsheet,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import MyPoint from "@/components/rh/MyPoint";
import RhRegisters from "@/components/rh/RhRegisters";
import EmployeeManagement from "@/components/rh/admin/EmployeeManagement";
import RhLocations from "@/components/rh/admin/RhLocations";
import JourneyManagement from "@/components/rh/admin/JourneyManagement";
import PunchAdmin from "@/components/rh/admin/PunchAdmin";
import TimesheetAdmin from "@/components/rh/admin/TimesheetAdmin";
import RhDashboard from "@/components/rh/RhDashboard";
import { useAuth } from "@/contexts/AuthContext";
import { MainLayout } from "@/components/layout/MainLayout";


type SectionId =
  | "dashboard" | "my-point" | "punches" | "timesheet" | "employees"
  | "registers" | "locations" | "journeys";

interface SectionDef {
  id: SectionId;
  label: string;
  description: string;
  icon: any;
  group: string;
  visible: boolean;
}

export default function RhModule() {
  const { user, permissions } = useAuth() as any;
  const navigate = useNavigate();
  const [active, setActive] = useState<SectionId>("dashboard");

  const isAdmin = user?.role === "owner" || user?.role === "admin";
  const canDashboard = isAdmin || permissions?.can_view_hr_dashboard || permissions?.can_manage_rh_punches || permissions?.can_approve_rh;

  const sections: SectionDef[] = [
    { id: "dashboard", label: "Dashboard", description: "Visão geral do RH", icon: LayoutDashboard, group: "Pessoal", visible: true },
    { id: "my-point", label: "Meu Ponto", description: "Registrar e ver minhas batidas", icon: Clock, group: "Pessoal", visible: true },
    { id: "punches", label: "Painel de Pontos", description: "Batidas do dia e ajustes", icon: ShieldCheck, group: "Gestão", visible: !!canDashboard },
    { id: "timesheet", label: "Folha de Ponto", description: "Fechamento mensal por colaborador", icon: FileSpreadsheet, group: "Gestão", visible: !!canDashboard },
    { id: "employees", label: "Colaboradores", description: "Cadastro e ficha completa", icon: UserPlus, group: "Gestão", visible: isAdmin },
    { id: "registers", label: "Registros", description: "Histórico e aniversariantes", icon: History, group: "Gestão", visible: isAdmin },
    { id: "locations", label: "Locais", description: "Locais autorizados de atuação", icon: MapIcon, group: "Configurações", visible: isAdmin },
    { id: "journeys", label: "Jornadas", description: "Escalas e horários de trabalho", icon: SettingsIcon, group: "Configurações", visible: isAdmin },
  ];

  const visibleSections = sections.filter((s) => s.visible);
  const grouped = visibleSections.reduce<Record<string, SectionDef[]>>((acc, s) => {
    (acc[s.group] ||= []).push(s);
    return acc;
  }, {});
  const currentSection = visibleSections.find((s) => s.id === active) || visibleSections[0];

  const renderContent = () => {
    switch (active) {
      case "dashboard":
        return <RhDashboard onNavigate={(id) => setActive(id as SectionId)} />;
      case "my-point":
        return <MyPoint />;
      case "punches":
        return canDashboard ? <PunchAdmin /> : null;
      case "employees":
        return isAdmin ? <EmployeeManagement /> : null;
      case "registers":
        return isAdmin ? <RhRegisters /> : null;
      case "locations":
        return isAdmin ? <RhLocations /> : null;
      case "journeys":
        return isAdmin ? <JourneyManagement /> : null;
    }
  };

  return (
    <MainLayout>
    <div className="p-4 md:p-6">

      <div className="flex justify-between items-start flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">RH</h1>
          <p className="text-muted-foreground text-sm">Gestão de pessoas, jornada e ponto</p>
        </div>
        <Button onClick={() => navigate("/rh/kiosk")} className="gap-2">
          <Monitor className="h-4 w-4" />
          Modo Kiosk
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <aside className="lg:sticky lg:top-4 self-start">
          <Card className="p-2">
            <nav className="space-y-4">
              {Object.entries(grouped).map(([group, items]) => (
                <div key={group}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </p>
                  <div className="space-y-0.5">
                    {items.map((s) => {
                      const isActive = active === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setActive(s.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground font-medium shadow-sm"
                              : "hover:bg-muted text-foreground/80"
                          )}
                        >
                          <s.icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{s.label}</span>
                          {isActive && <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </Card>
        </aside>

        <main className="min-w-0">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">{currentSection?.label}</h2>
            <p className="text-sm text-muted-foreground">{currentSection?.description}</p>
          </div>
          <div>{renderContent()}</div>
        </main>
      </div>
    </div>
    </MainLayout>
  );

}
