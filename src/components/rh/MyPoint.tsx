import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  MapPin, 
  User, 
  Play, 
  Coffee, 
  LogOut, 
  CheckCircle2,
  History,
  AlertTriangle
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FacialValidation from "./FacialValidation";

// Haversine formula for distance
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // in metres
}

export default function MyPoint() {
  const [now, setNow] = useState(new Date());
  const [gpsStatus, setGpsStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  const [lastRegister, setLastRegister] = useState<string | null>(null);
  const [dailyStatus, setDailyStatus] = useState<'idle' | 'working' | 'break' | 'finished'>('idle');
  const [showFacial, setShowFacial] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<string | null>(null);
  
  // Simulated stats & config
  const employeeName = "João Silva";
  const employeeRole = "Consultor Técnico";
  const journey = "08:00 - 12:00 | 13:00 - 17:00";
  
  const authorizedLocation = {
    name: "Sede Enerlight",
    lat: -23.55052,
    lng: -46.633308,
    radius: 200 // meters
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    checkGPS();
    return () => clearInterval(timer);
  }, []);

  const checkGPS = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setGpsStatus('active'),
        () => setGpsStatus('inactive')
      );
    } else {
      setGpsStatus('inactive');
    }
  };

  const validateLocation = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        toast.error("GPS não suportado no seu dispositivo");
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const distance = getDistance(
            position.coords.latitude,
            position.coords.longitude,
            authorizedLocation.lat,
            authorizedLocation.lng
          );

          if (distance <= authorizedLocation.radius) {
            resolve(true);
          } else {
            toast.error("Você está fora da área autorizada para registro de ponto.");
            console.warn(`Tentativa fora do raio: ${distance.toFixed(2)}m`);
            resolve(false);
          }
        },
        (error) => {
          toast.error("Não foi possível obter sua localização. Ative o GPS.");
          resolve(false);
        }
      );
    });
  };

  const handleRegisterClick = async (type: string) => {
    if (gpsStatus !== 'active') {
      toast.error("Ative o GPS para registrar o ponto");
      checkGPS();
      return;
    }

    const isInArea = await validateLocation();
    if (!isInArea) return;

    setPendingPoint(type);
    setShowFacial(true);
  };

  const onFacialValidated = (success: boolean) => {
    setShowFacial(false);
    if (success && pendingPoint) {
      completeRegistration(pendingPoint);
    } else {
      toast.error("Não foi possível validar sua identidade.");
    }
    setPendingPoint(null);
  };

  const completeRegistration = (type: string) => {
    setLastRegister(`${type} - ${now.toLocaleTimeString()}`);
    toast.success(`${type} registrado com sucesso!`);
    
    if (type === "Entrada") setDailyStatus('working');
    if (type === "Almoço") setDailyStatus('break');
    if (type === "Volta") setDailyStatus('working');
    if (type === "Saída") setDailyStatus('finished');
  };

  return (
    <div className="container max-w-lg mx-auto p-4 space-y-6 pb-20">
      {showFacial && (
        <FacialValidation 
          onValidated={onFacialValidated} 
          onCancel={() => setShowFacial(false)} 
        />
      )}

      <Card className="border-none shadow-lg bg-gradient-to-br from-primary/10 via-background to-background">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold">{employeeName}</h2>
            <p className="text-muted-foreground">{employeeRole}</p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-xs font-medium">
            <Clock className="h-3 w-3" />
            {journey}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-2">
            <MapPin className={cn("h-5 w-5", gpsStatus === 'active' ? "text-green-500" : "text-red-500")} />
            <span className="text-xs text-muted-foreground">GPS</span>
            <span className="text-sm font-semibold">{gpsStatus === 'active' ? "Ativo" : "Inativo"}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-2">
            <AlertTriangle className={cn(
              "h-5 w-5", 
              dailyStatus === 'idle' ? "text-muted-foreground" : 
              dailyStatus === 'finished' ? "text-blue-500" : "text-green-500"
            )} />
            <span className="text-xs text-muted-foreground">Status do Dia</span>
            <span className="text-sm font-semibold capitalize">
              {dailyStatus === 'idle' ? 'Não iniciado' : 
               dailyStatus === 'working' ? 'Em andamento' :
               dailyStatus === 'break' ? 'Em intervalo' : 'Finalizado'}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col items-center py-8 space-y-2">
        <div className="text-5xl font-mono font-bold tracking-tighter">
          {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className="text-muted-foreground font-medium">
          {now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Button 
            size="lg" 
            className="h-24 flex flex-col gap-2 rounded-2xl shadow-md transition-all active:scale-95"
            disabled={dailyStatus !== 'idle'}
            onClick={() => handleRegisterClick("Entrada")}
          >
            <Play className="h-6 w-6" />
            <span className="font-bold">Entrada</span>
          </Button>
          <Button 
            size="lg" 
            variant="secondary"
            className="h-24 flex flex-col gap-2 rounded-2xl shadow-sm transition-all active:scale-95"
            disabled={dailyStatus !== 'working'}
            onClick={() => handleRegisterClick("Almoço")}
          >
            <Coffee className="h-6 w-6" />
            <span className="font-bold">Almoço</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Button 
            size="lg" 
            variant="secondary"
            className="h-24 flex flex-col gap-2 rounded-2xl shadow-sm transition-all active:scale-95"
            disabled={dailyStatus !== 'break'}
            onClick={() => handleRegisterClick("Volta")}
          >
            <History className="h-6 w-6" />
            <span className="font-bold">Volta</span>
          </Button>
          <Button 
            size="lg" 
            variant="destructive"
            className="h-24 flex flex-col gap-2 rounded-2xl shadow-md transition-all active:scale-95"
            disabled={dailyStatus !== 'working'}
            onClick={() => handleRegisterClick("Saída")}
          >
            <LogOut className="h-6 w-6" />
            <span className="font-bold">Saída</span>
          </Button>
        </div>
        
        <Button variant="outline" className="w-full mt-2 h-12">
          Solicitar Hora Extra
        </Button>
      </div>

      {lastRegister && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted p-4 rounded-xl border border-border">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          Último registro: <span className="font-bold text-foreground">{lastRegister}</span>
        </div>
      )}

      <div className="text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 opacity-70">
          <MapPin className="h-3 w-3" />
          Local: {authorizedLocation.name}
        </p>
      </div>
    </div>
  );
}
