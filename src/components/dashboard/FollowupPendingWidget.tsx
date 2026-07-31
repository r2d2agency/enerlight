import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Loader2, PackageSearch } from "lucide-react";
import { toast } from "sonner";

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

export function FollowupPendingWidget() {
  const qc = useQueryClient();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [text, setText] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["followup-pending-mine"],
    queryFn: () => api<{ pending: PendingOrder[] }>("/api/crm/goals/followup/pending-mine"),
    staleTime: 5 * 60 * 1000,
  });

  const pending = data?.pending || [];

  const submit = useMutation({
    mutationFn: (payload: { order_key: string; feedback: string }) =>
      api("/api/crm/goals/followup/feedback", { method: "POST", body: payload }),
    onSuccess: () => {
      toast.success("Feedback registrado");
      setOpenKey(null);
      setText("");
      qc.invalidateQueries({ queryKey: ["followup-pending-mine"] });
      qc.invalidateQueries({ queryKey: ["crm-followup-board-kanban"] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao enviar feedback"),
  });

  const clean = text.trim().replace(/\s+/g, " ");
  const valid = clean.length >= MIN_LEN && /[A-Za-zÀ-ÿ]{4,}/.test(clean);
  const total = pending.reduce((s, p) => s + Number(p.value || 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <PackageSearch className="h-4 w-4 text-amber-500" />
          Pedidos aguardando followup
          {pending.length > 0 && (
            <Badge variant="destructive" className="text-[10px] ml-auto">{pending.length}</Badge>
          )}
        </CardTitle>
        {pending.length > 0 && (
          <p className="text-xs text-muted-foreground">Total parado: {money(total)}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2 max-h-[320px] overflow-auto">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Nenhum pedido aguardando seu feedback hoje.
          </p>
        ) : (
          pending.map((p) => (
            <div key={p.order_key} className="rounded-lg border p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">#{p.number || p.order_key}</span>
                <div className="flex-1" />
                <span className="text-sm font-medium">{money(Number(p.value || 0))}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{p.client_name || "Sem cliente"}</p>
              <div className="flex flex-wrap gap-1">
                {p.followup && <Badge variant="secondary" className="text-[10px]">{p.followup}</Badge>}
                {p.city && <Badge variant="outline" className="text-[10px]">{p.city}/{p.state}</Badge>}
              </div>
              {p.last_feedback && (
                <p className="text-[11px] text-muted-foreground">Último: “{p.last_feedback}”</p>
              )}

              {openKey === p.order_key ? (
                <div className="space-y-1.5 pt-1">
                  <Textarea
                    autoFocus
                    rows={3}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Descreva o status atual (mínimo 10 caracteres)"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{clean.length}/{MIN_LEN}</span>
                    <div className="flex-1" />
                    <Button variant="ghost" size="sm" onClick={() => { setOpenKey(null); setText(""); }}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!valid || submit.isPending}
                      onClick={() => submit.mutate({ order_key: p.order_key, feedback: clean })}
                    >
                      {submit.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                      Enviar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setOpenKey(p.order_key); setText(""); }}
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-1 text-amber-500" />
                  Informar followup
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
