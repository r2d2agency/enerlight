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
import { Slider } from "@/components/ui/slider";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue,
  SelectGroup,
  SelectLabel
} from "@/components/ui/select";
import { 
  Plus, 
  UserPlus, 
  ShieldCheck, 
  Camera, 
  Trash2, 
  Search, 
  User as UserIcon,
  CheckCircle2,
  XCircle,
  Settings2,
  Pencil,
  MapPin,
  Loader2
} from "lucide-react";
import { api } from "@/lib/api";
import { useRh } from "@/hooks/use-rh";
import { useAuth } from "@/contexts/AuthContext";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FacialValidation from "../FacialValidation";
import EmployeeRhDialog from "./EmployeeRhDialog";
import { listJourneys, assignJourney, getAssignedJourney, WEEKDAYS } from "@/lib/rh-journeys";

interface Employee {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  facial_registered: boolean;
  is_active: boolean;
  journey: string;
  cpf?: string;
  birth_date?: string;
  work_start_time?: string;
  work_end_time?: string;
  lunch_start_time?: string;
  lunch_end_time?: string;
  authorized_radius_meters?: number;
  authorized_latitude?: number;
  authorized_longitude?: number;
}

interface User {
  id: string;
  name: string;
  email: string;
}

export default function EmployeeManagement() {
  const { user } = useAuth();
  const { getEmployees, updateMember, createMember, getLocations, createLocation } = useRh();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sensitivity, setSensitivity] = useState(0.5);
  const [showManualCoords, setShowManualCoords] = useState(false);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isFacialDialogOpen, setIsFacialDialogOpen] = useState(false);
  const [isRhDialogOpen, setIsRhDialogOpen] = useState(false);
  
  
  // New Location state
  const [newLocation, setNewLocation] = useState({
    name: "",
    cep: "",
    address: "",
    number: "",
    latitude: 0,
    longitude: 0,
    radius_meters: 100
  });
  const [searchingCep, setSearchingCep] = useState(false);
  const [searchingCoords, setSearchingCoords] = useState(false);
  
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    journey: "08:00 - 12:00 | 13:00 - 17:00",
    journey_id: "" as string,
    user_id: "",
    cpf: "",
    birth_date: "",
    work_start_time: "08:00",
    work_end_time: "18:00",
    lunch_start_time: "12:00",
    lunch_end_time: "13:00",
    authorized_radius_meters: 100,
    authorized_latitude: 0,
    authorized_longitude: 0
  });
  const journeys = listJourneys();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [members, locs] = await Promise.all([
        getEmployees(),
        getLocations()
      ]);
      
      setLocations(locs || []);
      
      const mappedEmployees: Employee[] = members.map(m => {
        const journeyStr = m.work_start_time && m.work_end_time 
          ? `${m.work_start_time.substring(0, 5)} - ${m.work_end_time.substring(0, 5)}`
          : "08:00 - 18:00";
          
        return {
          id: m.id,
          user_id: m.user_id,
          name: m.name,
          email: m.email,
          role: m.role || "Colaborador",
          facial_registered: localStorage.getItem(`facial_reg_${m.user_id}`) === 'true',
          is_active: m.is_active !== false,
          journey: journeyStr,
          cpf: m.cpf,
          birth_date: m.birth_date,
          work_start_time: m.work_start_time,
          work_end_time: m.work_end_time,
          lunch_start_time: m.lunch_start_time,
          lunch_end_time: m.lunch_end_time,
          authorized_radius_meters: m.authorized_radius_meters || 100,
          authorized_latitude: m.authorized_latitude,
          authorized_longitude: m.authorized_longitude
        };
      });
      
      setEmployees(mappedEmployees);
      
      const orgs = await api<any[]>('/api/organizations');
      const orgId = orgs[0]?.id;
      if (orgId) {
        const usersResponse = await api<any[]>(`/api/organizations/${orgId}/members`);
        setAvailableUsers(usersResponse.map(m => ({
          id: m.user_id,
          name: m.name,
          email: m.email
        })));
      }
    } catch (err) {
      toast.error("Erro ao carregar dados do RH");
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async () => {
    if (!formData.name || !formData.email) {
      toast.error("Preencha nome e email");
      return;
    }

    try {
      if (selectedEmployee) {
        // Update existing member
        const success = await updateMember(selectedEmployee.user_id, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          cpf: formData.cpf,
          birth_date: formData.birth_date,
          work_start_time: formData.work_start_time,
          work_end_time: formData.work_end_time,
          lunch_start_time: formData.lunch_start_time,
          lunch_end_time: formData.lunch_end_time,
          authorized_radius_meters: formData.authorized_radius_meters,
          authorized_latitude: formData.authorized_latitude,
          authorized_longitude: formData.authorized_longitude
        });

        if (success) {
          toast.success("Colaborador atualizado!");
          setIsAddDialogOpen(false);
          setSelectedEmployee(null);
          loadData();
        }
      } else {
        // Create new member
        const success = await createMember({
          name: formData.name,
          email: formData.email,
          role: formData.role || "agent",
          password: "changeme123",
          cpf: formData.cpf,
          birth_date: formData.birth_date,
          work_start_time: formData.work_start_time,
          work_end_time: formData.work_end_time,
          lunch_start_time: formData.lunch_start_time,
          lunch_end_time: formData.lunch_end_time,
          authorized_radius_meters: formData.authorized_radius_meters,
          authorized_latitude: formData.authorized_latitude,
          authorized_longitude: formData.authorized_longitude
        });

        if (success) {
          toast.success("Colaborador cadastrado!");
          setIsAddDialogOpen(false);
          setFormData({ 
            name: "", email: "", role: "", journey: "08:00 - 12:00 | 13:00 - 17:00", journey_id: "", user_id: "",
            cpf: "", birth_date: "", work_start_time: "08:00", work_end_time: "18:00", 
            lunch_start_time: "12:00", lunch_end_time: "13:00",
            authorized_radius_meters: 100, authorized_latitude: 0, authorized_longitude: 0
          });
          loadData();
        }
      }
    } catch (err) {
      toast.error(selectedEmployee ? "Erro ao atualizar colaborador" : "Erro ao cadastrar colaborador");
    }
  };

  const handleCepSearch = async () => {
    const cep = newLocation.cep.replace(/\D/g, '');
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

      setNewLocation(prev => ({
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
    if (!newLocation.address || !newLocation.number) {
      toast.error("Preencha o endereço (via CEP) e o número");
      return;
    }

    setSearchingCoords(true);
    try {
      const addressParts = newLocation.address.split(',');
      const street = addressParts[0].trim();
      const cityState = addressParts[2]?.trim() || "";
      
      const searchQuery = `${street}, ${newLocation.number}, ${cityState}, Brazil`;
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`;
      
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'pt-BR' }
      });
      const data = await response.json();

      if (data && data.length > 0) {
        setNewLocation(prev => ({
          ...prev,
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon)
        }));
        toast.success("Coordenadas obtidas!");
      } else {
        toast.error("Não foi possível encontrar as coordenadas.");
      }
    } catch (error) {
      toast.error("Erro ao buscar coordenadas");
    } finally {
      setSearchingCoords(false);
    }
  };

  const handleQuickLocationSave = async () => {
    if (!newLocation.name || newLocation.latitude === 0 || newLocation.longitude === 0) {
      toast.error("Nome e coordenadas são obrigatórios");
      return;
    }

    const { cep, address, number, ...payload } = newLocation;
    const success = await createLocation(payload);
    if (success) {
      toast.success("Local cadastrado com sucesso!");
      setIsLocationDialogOpen(false);
      setNewLocation({
        name: "", cep: "", address: "", number: "",
        latitude: 0, longitude: 0, radius_meters: 100
      });
      // Refresh locations
      const locs = await getLocations();
      setLocations(locs || []);
    } else {
      toast.error("Erro ao cadastrar local");
    }
  };

  const handleLinkUser = async () => {
    if (!selectedEmployee || !formData.user_id) return;

    try {
      const success = await updateMember(formData.user_id, { 
        role: selectedEmployee.role 
      });

      if (success) {
        const selectedUser = availableUsers.find(u => u.id === formData.user_id);
        
        const updatedEmployees = employees.map(emp => 
          emp.id === selectedEmployee.id 
            ? { 
                ...emp, 
                user_id: formData.user_id,
                name: selectedUser?.name || emp.name,
                email: selectedUser?.email || emp.email
              } 
            : emp
        );
        setEmployees(updatedEmployees);
        setIsLinkDialogOpen(false);
        toast.success(`Usuário vinculado com sucesso!`);
        loadData();
      }
    } catch (err) {
      toast.error("Erro ao vincular usuário");
    }
  };

  const handleFacialValidation = (success: boolean) => {
    setIsFacialDialogOpen(false);
    if (success && selectedEmployee) {
      const updatedEmployees = employees.map(emp => 
        emp.id === selectedEmployee.id 
          ? { ...emp, facial_registered: true } 
          : emp
      );
      setEmployees(updatedEmployees);
      
      // Save registration state (simulated)
      localStorage.setItem(`facial_reg_${selectedEmployee.user_id || selectedEmployee.id}`, 'true');
      
      toast.success(`Face de ${selectedEmployee.name} cadastrada com sucesso!`);
    }
    setSelectedEmployee(null);
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome ou email..." 
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto items-center">
          <div className="hidden lg:flex items-center gap-2 mr-4 bg-muted/50 px-3 py-1.5 rounded-lg border border-border">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Sensibilidade Facial</Label>
              <div className="flex items-center gap-2 min-w-[120px]">
                <Slider 
                  value={[sensitivity * 100]} 
                  onValueChange={(val) => setSensitivity(val[0] / 100)} 
                  max={100} 
                  step={1}
                  className="w-24"
                />
                <span className="text-xs font-mono w-8 text-right">{(sensitivity * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Colaborador
            </Button>
          )}
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Usuário Vinculado</TableHead>
              <TableHead>Jornada</TableHead>
              <TableHead>Facial</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEmployees.map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      {emp.name}
                      <p className="text-[10px] text-muted-foreground font-normal">{emp.role}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{emp.email}</TableCell>
                <TableCell>
                  {emp.user_id ? (
                    <div className="flex flex-col gap-1">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
                        <ShieldCheck className="h-3 w-3" /> Vinculado
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-[10px] h-6 text-muted-foreground hover:text-primary"
                        onClick={() => {
                          setSelectedEmployee(emp);
                          setIsLinkDialogOpen(true);
                        }}
                      >
                        Alterar Vínculo
                      </Button>
                    </div>
                  ) : (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs text-muted-foreground hover:text-primary"
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setIsLinkDialogOpen(true);
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1" /> Vincular
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-xs">{emp.journey}</TableCell>
                <TableCell>
                  {emp.facial_registered ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7 gap-1 text-green-600 hover:text-green-700"
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setIsFacialDialogOpen(true);
                      }}
                      title="Face cadastrada — clique para recadastrar"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Recadastrar
                    </Button>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-7 gap-1"
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setIsFacialDialogOpen(true);
                      }}
                    >
                      <Camera className="h-3.5 w-3.5" /> Cadastrar
                    </Button>
                  )}
                </TableCell>
                 <TableCell className="text-right flex gap-1 justify-end">
                   <Button
                     variant="ghost"
                     size="icon"
                     className="h-8 w-8"
                     title="Ver RH do colaborador"
                     onClick={() => {
                       setSelectedEmployee(emp);
                       setIsRhDialogOpen(true);
                     }}
                   >
                     <UserIcon className="h-4 w-4" />
                   </Button>
                   {(user?.role === 'admin' || user?.role === 'owner') && (
                     <>
                       <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8"
                         onClick={() => {
                           setSelectedEmployee(emp);
                           const assigned = getAssignedJourney(emp.user_id);
                           setFormData({
                             name: emp.name,
                             email: emp.email,
                             role: emp.role,
                             user_id: emp.user_id,
                             cpf: emp.cpf || "",
                             birth_date: emp.birth_date ? new Date(emp.birth_date).toISOString().split('T')[0] : "",
                             work_start_time: emp.work_start_time || assigned?.workStart || "08:00",
                             work_end_time: emp.work_end_time || assigned?.workEnd || "18:00",
                             lunch_start_time: emp.lunch_start_time || assigned?.lunchStart || "12:00",
                             lunch_end_time: emp.lunch_end_time || assigned?.lunchEnd || "13:00",
                             authorized_radius_meters: emp.authorized_radius_meters || 100,
                             authorized_latitude: emp.authorized_latitude || 0,
                             authorized_longitude: emp.authorized_longitude || 0,
                             journey: emp.journey,
                             journey_id: assigned?.id || ""
                           });
                           setIsAddDialogOpen(true);
                         }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {filteredEmployees.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nenhum colaborador encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEmployee ? "Editar Colaborador" : "Cadastrar Novo Colaborador"}</DialogTitle>
            <DialogDescription>
              {selectedEmployee ? "Atualize os dados do colaborador." : "Adicione os dados do novo colaborador da Enerlight."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Nome Completo</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email"
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input 
                  id="cpf" 
                  placeholder="000.000.000-00"
                  value={formData.cpf} 
                  onChange={e => setFormData({...formData, cpf: e.target.value})} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="birth_date">Data de Nascimento</Label>
                <Input 
                  id="birth_date" 
                  type="date"
                  value={formData.birth_date} 
                  onChange={e => setFormData({...formData, birth_date: e.target.value})} 
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="role">Cargo / Função</Label>
              <Input 
                id="role" 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})} 
              />
            </div>

            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-semibold mb-3">Horários de Trabalho</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="work_start">Entrada</Label>
                  <Input 
                    id="work_start" 
                    type="time"
                    value={formData.work_start_time} 
                    onChange={e => setFormData({...formData, work_start_time: e.target.value})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="work_end">Saída</Label>
                  <Input 
                    id="work_end" 
                    type="time"
                    value={formData.work_end_time} 
                    onChange={e => setFormData({...formData, work_end_time: e.target.value})} 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="grid gap-2">
                  <Label htmlFor="lunch_start">Início Almoço</Label>
                  <Input 
                    id="lunch_start" 
                    type="time"
                    value={formData.lunch_start_time} 
                    onChange={e => setFormData({...formData, lunch_start_time: e.target.value})} 
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="lunch_end">Fim Almoço</Label>
                  <Input 
                    id="lunch_end" 
                    type="time"
                    value={formData.lunch_end_time} 
                    onChange={e => setFormData({...formData, lunch_end_time: e.target.value})} 
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-primary" />
                <h4 className="text-sm font-semibold">Localização Autorizada</h4>
              </div>
              
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <div className="flex justify-between items-center mb-1">
                    <Label htmlFor="location-select">Selecione o Local (Obras/Sedes)</Label>
                    <Button 
                      variant="link" 
                      className="h-auto p-0 text-[10px] text-primary"
                      onClick={() => setIsLocationDialogOpen(true)}
                    >
                      + Cadastrar Novo Local
                    </Button>
                  </div>
                  <Select 
                    onValueChange={(val) => {
                      const loc = locations.find(l => l.id === val);
                      if (loc) {
                        setFormData({
                          ...formData,
                          authorized_latitude: loc.latitude,
                          authorized_longitude: loc.longitude,
                          authorized_radius_meters: loc.radius_meters
                        } as any);
                        toast.success(`Local "${loc.name}" selecionado`);
                      }
                    }}
                  >
                    <SelectTrigger id="location-select" className="w-full">
                      <SelectValue placeholder="Escolha um local cadastrado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.length > 0 ? (
                        locations.map(loc => (
                          <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="no-locations" disabled>Nenhum local cadastrado no RH</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Selecione um local pré-cadastrado ou clique acima para criar um novo.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    type="button"
                    className="text-xs h-7 text-primary"
                    onClick={() => setShowManualCoords(!showManualCoords)}
                  >
                    {showManualCoords ? "Ocultar Coordenadas" : "Preencher Coordenadas Manualmente"}
                  </Button>
                </div>

                {showManualCoords && (
                  <div className="space-y-4 pt-2 border-t border-dashed">
                    <div className="grid gap-2">
                      <div className="flex justify-between items-center">
                        <Label htmlFor="radius">Raio de Tolerância (metros)</Label>
                        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{(formData as any).authorized_radius_meters || 100}m</span>
                      </div>
                      <Slider 
                        id="radius"
                        value={[(formData as any).authorized_radius_meters || 100]} 
                        onValueChange={(val) => setFormData({...formData, authorized_radius_meters: val[0]} as any)} 
                        max={1000} 
                        min={10}
                        step={10}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="lat">Latitude</Label>
                        <Input 
                          id="lat" 
                          type="number"
                          step="any"
                          placeholder="-23.5505"
                          value={(formData as any).authorized_latitude || ""} 
                          onChange={e => setFormData({...formData, authorized_latitude: parseFloat(e.target.value) || 0} as any)} 
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="lng">Longitude</Label>
                        <Input 
                          id="lng" 
                          type="number"
                          step="any"
                          placeholder="-46.6333"
                          value={(formData as any).authorized_longitude || ""} 
                          onChange={e => setFormData({...formData, authorized_longitude: parseFloat(e.target.value) || 0} as any)} 
                        />
                      </div>
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full gap-2"
                      type="button"
                      onClick={() => {
                        if ("geolocation" in navigator) {
                          navigator.geolocation.getCurrentPosition((position) => {
                            setFormData({
                              ...formData,
                              authorized_latitude: position.coords.latitude,
                              authorized_longitude: position.coords.longitude
                            } as any);
                            toast.success("Coordenadas atuais obtidas!");
                          }, (error) => {
                            toast.error("Erro ao obter localização: " + error.message);
                          });
                        } else {
                          toast.error("Geolocalização não suportada no navegador");
                        }
                      }}
                    >
                      <MapPin className="h-3.5 w-3.5" /> Usar Minha Localização Atual
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddEmployee}>{selectedEmployee ? "Salvar Alterações" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Link User Dialog */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular Usuário do Sistema</DialogTitle>
            <DialogDescription>
              Conecte o colaborador "{selectedEmployee?.name}" a um usuário existente no portal.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="user-select">Selecione o Usuário</Label>
            <Select onValueChange={(val) => setFormData({...formData, user_id: val})} value={formData.user_id}>
              <SelectTrigger id="user-select" className="w-full">
                <SelectValue placeholder="Selecione um usuário..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length > 0 ? (
                  availableUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-users" disabled>Nenhum usuário disponível</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-2">
              Apenas usuários da organização que ainda não são colaboradores estão listados.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleLinkUser} disabled={!formData.user_id}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Location Dialog */}
      <Dialog open={isLocationDialogOpen} onOpenChange={setIsLocationDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Local</DialogTitle>
            <DialogDescription>
              Busque pelo CEP ou preencha as coordenadas manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto px-1">
            <div className="grid gap-2">
              <Label htmlFor="new-loc-name">Nome do Local</Label>
              <Input 
                id="new-loc-name" 
                value={newLocation.name}
                onChange={e => setNewLocation({...newLocation, name: e.target.value})}
                placeholder="Ex: Obra Centro ou Filial Norte"
              />
            </div>

            <div className="space-y-3 p-3 border rounded-md bg-muted/30">
              <Label className="text-xs font-semibold uppercase text-muted-foreground">Buscar por Endereço</Label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input 
                    placeholder="CEP" 
                    value={newLocation.cep}
                    onChange={e => setNewLocation({...newLocation, cep: e.target.value})}
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

              {newLocation.address && (
                <div className="grid gap-2">
                  <div className="text-xs text-muted-foreground italic px-1">
                    {newLocation.address}
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      placeholder="Número" 
                      value={newLocation.number}
                      onChange={e => setNewLocation({...newLocation, number: e.target.value})}
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
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="new-lat">Latitude</Label>
                <Input 
                  id="new-lat" 
                  type="number" 
                  step="any"
                  value={newLocation.latitude || ""} 
                  onChange={e => setNewLocation({...newLocation, latitude: parseFloat(e.target.value) || 0})} 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="new-lng">Longitude</Label>
                <Input 
                  id="new-lng" 
                  type="number" 
                  step="any"
                  value={newLocation.longitude || ""} 
                  onChange={e => setNewLocation({...newLocation, longitude: parseFloat(e.target.value) || 0})} 
                />
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex justify-between">
                <Label>Raio de Tolerância: {newLocation.radius_meters}m</Label>
              </div>
              <Slider 
                value={[newLocation.radius_meters]} 
                onValueChange={(val) => setNewLocation({...newLocation, radius_meters: val[0]})}
                max={1000}
                min={10}
                step={10}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLocationDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleQuickLocationSave}>Cadastrar Local</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facial Registration Dialog */}
      {isFacialDialogOpen && selectedEmployee && (
        <FacialValidation 
          mode="register"
          sensitivity={sensitivity}
          targetId={selectedEmployee.user_id || selectedEmployee.id}
          onValidated={handleFacialValidation} 
          onCancel={() => setIsFacialDialogOpen(false)} 
        />
      )}

      <EmployeeRhDialog
        open={isRhDialogOpen}
        onOpenChange={(o) => { setIsRhDialogOpen(o); if (!o) setSelectedEmployee(null); }}
        employee={selectedEmployee}
      />
    </div>
  );
}

// Simple Badge component since it's used
function Badge({ children, variant = "outline", className = "" }: any) {
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
      variant === "outline" ? "bg-background text-foreground" : "bg-primary text-primary-foreground",
      className
    )}>
      {children}
    </span>
  );
}
