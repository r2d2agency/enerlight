import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight, Search, AlertTriangle, Loader2, Trophy, XCircle, User, Users, Handshake,
} from "lucide-react";
import { useRepresentativesHub, RepresentativeHubItem } from "@/hooks/use-representatives";
import { safeFormatDate } from "@/lib/utils";

type SortKey = "name" | "open_value" | "open_count" | "stale";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });

export default function RepresentativesHub() {
  const navigate = useNavigate();
  const { data: reps = [], isLoading } = useRepresentativesHub();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("open_value");
  const [filter, setFilter] = useState<"all" | "stale" | "active">("all");

  const items = useMemo(() => {
    let list = [...reps];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q) ||
          r.linked_user_name?.toLowerCase().includes(q)
      );
    }
    if (filter === "stale") list = list.filter((r) => r.stale_deals_count > 0);
    if (filter === "active") list = list.filter((r) => r.open_deals_count > 0);

    list.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "open_count":
          return b.open_deals_count - a.open_deals_count;
        case "stale":
          return b.stale_deals_count - a.stale_deals_count;
        case "open_value":
        default:
          return Number(b.open_deals_value || 0) - Number(a.open_deals_value || 0);
      }
    });
    return list;
  }, [reps, search, sort, filter]);

  const totals = useMemo(() => {
    return reps.reduce(
      (acc, r) => {
        acc.open += r.open_deals_count;
        acc.value += Number(r.open_deals_value || 0);
        acc.stale += r.stale_deals_count;
        return acc;
      },
      { open: 0, value: 0, stale: 0 }
    );
  }, [reps]);

  const openKanban = (rep: RepresentativeHubItem) => {
    navigate(`/crm/negociacoes?representative_id=${rep.id}`);
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        <div className="flex flex-col gap-3 p-3 lg:p-4 border-b">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h1 className="text-lg lg:text-2xl font-bold flex items-center gap-2">
                <Handshake className="h-6 w-6 text-primary" />
                Hub de Representantes
              </h1>
              <p className="text-sm text-muted-foreground">
                Acesse o Kanban de cada representante e gerencie negociações em lote.
              </p>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="text-right">
                <div className="text-muted-foreground">Representantes</div>
                <div className="font-bold">{reps.length}</div>
              </div>
              <div className="text-right">
                <div className="text-muted-foreground">Em pipe</div>
                <div className="font-bold">{totals.open} · {formatBRL(totals.value)}</div>
              </div>
              {totals.stale > 0 && (
                <div className="text-right">
                  <div className="text-muted-foreground">Parados +15d</div>
                  <div className="font-bold text-amber-600">{totals.stale}</div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar representante..."
                className="pl-8 w-[260px]"
              />
            </div>

            <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Com deals abertos</SelectItem>
                <SelectItem value="stale">Com deals parados +15d</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open_value">Maior valor em pipe</SelectItem>
                <SelectItem value="open_count">Mais negociações abertas</SelectItem>
                <SelectItem value="stale">Mais deals parados</SelectItem>
                <SelectItem value="name">Nome (A-Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 lg:p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              Nenhum representante encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((rep) => (
                <Card
                  key={rep.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => openKanban(rep)}
                >
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{rep.name}</h3>
                          {!rep.is_active && (
                            <Badge variant="secondary" className="text-[10px]">inativo</Badge>
                          )}
                        </div>
                        {rep.linked_user_name && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <User className="h-3 w-3" /> {rep.linked_user_name}
                          </p>
                        )}
                        {(rep.city || rep.state) && (
                          <p className="text-xs text-muted-foreground">
                            {[rep.city, rep.state].filter(Boolean).join(" / ")}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); openKanban(rep); }}
                      >
                        Abrir <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">Abertas</div>
                        <div className="font-semibold">{rep.open_deals_count}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Em pipe</div>
                        <div className="font-semibold">{formatBRL(Number(rep.open_deals_value || 0))}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Última atividade</div>
                        <div className="font-semibold text-xs">
                          {rep.last_activity_at ? safeFormatDate(rep.last_activity_at, "dd/MM") : "—"}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-xs flex-wrap">
                      <span className="flex items-center gap-1 text-green-600">
                        <Trophy className="h-3 w-3" /> {rep.won_deals_count} ganhos
                      </span>
                      <span className="flex items-center gap-1 text-red-500">
                        <XCircle className="h-3 w-3" /> {rep.lost_deals_count} perdidos
                      </span>
                      {rep.stale_deals_count > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          <AlertTriangle className="h-3 w-3" /> {rep.stale_deals_count} parados +15d
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
