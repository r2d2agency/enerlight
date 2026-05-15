import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock,
  MapPin,
  MoreVertical,
  Calendar as CalendarIcon,
  Cake
} from "lucide-react";
import { useRh } from "@/hooks/use-rh";
import { useAuth } from "@/contexts/AuthContext";

import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function RhRegisters() {
  const { user } = useAuth();
  const { getEmployees } = useRh();

  const [employees, setEmployees] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getEmployees();
      setEmployees(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const birthdaysToday = employees.filter(emp => {
    if (!emp.birth_date) return false;
    const date = new Date(emp.birth_date);
    const today = new Date();
    return date.getDate() === today.getDate() && date.getMonth() === today.getMonth();
  });

  const birthdaysThisMonth = employees.filter(emp => {
    if (!emp.birth_date) return false;
    const date = new Date(emp.birth_date);
    return date.getMonth() === new Date().getMonth();
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Regular":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Regular</Badge>;
      case "Fora do Horário":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Fora do Horário</Badge>;
      case "Incompleto":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Incompleto</Badge>;
      default:
        return <Badge variant="outline">{status || "Regular"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Birthday Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-br from-pink-50 to-white border-pink-100 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-pink-100 flex items-center justify-center">
                <Cake className="h-6 w-6 text-pink-600" />
              </div>
              <div>
                <h3 className="font-bold text-pink-900">Aniversariantes de Hoje</h3>
                <p className="text-sm text-pink-700">
                  {birthdaysToday.length > 0 
                    ? birthdaysToday.map(e => e.name).join(", ") 
                    : "Nenhum aniversariante hoje."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <CalendarIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-blue-900">Aniversariantes do Mês</h3>
                <p className="text-sm text-blue-700">
                  {birthdaysThisMonth.length} colaboradores fazem aniversário em {format(new Date(), "MMMM", { locale: ptBR })}.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar colaborador..." 
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          {(user?.role === 'admin' || user?.role === 'owner') && (
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" /> Filtros
            </Button>
          )}
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>CPF</TableHead>
              <TableHead>Nascimento</TableHead>
              <TableHead>Último Registro</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.filter(e => e.name.toLowerCase().includes(searchTerm.toLowerCase())).map((emp) => (
              <TableRow key={emp.id}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell className="text-xs font-mono">{emp.cpf || "---"}</TableCell>
                <TableCell className="text-xs">
                  {emp.birth_date ? format(new Date(emp.birth_date), "dd/MM/yyyy") : "---"}
                </TableCell>
                <TableCell className="text-xs">---</TableCell>
                <TableCell>
                  {getStatusBadge("Regular")}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && employees.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nenhum registro encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
