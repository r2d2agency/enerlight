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
  XCircle
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import FacialValidation from "../FacialValidation";

interface Employee {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  role: string;
  facial_registered: boolean;
  is_active: boolean;
  journey: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
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
    user_id: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // In a real app, these would be API calls
      // For now, we simulate fetching employees from the org members or a dedicated table
      const orgId = localStorage.getItem('selected_org_id');
      if (orgId) {
        const members = await api<any[]>(`/api/organizations/${orgId}/members`);
        
        // Map members to employee format
        const mappedEmployees: Employee[] = members.map(m => ({
          id: m.id,
          user_id: m.user_id,
          name: m.name,
          email: m.email,
          role: m.role,
          facial_registered: Math.random() > 0.5, // Mocking facial registration status
          is_active: m.is_active,
          journey: "08:00 - 12:00 | 13:00 - 17:00"
        }));
        
        setEmployees(mappedEmployees);
        setAvailableUsers(members.filter(m => !m.employee_id).map(m => ({
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
      // Simulate API call to create employee
      const newEmployee: Employee = {
        id: Math.random().toString(36).substr(2, 9),
        user_id: formData.user_id || null,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        facial_registered: false,
        is_active: true,
        journey: formData.journey
      };

      setEmployees([...employees, newEmployee]);
      setIsAddDialogOpen(false);
      setFormData({ name: "", email: "", role: "", journey: "08:00 - 12:00 | 13:00 - 17:00", user_id: "" });
      toast.success("Colaborador cadastrado!");
    } catch (err) {
      toast.error("Erro ao cadastrar colaborador");
    }
  };

  const handleLinkUser = async () => {
    if (!selectedEmployee || !formData.user_id) return;

    try {
      const updatedEmployees = employees.map(emp => 
        emp.id === selectedEmployee.id 
          ? { ...emp, user_id: formData.user_id } 
          : emp
      );
      setEmployees(updatedEmployees);
      setIsLinkDialogOpen(false);
      toast.success("Usuário vinculado com sucesso!");
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
      toast.success(`Face de ${selectedEmployee.name} cadastrada!`);
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
        <div className="flex gap-2 w-full md:w-auto">
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
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
                      <ShieldCheck className="h-3 w-3" /> Vinculado
                    </Badge>
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
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="text-destructive">
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
            <DialogTitle>Cadastrar Novo Colaborador</DialogTitle>
            <DialogDescription>
              Adicione os dados do novo colaborador da Enerlight.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <div className="grid gap-2">
              <Label htmlFor="role">Cargo / Função</Label>
              <Input 
                id="role" 
                value={formData.role} 
                onChange={e => setFormData({...formData, role: e.target.value})} 
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="journey">Jornada de Trabalho</Label>
              <Input 
                id="journey" 
                value={formData.journey} 
                onChange={e => setFormData({...formData, journey: e.target.value})} 
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddEmployee}>Cadastrar</Button>
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
            <Select onValueChange={(val) => setFormData({...formData, user_id: val})}>
              <SelectTrigger id="user-select">
                <SelectValue placeholder="Selecione um usuário..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.map(u => (
                  <SelectItem key={u.id} value={u.id}>{u.name} ({u.email})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-2">
              Apenas usuários da organização que ainda não são colaboradores estão listados.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLinkDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleLinkUser}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Facial Registration Dialog */}
      {isFacialDialogOpen && (
        <FacialValidation 
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
