import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Building2, Users, Briefcase } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useMapData, MapLocation } from "@/hooks/use-map-data";

// Fix Leaflet default marker icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

// Custom icons for different types
const createIcon = (color: string) =>
  new L.DivIcon({
    className: "custom-marker",
    html: `<div style="
      background-color: ${color};
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });

const ICONS = {
  deal: createIcon("#3b82f6"),     // Blue
  prospect: createIcon("#f97316"), // Orange
  company: createIcon("#22c55e"),  // Green
};

const TYPE_CONFIG = {
  deal: { label: "Negociações", color: "bg-blue-500", icon: Briefcase },
  prospect: { label: "Prospects", color: "bg-orange-500", icon: Users },
  company: { label: "Empresas", color: "bg-green-500", icon: Building2 },
};

export default function Mapa() {
  const { data: locations = [], isLoading } = useMapData();
  const [filters, setFilters] = useState({
    deal: true,
    prospect: true,
    company: true,
  });

  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => filters[loc.type]);
  }, [locations, filters]);

  const stats = useMemo(() => ({
    deal: locations.filter((l) => l.type === "deal").length,
    prospect: locations.filter((l) => l.type === "prospect").length,
    company: locations.filter((l) => l.type === "company").length,
  }), [locations]);

  const toggleFilter = (type: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // Center on Brazil
  const defaultCenter: [number, number] = [-14.235, -51.9253];
  const defaultZoom = 4;

  return (
    <MainLayout>
      <div className="space-y-4 h-[calc(100vh-8rem)]">
        {/* Header */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" />
              Mapa de Localização
            </h1>
            <p className="text-muted-foreground">
              Visualize seus leads, prospects e empresas no mapa
            </p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 h-full">
          {/* Sidebar Filters */}
          <Card className="lg:w-72 shrink-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Filtros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(Object.keys(TYPE_CONFIG) as Array<keyof typeof TYPE_CONFIG>).map((type) => {
                const config = TYPE_CONFIG[type];
                const Icon = config.icon;
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleFilter(type)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={filters[type]}
                        onCheckedChange={() => toggleFilter(type)}
                      />
                      <div className={`w-3 h-3 rounded-full ${config.color}`} />
                      <Label className="cursor-pointer flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {config.label}
                      </Label>
                    </div>
                    <Badge variant="secondary">{stats[type]}</Badge>
                  </div>
                );
              })}

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Total visível: <strong>{filteredLocations.length}</strong> de{" "}
                  <strong>{locations.length}</strong>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Map */}
          <Card className="flex-1 overflow-hidden">
            <CardContent className="p-0 h-full min-h-[500px]">
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Skeleton className="w-full h-full" />
                </div>
              ) : (
                <MapContainer
                  center={defaultCenter}
                  zoom={defaultZoom}
                  className="h-full w-full z-0"
                  style={{ minHeight: "500px" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {filteredLocations.map((location) => (
                    <Marker
                      key={`${location.type}-${location.id}`}
                      position={[location.lat, location.lng]}
                      icon={ICONS[location.type]}
                    >
                      <Popup>
                        <div className="min-w-[150px]">
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className={`w-2 h-2 rounded-full ${TYPE_CONFIG[location.type].color}`}
                            />
                            <span className="text-xs font-medium uppercase text-muted-foreground">
                              {TYPE_CONFIG[location.type].label}
                            </span>
                          </div>
                          <p className="font-semibold">{location.name}</p>
                          {location.phone && (
                            <p className="text-sm text-muted-foreground">{location.phone}</p>
                          )}
                          {(location.city || location.state) && (
                            <p className="text-sm text-muted-foreground">
                              {[location.city, location.state].filter(Boolean).join(", ")}
                            </p>
                          )}
                          {location.value !== undefined && location.value > 0 && (
                            <p className="text-sm font-medium text-primary mt-1">
                              R$ {location.value.toLocaleString("pt-BR")}
                            </p>
                          )}
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
