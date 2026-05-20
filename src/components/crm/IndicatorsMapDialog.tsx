import { useEffect, useRef, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Representative, IndicatorType } from "@/hooks/use-representatives";
import { getCoordinatesAsync } from "@/hooks/use-map-data";

interface IndicatorsMapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicators: Representative[];
}

const TYPE_COLORS: Record<IndicatorType, string> = {
  parceiro: "#3b82f6",
  representante: "#a855f7",
  indicador: "#10b981",
  instalador: "#f97316",
};

const TYPE_LABELS: Record<IndicatorType, string> = {
  parceiro: "Parceiro",
  representante: "Representante",
  indicador: "Indicador",
  instalador: "Instalador",
};

const createIcon = (color: string) =>
  L.divIcon({
    className: "custom-marker",
    html: `<div style="background-color:${color};width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  });

export function IndicatorsMapDialog({ open, onOpenChange, indicators }: IndicatorsMapDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.Layer[]>([]);
  const [located, setLocated] = useState<Array<Representative & { lat: number; lng: number }>>([]);
  const [loading, setLoading] = useState(false);

  // Geocode indicators when open changes or list changes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const results: Array<Representative & { lat: number; lng: number }> = [];
      for (const ind of indicators) {
        if (!ind.city && !ind.state) continue;
        const coords = await getCoordinatesAsync(ind.city, ind.state);
        if (coords && !cancelled) {
          results.push({ ...ind, lat: coords.lat, lng: coords.lng });
        }
      }
      if (!cancelled) {
        setLocated(results);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, indicators]);

  // Init map when dialog opens
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      if (!containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([-14.235, -51.9253], 4);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);
      setTimeout(() => map.invalidateSize(), 100);
    }, 50);
    return () => {
      clearTimeout(t);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        layersRef.current = [];
      }
    };
  }, [open]);

  // Draw markers
  useEffect(() => {
    if (!mapRef.current) return;
    layersRef.current.forEach(l => l.remove());
    layersRef.current = [];

    const bounds: L.LatLngTuple[] = [];
    located.forEach(ind => {
      const type = (ind.indicator_type || "representante") as IndicatorType;
      const color = TYPE_COLORS[type] || "#6b7280";
      const marker = L.marker([ind.lat, ind.lng], { icon: createIcon(color) }).addTo(mapRef.current!);
      const popup = `
        <div style="min-width:160px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
            <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
            <span style="font-size:11px;font-weight:600;text-transform:uppercase;color:#666;">${TYPE_LABELS[type]}</span>
          </div>
          <p style="font-weight:600;margin:0;">${ind.name}</p>
          ${ind.source ? `<p style="font-size:12px;color:#666;margin:4px 0;">Origem: ${ind.source}</p>` : ""}
          ${ind.linked_user_name ? `<p style="font-size:12px;color:#8b5cf6;margin:4px 0;">👤 ${ind.linked_user_name}</p>` : ""}
          ${(ind.city || ind.state) ? `<p style="font-size:12px;color:#666;margin:4px 0;">${[ind.city, ind.state].filter(Boolean).join(", ")}</p>` : ""}
          ${ind.phone ? `<p style="font-size:12px;color:#666;margin:4px 0;">${ind.phone}</p>` : ""}
        </div>
      `;
      marker.bindPopup(popup);
      layersRef.current.push(marker);
      bounds.push([ind.lat, ind.lng]);
    });

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
    }
  }, [located]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    located.forEach(i => {
      const t = i.indicator_type || "representante";
      c[t] = (c[t] || 0) + 1;
    });
    return c;
  }, [located]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] flex flex-col p-0 gap-0" aria-describedby="indicators-map-desc">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Mapa de Indicadores
          </DialogTitle>
          <DialogDescription id="indicators-map-desc" className="flex flex-wrap gap-2 items-center pt-1">
            {loading ? (
              <span className="flex items-center gap-1.5 text-xs">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Localizando indicadores...
              </span>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">{located.length} de {indicators.length} localizados</span>
                {(Object.keys(TYPE_LABELS) as IndicatorType[]).map(t => (
                  <Badge key={t} variant="outline" className="text-[10px] gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLORS[t] }} />
                    {TYPE_LABELS[t]} ({counts[t] || 0})
                  </Badge>
                ))}
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 relative bg-muted">
          <div ref={containerRef} className="absolute inset-0 z-0" />
          {!loading && located.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground z-10 pointer-events-none">
              <MapPin className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">Nenhum indicador com cidade/estado para exibir</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
