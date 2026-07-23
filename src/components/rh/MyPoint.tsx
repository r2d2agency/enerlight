import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, MapPin, User, Fingerprint,
  CheckCircle2, AlertTriangle, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FacialValidation from "./FacialValidation";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";

const LABEL_MAP: Record<string, string> = {
  entrada: 'Entrada',
  cafe_ini: 'Intervalo',
  cafe_fim: 'Retorno intervalo',
  almoco_ini: 'Almoço (saída)',
  almoco_fim: 'Almoço (volta)',
  saida: 'Saída',
  extra: 'Extra',
};

const MAX_PER_DAY = 6;

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export default function MyPoint() {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [gpsStatus, setGpsStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  const [showFacial, setShowFacial] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<PunchType | null>(null);
  const [myPunches, setMyPunches] = useState<any[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const employeeName = user?.name || "Colaborador";
  const employeeRole = user?.role || "";

  const authorizedLocation = {
    name: "Sede Enerlight",
    lat: -23.55052, lng: -46.633308, radius: 500,
  };

  const loadPunches = useCallback(async () => {
    try {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      const r = await api<any[]>(`/api/rh/punches/me?from=${from.toISOString()}`);
      setMyPunches(Array.isArray(r) ? r : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    checkGPS();
    loadPunches();
    return () => clearInterval(timer);
  }, [loadPunches]);

  const checkGPS = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { setGpsStatus('active'); setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        () => setGpsStatus('inactive')
      );
    } else setGpsStatus('inactive');
  };

  const validateLocation = (): Promise<{ok: boolean; lat?: number; lng?: number}> =>
    new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve({ ok: false });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const d = getDistance(pos.coords.latitude, pos.coords.longitude, authorizedLocation.lat, authorizedLocation.lng);
          if (d <= authorizedLocation.radius) resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude });
          else { toast.error("Você está fora da área autorizada."); resolve({ ok: false }); }
        },
        () => { toast.error("Ative o GPS."); resolve({ ok: false }); }
      );
    });

  const handleRegisterClick = async (type: PunchType) => {
    if (gpsStatus !== 'active') { toast.error("Ative o GPS"); checkGPS(); return; }
    const loc = await validateLocation();
    if (!loc.ok) return;
    setCoords({ lat: loc.lat!, lng: loc.lng! });
    setPendingPoint(type);
    setShowFacial(true);
  };

  const onFacialValidated = async (success: boolean) => {
    setShowFacial(false);
    if (!success || !pendingPoint) {
      if (!success) toast.error("Não foi possível validar sua identidade.");
      setPendingPoint(null);
      return;
    }
    try {
      await api('/api/rh/punches', {
        method: 'POST',
        body: {
          punch_type: TYPE_MAP[pendingPoint],
          source: 'app',
          latitude: coords?.lat,
          longitude: coords?.lng,
        },
      });
      toast.success(`${pendingPoint} registrado com sucesso!`);
      loadPunches();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao registrar batida');
    }
    setPendingPoint(null);
  };

  // Agrupa por dia
  const byDay: Record<string, any[]> = {};
  for (const p of myPunches) {
    const d = new Date(p.punched_at).toLocaleDateString('pt-BR');
    (byDay[d] = byDay[d] || []).push(p);
  }
  const days = Object.keys(byDay);

  const todayStr = new Date().toLocaleDateString('pt-BR');
  const todayPunches = byDay[todayStr] || [];
  const lastType = todayPunches[0]?.punch_type;

  return (
    <div className="container max-w-lg mx-auto p-4 space-y-6 pb-20">
      {showFacial && (
        <FacialValidation mode="validate" targetId={user?.id}
          onValidated={onFacialValidated} onCancel={() => { setShowFacial(false); setPendingPoint(null); }} />
      )}

      <Card className="border-none shadow-lg bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="pt-6 text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold">{employeeName}</h2>
            <p className="text-muted-foreground text-sm">{employeeRole}</p>
          </div>
          <div className="text-4xl font-mono font-bold tracking-tighter">
            {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-muted-foreground text-sm">
            {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="pt-6 flex flex-col items-center gap-1">
          <MapPin className={cn("h-5 w-5", gpsStatus === 'active' ? "text-green-500" : "text-red-500")} />
          <span className="text-xs text-muted-foreground">GPS</span>
          <span className="text-sm font-semibold">{gpsStatus === 'active' ? "Ativo" : "Inativo"}</span>
        </CardContent></Card>
        <Card><CardContent className="pt-6 flex flex-col items-center gap-1">
          <AlertTriangle className="h-5 w-5 text-primary" />
          <span className="text-xs text-muted-foreground">Batidas hoje</span>
          <span className="text-sm font-semibold">{todayPunches.length}</span>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Button size="lg" className="h-20 flex flex-col gap-1 rounded-2xl"
          disabled={lastType === 'entrada'} onClick={() => handleRegisterClick("Entrada")}>
          <Play className="h-5 w-5" /><span className="font-bold text-xs">Entrada</span>
        </Button>
        <Button size="lg" variant="secondary" className="h-20 flex flex-col gap-1 rounded-2xl"
          onClick={() => handleRegisterClick("Café")}>
          <Coffee className="h-5 w-5" /><span className="font-bold text-xs">Café</span>
        </Button>
        <Button size="lg" variant="secondary" className="h-20 flex flex-col gap-1 rounded-2xl"
          onClick={() => handleRegisterClick("Volta Café")}>
          <History className="h-5 w-5" /><span className="font-bold text-xs">Volta Café</span>
        </Button>
        <Button size="lg" variant="secondary" className="h-20 flex flex-col gap-1 rounded-2xl"
          onClick={() => handleRegisterClick("Almoço")}>
          <Coffee className="h-5 w-5" /><span className="font-bold text-xs">Almoço</span>
        </Button>
        <Button size="lg" variant="secondary" className="h-20 flex flex-col gap-1 rounded-2xl"
          onClick={() => handleRegisterClick("Volta")}>
          <History className="h-5 w-5" /><span className="font-bold text-xs">Volta</span>
        </Button>
        <Button size="lg" variant="destructive" className="h-20 flex flex-col gap-1 rounded-2xl"
          onClick={() => handleRegisterClick("Saída")}>
          <LogOut className="h-5 w-5" /><span className="font-bold text-xs">Saída</span>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Minhas batidas
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={loadPunches}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {days.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-6">
              Nenhuma batida nos últimos 7 dias.
            </div>
          ) : days.map((d) => (
            <div key={d} className="space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">{d}</div>
              <div className="space-y-1">
                {byDay[d].slice().reverse().map((p) => (
                  <div key={p.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>{LABEL_MAP[p.punch_type] || p.punch_type}</span>
                      {p.source === 'manual' && (
                        <Badge variant="outline" className="text-[10px]">manual</Badge>
                      )}
                      {p.source === 'kiosk' && (
                        <Badge variant="secondary" className="text-[10px]">kiosk</Badge>
                      )}
                    </div>
                    <span className="font-mono text-sm">{fmtTime(p.punched_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
