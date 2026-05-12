import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Clock, 
  MapPin, 
  Camera, 
  User, 
  Play, 
  Coffee, 
  LogOut, 
  AlertCircle,
  CheckCircle2,
  XCircle,
  History
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function MyPoint() {
  const [now, setNow] = useState(new Date());
  const [gpsStatus, setGpsStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  const [lastRegister, setLastRegister] = useState<string | null>(null);
  const [dailyStatus, setDailyStatus] = useState<'idle' | 'working' | 'break' | 'finished'>('idle');
  const [location, setLocation] = useState<string>("Sede Enerlight");
  
  // Simulated stats
  const employeeName = "João Silva";
  const employeeRole = "Consultor Técnico";
  const journey = "08:00 - 12:00 | 13:00 - 17:00";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    
    // Check GPS
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        () => setGpsStatus('active'),
        () => setGpsStatus('inactive')
      );
    } else {
      setGpsStatus('inactive');
    }

    return () => clearInterval(timer);
  }, []);

  const handleRegister = (type: string) => {
    toast.info(`Registrando ${type}...`);
    // Validation logic will go here
    setLastRegister(`${type} - ${now.toLocaleTimeString()}`);
    
    if (type === "Entrada") setDailyStatus('working');
    if (type === "Almoço") setDailyStatus('break');
    if (type === "Volta") setDailyStatus('working');
    if (type === "Saída") setDailyStatus('finished');
  };

  return (
    <div className="container max-w-lg mx-auto p-4 space-y-6 pb-20">
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
            <AlertCircle className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Status</span>
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
            className="h-24 flex flex-col gap-2 rounded-2xl"
            disabled={dailyStatus !== 'idle'}
            onClick={() => handleRegister("Entrada")}
          >
            <Play className="h-6 w-6" />
            <span>Entrada</span>
          </Button>
          <Button 
            size="lg" 
            variant="secondary"
            className="h-24 flex flex-col gap-2 rounded-2xl"
            disabled={dailyStatus !== 'working'}
            onClick={() => handleRegister("Almoço")}
          >
            <Coffee className="h-6 w-6" />
            <span>Almoço</span>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Button 
            size="lg" 
            variant="secondary"
            className="h-24 flex flex-col gap-2 rounded-2xl"
            disabled={dailyStatus !== 'break'}
            onClick={() => handleRegister("Volta")}
          >
            <History className="h-6 w-6" />
            <span>Volta</span>
          </Button>
          <Button 
            size="lg" 
            variant="destructive"
            className="h-24 flex flex-col gap-2 rounded-2xl"
            disabled={dailyStatus !== 'working'}
            onClick={() => handleRegister("Saída")}
          >
            <LogOut className="h-6 w-6" />
            <span>Saída</span>
          </Button>
        </div>
        
        <Button variant="outline" className="w-full">
          Solicitar Hora Extra
        </Button>
      </div>

      {lastRegister && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted p-3 rounded-lg">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          Último registro: <span className="font-semibold text-foreground">{lastRegister}</span>
        </div>
      )}

      <div className="text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <MapPin className="h-3 w-3" />
          {location}
        </p>
      </div>
    </div>
  );
}
