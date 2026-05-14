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
  SelectValue 
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
  MapPin
} from "lucide-react";
import { api } from "@/lib/api";
import { useRh } from "@/hooks/use-rh";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FacialValidation from "../FacialValidation";

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
  const { getEmployees, updateMember, createMember, getLocations } = useRh();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sensitivity, setSensitivity] = useState(0.5);
  const [showManualCoords, setShowManualCoords] = useState(false);
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isFacialDialogOpen, setIsFacialDialogOpen] = useState(false);
  
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "",
    journey: "08:00 - 12:00 | 13:00 - 17:00",
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const members = await getEmployees();
      
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
      
      // Filter for users that aren't already mapped as employees if we wanted unique pool
      // For now, let's just use all organization members
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
      toast.error("Erro ao carregar colaboradores");
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
            name: "", email: "", role: "", journey: "08:00 - 12:00 | 13:00 - 17:00", user_id: "",
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
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </Button>
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
                    <div className="flex items-center gap-1 text-green-600 text-xs">
                      <CheckCircle2 className="h-4 w-4" />
                      Cadastrado
                    </div>
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
                    onClick={() => {
                      setSelectedEmployee(emp);
                      setFormData({
                        name: emp.name,
                        email: emp.email,
                        role: emp.role,
                        user_id: emp.user_id,
                        cpf: emp.cpf || "",
                        birth_date: emp.birth_date ? new Date(emp.birth_date).toISOString().split('T')[0] : "",
                        work_start_time: emp.work_start_time || "08:00",
                        work_end_time: emp.work_end_time || "18:00",
                        lunch_start_time: emp.lunch_start_time || "12:00",
                        lunch_end_time: emp.lunch_end_time || "13:00",
                        authorized_radius_meters: emp.authorized_radius_meters || 100,
                        authorized_latitude: emp.authorized_latitude || 0,
                        authorized_longitude: emp.authorized_longitude || 0,
                        journey: emp.journey
                      });
                      setIsAddDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive h-8 w-8">
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
                  <div className="flex justify-between items-center">
                    <Label htmlFor="radius">Raio de Tolerância (metros)</Label>
                    <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{(formData as any).authorized_radius_meters || 100}m</span>
                  </div>
                  <Slider 
                    id="radius"
                    value={[(formData as any).authorized_radius_meters || 100]} 
                    onValueChange={(val) => setFormData({...formData, authorized_radius_meters: val[0]} as any)} 
                    max={500} 
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

      {/* Facial Registration Dialog */}
      {isFacialDialogOpen && (
        <FacialValidation 
          mode="register"
          sensitivity={sensitivity}
          onValidated={handleFacialValidation} 
          onCancel={() => setIsFacialDialogOpen(false)} 
        />
      )}
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
