import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Plus, MapPin, Trash2, Map as MapIcon } from "lucide-react";
import { useRh } from "@/hooks/use-rh";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

export default function RhLocations() {
  const { getLocations, createLocation, deleteLocation } = useRh();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    latitude: 0,
    longitude: 0,
    radius_meters: 100
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getLocations();
      setLocations(data);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || formData.latitude === 0 || formData.longitude === 0) {
      toast.error("Preencha todos os campos corretamente");
      return;
    }

    const success = await createLocation(formData);
    if (success) {
      toast.success("Local cadastrado com sucesso!");
      setIsDialogOpen(false);
      setFormData({ name: "", latitude: 0, longitude: 0, radius_meters: 100 });
      loadData();
    } else {
      toast.error("Erro ao cadastrar local");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja realmente excluir este local?")) return;
    
    const success = await deleteLocation(id);
    if (success) {
      toast.success("Local excluído!");
      loadData();
    } else {
      toast.error("Erro ao excluir local");
    }
  };

  const useCurrentLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setFormData({
          ...formData,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
        toast.success("Localização capturada!");
      }, (error) => {
        toast.error("Erro ao obter localização: " + error.message);
      });
    } else {
      toast.error("Geolocalização não suportada");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MapIcon className="h-5 w-5 text-primary" />
          Locais Autorizados
        </h2>
        <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Local
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome do Local</TableHead>
              <TableHead>Coordenadas</TableHead>
              <TableHead>Raio</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.length > 0 ? (
              locations.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell className="font-medium">{loc.name}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {loc.latitude}, {loc.longitude}
                  </TableCell>
                  <TableCell>{loc.radius_meters}m</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive"
                      onClick={() => handleDelete(loc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">
                  Nenhum local cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Local</DialogTitle>
            <DialogDescription>
              Defina um nome e as coordenadas para a área autorizada.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Local (ex: Obra Enerlight)</Label>
              <Input 
                id="name" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="Ex: Sede Central"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="lat">Latitude</Label>
                <Input 
                  id="lat" 
                  type="number" 
                  step="any"
                  value={formData.latitude} 
                  onChange={e => setFormData({...formData, latitude: parseFloat(e.target.value) || 0})} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="lng">Longitude</Label>
                <Input 
                  id="lng" 
                  type="number" 
                  step="any"
                  value={formData.longitude} 
                  onChange={e => setFormData({...formData, longitude: parseFloat(e.target.value) || 0})} 
                />
              </div>
            </div>

            <Button variant="outline" className="w-full gap-2" onClick={useCurrentLocation}>
              <MapPin className="h-4 w-4" /> Usar Minha Localização Atual
            </Button>

            <div className="grid gap-2">
              <div className="flex justify-between">
                <Label>Raio de Tolerância: {formData.radius_meters}m</Label>
              </div>
              <Slider 
                value={[formData.radius_meters]} 
                onValueChange={(val) => setFormData({...formData, radius_meters: val[0]})}
                max={1000}
                min={10}
                step={10}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Cadastrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
