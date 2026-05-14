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
import { Plus, MapPin, Trash2, Map as MapIcon, Search, Loader2 } from "lucide-react";
import { useRh } from "@/hooks/use-rh";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

export default function RhLocations() {
  const { getLocations, createLocation, deleteLocation } = useRh();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchingCep, setSearchingCep] = useState(false);
  const [searchingCoords, setSearchingCoords] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    latitude: 0,
    longitude: 0,
    radius_meters: 100,
    cep: "",
    address: "",
    number: ""
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

    const { cep, address, number, ...payload } = formData;
    const success = await createLocation(payload);
    if (success) {
      toast.success("Local cadastrado com sucesso!");
      setIsDialogOpen(false);
      setFormData({ 
        name: "", 
        latitude: 0, 
        longitude: 0, 
        radius_meters: 100,
        cep: "",
        address: "",
        number: ""
      });
      loadData();
    } else {
      toast.error("Erro ao cadastrar local");
    }
  };

  const handleCepSearch = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length !== 8) {
      toast.error("CEP inválido");
      return;
    }

    setSearchingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }

      setFormData(prev => ({
        ...prev,
        address: `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`
      }));
    } catch (error) {
      toast.error("Erro ao buscar CEP");
    } finally {
      setSearchingCep(false);
    }
  };

  const handleGetCoords = async () => {
    if (!formData.address || !formData.number) {
      toast.error("Preencha o endereço (via CEP) e o número");
      return;
    }

    setSearchingCoords(true);
    try {
      // Split the address to extract city and state for a more precise search
      const addressParts = formData.address.split(',');
      const street = addressParts[0].trim();
      const cityState = addressParts[2]?.trim() || "";
      
      const searchQuery = `${street}, ${formData.number}, ${cityState}, Brazil`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'pt-BR'
        }
      });
      const data = await response.json();

      if (data && data.length > 0) {
        setFormData(prev => ({
          ...prev,
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        }));
        toast.success("Coordenadas obtidas!");
      } else {
        // Fallback: try search without the number if it failed
        const fallbackQuery = `${street}, ${cityState}, Brazil`;
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fallbackQuery)}&limit=1`;
        const fallbackResponse = await fetch(fallbackUrl);
        const fallbackData = await fallbackResponse.json();

        if (fallbackData && fallbackData.length > 0) {
          setFormData(prev => ({
            ...prev,
            latitude: parseFloat(fallbackData[0].lat),
            longitude: parseFloat(fallbackData[0].lon)
          }));
          toast.warning("Coordenadas obtidas para a rua (número não encontrado)");
        } else {
          toast.error("Não foi possível encontrar as coordenadas. Verifique o endereço ou preencha manualmente.");
        }
      }
    } catch (error) {
      toast.error("Erro ao buscar coordenadas");
    } finally {
      setSearchingCoords(false);
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Local</DialogTitle>
            <DialogDescription>
              Busque pelo CEP ou preencha as coordenadas manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Local</Label>
              <Input 
                id="name" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder="Ex: Sede Central ou Obra Enerlight"
              />
            </div>

            <div className="space-y-3 p-3 border rounded-md bg-muted/30">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Buscar por Endereço</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input 
                    placeholder="CEP" 
                    value={formData.cep}
                    onChange={e => setFormData({...formData, cep: e.target.value})}
                    maxLength={9}
                  />
                </div>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  onClick={handleCepSearch}
                  disabled={searchingCep}
                >
                  {searchingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {formData.address && (
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground italic px-1">
                    {formData.address}
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Número" 
                      value={formData.number}
                      onChange={e => setFormData({...formData, number: e.target.value})}
                      className="w-24"
                    />
                    <Button 
                      variant="outline" 
                      className="flex-1 gap-2" 
                      onClick={handleGetCoords}
                      disabled={searchingCoords}
                    >
                      {searchingCoords ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                      Obter Coordenadas
                    </Button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2">
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

            <Button variant="ghost" className="w-full gap-2 text-xs" onClick={useCurrentLocation}>
              <MapPin className="h-3 w-3" /> Usar Minha Localização Atual
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
