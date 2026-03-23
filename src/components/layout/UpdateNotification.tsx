import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "@/components/ui/button";
import { RefreshCw, X } from "lucide-react";

export function UpdateNotification() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, r) {
      // Check for updates every 5 minutes
      if (r) {
        setInterval(() => {
          r.update();
        }, 5 * 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error("SW registration error", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] md:left-auto md:right-4 md:w-96 animate-slide-up">
      <div className="bg-card border border-primary/30 rounded-xl shadow-xl p-4 flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <RefreshCw className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Nova atualização disponível!</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Uma nova versão do sistema está pronta para ser instalada.
          </p>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={() => { updateServiceWorker(true).then(() => { window.location.reload(); }).catch(() => { window.location.reload(); }); }} className="h-8 text-xs">
              <RefreshCw className="h-3 w-3 mr-1" /> Atualizar agora
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)} className="h-8 text-xs">
              Depois
            </Button>
          </div>
        </div>
        <button onClick={() => setNeedRefresh(false)} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
