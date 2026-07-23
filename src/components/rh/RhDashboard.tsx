import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, UserCheck, UserX, Clock, AlertTriangle, Cake,
  CalendarDays, ArrowRight, ScanFace,
} from "lucide-react";
import { api } from "@/lib/api";
import { useRh } from "@/hooks/use-rh";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Missing = { user_id: string; name: string; email: string };

interface Props {
  onNavigate?: (section: string) => void;
}

export default function RhDashboard({ onNavigate }: Props) {
  const { getEmployees } = useRh();
  const [employees, setEmployees] = useState<any[]>([]);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [todayPunches, setTodayPunches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [emps, miss, punches] = await Promise.all([
          getEmployees(),
          api<Missing[]>('/api/rh/punches/dashboard/missing-today').catch(() => []),
          api<any[]>(`/api/rh/punches?date=${new Date().toISOString().slice(0, 10)}`).catch(() => []),
        ]);
        setEmployees(emps);
        setMissing(Array.isArray(miss) ? miss : []);
        setTodayPunches(Array.isArray(punches) ? punches : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [getEmployees]);

  const activeCount = employees.filter((e) => e.is_active !== false).length;
  const inactiveCount = employees.length - activeCount;
  const facialCount = employees.filter((e) => e.facial_registered).length;
  const uniquePunchers = new Set(todayPunches.map((p) => p.user_id)).size;

  const today = new Date();
  const birthdaysToday = employees.filter((emp) => {
    if (!emp.birth_date) return false;
    const d = new Date(emp.birth_date);
    return d.getUTCDate() === today.getDate() && d.getUTCMonth() === today.getMonth();
  });
  const birthdaysMonth = employees.filter((emp) => {
    if (!emp.birth_date) return false;
    return new Date(emp.birth_date).getUTCMonth() === today.getMonth();
  });

  const cards = [
    { label: "Colaboradores ativos", value: activeCount, icon: UserCheck, tint: "text-emerald-600 bg-emerald-50" },
    { label: "Inativos", value: inactiveCount, icon: UserX, tint: "text-slate-600 bg-slate-100" },
    { label: "Bateram ponto hoje", value: uniquePunchers, icon: Clock, tint: "text-blue-600 bg-blue-50" },
    { label: "Sem bater ponto", value: missing.length, icon: AlertTriangle, tint: "text-amber-600 bg-amber-50" },
    { label: "Facial cadastrada", value: facialCount, icon: ScanFace, tint: "text-violet-600 bg-violet-50" },
    { label: "Aniversários no mês", value: birthdaysMonth.length, icon: CalendarDays, tint: "text-pink-600 bg-pink-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Visão geral</h2>
        <p className="text-sm text-muted-foreground">
          {format(today, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <Card key={c.label} className="border-none shadow-sm">
            <CardContent className="pt-5">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center mb-3 ${c.tint}`}>
                <c.icon className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold leading-none">{loading ? "—" : c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Sem bater ponto hoje
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate?.("punches")} className="gap-1">
              Painel <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : missing.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todos bateram ponto. 🎉</p>
            ) : (
              missing.slice(0, 6).map((m) => (
                <div key={m.user_id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <span className="font-medium">{m.name}</span>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>
                </div>
              ))
            )}
            {missing.length > 6 && (
              <p className="text-xs text-muted-foreground pt-2">+ {missing.length - 6} outros</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cake className="h-4 w-4 text-pink-500" />
              Aniversariantes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Hoje</p>
              {birthdaysToday.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum aniversariante hoje.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {birthdaysToday.map((e) => (
                    <Badge key={e.id} className="bg-pink-100 text-pink-800 hover:bg-pink-100">{e.name}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Este mês ({birthdaysMonth.length})</p>
              <div className="flex flex-wrap gap-1.5">
                {birthdaysMonth.slice(0, 12).map((e) => (
                  <span key={e.id} className="text-xs px-2 py-1 rounded-md bg-muted">
                    {e.name} · {format(new Date(e.birth_date), "dd/MM")}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Ações rápidas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Button variant="outline" className="justify-start" onClick={() => onNavigate?.("my-point")}>
            <Clock className="h-4 w-4 mr-2" /> Bater meu ponto
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onNavigate?.("punches")}>
            <AlertTriangle className="h-4 w-4 mr-2" /> Painel de pontos
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onNavigate?.("employees")}>
            <Users className="h-4 w-4 mr-2" /> Colaboradores
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => onNavigate?.("journeys")}>
            <CalendarDays className="h-4 w-4 mr-2" /> Jornadas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
