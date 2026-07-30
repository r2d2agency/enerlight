import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const MIN_LEN = 10;

interface PendingOrder {
  order_key: string;
  number?: string;
  client_name?: string;
  value?: number;
  followup?: string;
  city?: string;
  state?: string;
  last_feedback?: string | null;
}

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export function DailyFollowupGate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);

  const { data } = useQuery({
    queryKey: ["followup-pending-mine"],
    queryFn: () => api<{ pending: PendingOrder[] }>("/api/crm/goals/followup/pending-mine"),
    enabled: !!user,
    refetchInterval: 15 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const pending = useMemo(() => data?.pending || [], [data]);
  const current = pending[Math.min(index, Math.max(pending.length - 1, 0))];

  useEffect(() => { setText(""); }, [current?.order_key]);
  useEffect(() => { if (index >= pending.length) setIndex(0); }, [pending.length, index]);

  const submit = useMutation({
    mutationFn: (payload: { order_key: string; feedback: string }) =>
      api("/api/crm/goals/followup/feedback", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["followup-pending-mine"] });
      qc.invalidateQueries({ queryKey: ["crm-followup-board-kanban"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao enviar feedback"),
  });

  if (!user || pending.length === 0 || !current) return null;

  const clean = text.trim().replace(/\s+/g, " ");
  const valid = clean.length >= MIN_LEN && /[A-Za-zÀ-ÿ]{4,}/.test(clean);
  const done = Math.max(0, index);

  return (
    <Dialog open>
      <DialogContent
        className="max-w-lg [&>button]:hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        aria-describedby="daily-followup-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Pedidos aguardando sua informação
          </DialogTitle>
          <DialogDescription id="daily-followup-desc">
            A fábrica está com {pending.length} pedido(s) parados aguardando seu feedback. Preencha o status atual
            de cada um para continuar usando o sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Progress value={(done / pending.length) * 100} className="h-1.5" />

          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">#{current.number || current.order_key}</span>
              <div className="flex-1" />
              <span className="text-sm font-medium">{money(Number(current.value || 0))}</span>
            </div>
            <p className="text-xs text-muted-foreground">{current.client_name || "Sem cliente"}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {current.followup && <Badge variant="secondary" className="text-[10px]">{current.followup}</Badge>}
              {current.city && <Badge variant="outline" className="text-[10px]">{current.city}/{current.state}</Badge>}
            </div>
            {current.last_feedback && (
              <p className="text-[11px] text-muted-foreground pt-1">
                Último feedback: “{current.last_feedback}”
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Textarea
              autoFocus
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Descreva o status atual deste pedido (mínimo 10 caracteres)"
            />
            <p className="text-[11px] text-muted-foreground">
              {clean.length}/{MIN_LEN} caracteres — escreva uma explicação real, não apenas letras soltas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {pending.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIndex((i) => (i + 1) % pending.length)}
              >
                Próximo pedido
              </Button>
            )}
            <div className="flex-1" />
            <Button
              disabled={!valid || submit.isPending}
              onClick={() => submit.mutate({ order_key: current.order_key, feedback: clean })}
            >
              {submit.isPending
                ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                : <CheckCircle2 className="h-4 w-4 mr-1" />}
              Enviar feedback
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
