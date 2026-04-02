import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCRMCnaeGroups } from "@/hooks/use-crm";
import { FileText, ShoppingCart, Receipt, MapPin, Filter } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getCoordinates } from "@/hooks/use-map-data";

interface GoalsMapTabProps {
  startDate: string;
  endDate: string;
  filterUserId: string;
  filterChannel: string;
  filterGroupId: string;
}

interface RecordLocation {
  city: string;
  state: string;
  count: number;
  total_value: number;
  lat: number;
  lng: number;
  type: string;
}

const TYPE_COLORS: Record<string, string> = {
  orcamento: "#3b82f6",
  pedido: "#22c55e",
  faturamento: "#f59e0b",
};

const TYPE_LABELS: Record<string, string> = {
  orcamento: "Orçamentos",
  pedido: "Pedidos",
  faturamento: "Faturamento",
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 }).format(v);
}

function createCircleIcon(color: string, size: number) {
  const clamped = Math.max(20, Math.min(size, 60));
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      opacity: 0.75;
      width: ${clamped}px;
      height: ${clamped}px;
      border-radius: 50%;
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: ${Math.max(10, clamped / 3)}px;
      font-weight: 700;
    ">${size > 25 ? '' : ''}</div>`,
    iconSize: [clamped, clamped],
    iconAnchor: [clamped / 2, clamped / 2],
    popupAnchor: [0, -clamped / 2],
  });
}

function GoalsLeafletMap({ locations, color }: { locations: RecordLocation[]; color: string }) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    mapRef.current = L.map(containerRef.current).setView([-14.235, -51.9253], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapRef.current);
    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (locations.length === 0) return;

    const maxCount = Math.max(...locations.map((l) => l.count), 1);

    locations.forEach((loc) => {
      const size = 20 + (loc.count / maxCount) * 40;
      const icon = createCircleIcon(color, size);
      const marker = L.marker([loc.lat, loc.lng], { icon }).addTo(mapRef.current!);
      marker.bindPopup(`
        <div style="min-width: 160px;">
          <p style="font-weight: 700; margin: 0 0 4px;">${loc.city || loc.state}</p>
          ${loc.city && loc.state ? `<p style="font-size: 12px; color: #666; margin: 0 0 4px;">${loc.state}</p>` : ""}
          <p style="font-size: 14px; margin: 4px 0;"><strong>${loc.count}</strong> registros</p>
          <p style="font-size: 14px; color: ${color}; font-weight: 600; margin: 4px 0;">${fmt(loc.total_value)}</p>
        </div>
      `);
      markersRef.current.push(marker);
    });
  }, [locations, color]);

  return <div ref={containerRef} className="h-full w-full relative z-0" style={{ minHeight: "500px" }} />;
}

export function GoalsMapTab({ startDate, endDate, filterUserId, filterChannel, filterGroupId }: GoalsMapTabProps) {
  const [mapType, setMapType] = useState("pedido");
  const [selectedCnaeGroup, setSelectedCnaeGroup] = useState("all");
  const { data: cnaeGroups } = useCRMCnaeGroups();

  const { data: recordsData, isLoading } = useQuery({
    queryKey: ["crm-goals-map", startDate, endDate, filterUserId, filterChannel, filterGroupId, mapType, selectedCnaeGroup],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set("start_date", startDate);
      sp.set("end_date", endDate);
      sp.set("data_type", mapType);
      sp.set("page", "1");
      sp.set("limit", "5000");
      if (filterUserId !== "all") sp.set("user_id", filterUserId);
      if (filterChannel !== "all") sp.set("channel", filterChannel);
      if (filterGroupId !== "all") sp.set("group_id", filterGroupId);
      if (selectedCnaeGroup !== "all") sp.set("cnae_group_id", selectedCnaeGroup);
      return api<any>(`/api/crm/goals/data-records?${sp.toString()}`);
    },
  });

  const locations = useMemo(() => {
    const records = recordsData?.records || [];
    const grouped: Record<string, { city: string; state: string; count: number; total_value: number }> = {};

    records.forEach((r: any) => {
      const city = r.city || "";
      const state = r.state || "";
      if (!city && !state) return;
      const key = `${city.toLowerCase()}_${state.toLowerCase()}`;
      if (!grouped[key]) {
        grouped[key] = { city, state, count: 0, total_value: 0 };
      }
      grouped[key].count += 1;
      grouped[key].total_value += Number(r.value) || 0;
    });

    const result: RecordLocation[] = [];
    Object.values(grouped).forEach((g) => {
      const coords = getCoordinates(g.city, g.state);
      if (coords) {
        result.push({ ...g, ...coords, type: mapType });
      }
    });
    return result;
  }, [recordsData, mapType]);

  const totalRecords = locations.reduce((s, l) => s + l.count, 0);
  const totalValue = locations.reduce((s, l) => s + l.total_value, 0);
  const totalCities = locations.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={mapType} onValueChange={setMapType} className="w-auto">
            <TabsList>
              <TabsTrigger value="orcamento" className="gap-1"><FileText className="h-3 w-3" /> Orçamentos</TabsTrigger>
              <TabsTrigger value="pedido" className="gap-1"><ShoppingCart className="h-3 w-3" /> Pedidos</TabsTrigger>
              <TabsTrigger value="faturamento" className="gap-1"><Receipt className="h-3 w-3" /> Faturamento</TabsTrigger>
            </TabsList>
          </Tabs>

          {cnaeGroups && cnaeGroups.length > 0 && (
            <Select value={selectedCnaeGroup} onValueChange={setSelectedCnaeGroup}>
              <SelectTrigger className="w-[250px]">
                <div className="flex items-center gap-2 min-w-0">
                  <Filter className="h-4 w-4 shrink-0" />
                  <SelectValue placeholder="Todos os grupos CNAE" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os grupos CNAE</SelectItem>
                {cnaeGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: group.color }} />
                      <span className="truncate">{group.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Badge variant="outline" className="gap-1">
            <MapPin className="h-3 w-3" /> {totalCities} cidades
          </Badge>
          <Badge variant="outline">{totalRecords} registros</Badge>
          <Badge variant="secondary" className="font-semibold">{fmt(totalValue)}</Badge>
        </div>
      </div>

      <Card className="overflow-hidden" style={{ height: "calc(100vh - 20rem)" }}>
        <CardContent className="p-0 h-full">
          {isLoading ? (
            <div className="h-full flex items-center justify-center min-h-[400px]">
              <Skeleton className="w-full h-full" />
            </div>
          ) : locations.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
              <MapPin className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">Nenhuma localização encontrada</p>
              <p className="text-sm mt-2 max-w-md text-center">
                Os registros importados precisam ter cidade e/ou estado preenchidos para aparecerem no mapa.
              </p>
            </div>
          ) : (
            <GoalsLeafletMap locations={locations} color={TYPE_COLORS[mapType] || "#3b82f6"} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
