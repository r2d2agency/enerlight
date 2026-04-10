import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useThemedBranding } from "@/hooks/use-branding";
import { Clock, Sun, Sunset, Moon, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { API_URL } from "@/lib/api";
import { MessageNotifications } from "./MessageNotifications";
import { CRMAlerts } from "./CRMAlerts";
import { ConnectionStatusIndicator } from "./ConnectionStatusIndicator";

function getGreeting(hour: number): { text: string; icon: typeof Sun } {
  if (hour >= 5 && hour < 12) {
    return { text: "Bom dia", icon: Sun };
  } else if (hour >= 12 && hour < 18) {
    return { text: "Boa tarde", icon: Sunset };
  } else {
    return { text: "Boa noite", icon: Moon };
  }
}

const SP_TIMEZONE = "America/Sao_Paulo";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TIMEZONE,
  day: "2-digit",
  month: "long",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: SP_TIMEZONE,
  hour: "2-digit",
  hour12: false,
});

export function TopBar() {
  const { user } = useAuth();
  const { branding } = useThemedBranding();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const syncServerTime = async () => {
      // Tenta backend primeiro
      if (API_URL) {
        try {
          const response = await fetch(`${API_URL}/health`);
          if (response.ok) {
            const data = await response.json();
            const serverTimestamp = new Date(data?.timestamp).getTime();
            if (isMounted && Number.isFinite(serverTimestamp)) {
              setServerOffsetMs(serverTimestamp - Date.now());
              return;
            }
          }
        } catch {
          // fallback abaixo
        }
      }

      // Fallback: usa relógio local
    };

    syncServerTime();
    const syncTimer = setInterval(syncServerTime, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(syncTimer);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date(Date.now() + serverOffsetMs));
    }, 1000);

    return () => clearInterval(timer);
  }, [serverOffsetMs]);

  const currentHour = Number.parseInt(hourFormatter.format(currentTime), 10);
  const greeting = getGreeting(Number.isNaN(currentHour) ? 12 : currentHour);
  const GreetingIcon = greeting.icon;
  const firstName = user?.name?.split(" ")[0] || "Usuário";
  const formattedDate = dateFormatter.format(currentTime);
  const formattedTime = timeFormatter.format(currentTime);

  return (
    <div className="hidden lg:flex fixed top-0 right-0 left-16 h-14 items-center justify-between gap-4 px-6 bg-background/80 backdrop-blur-sm border-b border-border/50 z-40">
      {/* Company Name/Logo - Left Side */}
      <div className="flex items-center gap-3">
        {branding.logo_topbar ? (
          <img 
            src={branding.logo_topbar} 
            alt="Logo" 
            className="h-8 w-8 object-contain rounded"
          />
        ) : (
          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
        )}
        {branding.company_name && (
          <span className="text-base font-semibold text-foreground">
            {branding.company_name}
          </span>
        )}
      </div>

      {/* Right Side Controls */}
      <div className="flex items-center gap-4">
        {/* Connection Status Indicator */}
        <ConnectionStatusIndicator />

        {/* Divider */}
        <div className="h-6 w-px bg-border" />

        {/* Message Notifications */}
        <MessageNotifications />

        {/* CRM Lead Alerts */}
        <CRMAlerts />

        {/* Divider */}
        <div className="h-6 w-px bg-border" />

      {/* Date and Time */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span className="font-medium">
          {formattedDate}
        </span>
        <span className="text-primary font-semibold">
          {formattedTime}
        </span>
      </div>

      {/* Divider */}
      <div className="h-6 w-px bg-border" />

      {/* Greeting */}
      <div className="flex items-center gap-2">
        <GreetingIcon className={cn(
          "h-5 w-5",
          greeting.text === "Bom dia" && "text-yellow-500",
          greeting.text === "Boa tarde" && "text-orange-500",
          greeting.text === "Boa noite" && "text-indigo-400"
        )} />
        <span className="text-sm">
        <span className="text-muted-foreground">{greeting.text},</span>
          <span className="font-semibold text-foreground ml-1">{firstName}</span>
        </span>
        </div>
      </div>
    </div>
  );
}
