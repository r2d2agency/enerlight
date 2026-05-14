import { useState } from "react";
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
import { 
  Search, 
  Filter, 
  Download, 
  CheckCircle2, 
  XCircle, 
  Clock,
  MapPin,
  MoreVertical
} from "lucide-react";

const mockRegisters: any[] = []; // Iniciar vazio para evitar mocks visualmente poluentes

export default function RhRegisters() {
  const [searchTerm, setSearchTerm] = useState("");

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Regular":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Regular</Badge>;
      case "Fora do Horário":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Fora do Horário</Badge>;
      case "Incompleto":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Incompleto</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
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
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Colaborador</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Almoço</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Facial</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockRegisters.map((reg) => (
              <TableRow key={reg.id}>
                <TableCell className="font-medium">
                  <div>
                    {reg.employee}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-normal">
                      <MapPin className="h-2 w-2" /> {reg.location}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{reg.date}</TableCell>
                <TableCell>{reg.entry}</TableCell>
                <TableCell>{reg.lunch_out}</TableCell>
                <TableCell>{reg.lunch_in}</TableCell>
                <TableCell>{reg.exit}</TableCell>
                <TableCell>{getStatusBadge(reg.status)}</TableCell>
                <TableCell>
                  {reg.facial === "OK" ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
