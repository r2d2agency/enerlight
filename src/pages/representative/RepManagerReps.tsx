import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Users, 
  Search, 
  Filter, 
  UserX, 
  UserCheck, 
  Shield, 
  MapPin, 
  Mail, 
  Phone,
  BarChart3
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function RepManagerReps() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const queryClient = useQueryClient();

  const { data: representatives, isLoading } = useQuery({
    queryKey: ["admin-reps", search, statusFilter],
    queryFn: () => api<any[]>(`/api/representatives/admin/list?search=${search}&status=${statusFilter}`)
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ repId, active }: { repId: string, active: boolean }) => 
      api(`/api/representatives/admin/reps/${repId}/status`, { 
        method: 'PATCH',
        body: { active }
      }),
    onSuccess: () => {
      toast.success("Status atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["admin-reps"] });
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestão de Representantes</h1>
          <p className="text-muted-foreground">Gerencie acessos, permissões e visualize a performance da equipe externa.</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Buscar por nome, e-mail ou região..." 
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os Status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Bloqueados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/40">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Representante</TableHead>
                <TableHead>Região</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Carregando representantes...
                  </TableCell>
                </TableRow>
              ) : representatives?.map((rep) => (
                <TableRow key={rep.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                        {rep.name?.charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium">{rep.name}</div>
                        <div className="text-xs text-muted-foreground">{rep.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm">
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {rep.region || "Não definida"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{rep.commission_percentage || 0}%</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={rep.is_active ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}>
                      {rep.is_active ? "Ativo" : "Bloqueado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Editar Permissões" onClick={() => toast.info("Edição de permissões em breve")}>
                        <Shield className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className={rep.is_active ? "text-destructive" : "text-green-500"}
                        onClick={() => toggleStatusMutation.mutate({ repId: rep.id, active: !rep.is_active })}
                      >
                        {rep.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
