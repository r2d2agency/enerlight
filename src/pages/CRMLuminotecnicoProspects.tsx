import { useState, useMemo } from "react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowRight,
  Building2,
  Check,
  FileSpreadsheet,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
  Calendar,
  MapPin,
  Mail,
  Phone,
} from "lucide-react";
import { useProspects, Prospect } from "@/hooks/use-prospects";
import { useCRMFunnels } from "@/hooks/use-crm";
import { useCRMOrgMembers } from "@/hooks/use-sales-positions";
import { useAuth } from "@/contexts/AuthContext";

export default function CRMLuminotecnicoProspects() {
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertingProspect, setConvertingProspect] = useState<Prospect | null>(null);
  
  const { prospects, isLoading, deleteProspect, convertToDeal } = useProspects();
  const { data: funnels } = useCRMFunnels();
  const { data: orgMembers = [] } = useCRMOrgMembers();
  const { user } = useAuth();
  const canSelectSeller = ['owner', 'admin', 'manager', 'supervisor'].includes(user?.role || '');

  // Convert form
  const [convertForm, setConvertForm] = useState({ 
    funnel_id: "", 
    title: "",
    create_company: false,
    company_name: "",
    owner_id: ""
  });

  const luminotecnicoProspects = useMemo(() => {
    // Filter by specific sources related to lighting calculator
    return prospects.filter(p => 
      p.source === "Calculadora Luminotécnica" || 
      p.source === "Landing Page"
    );
  }, [prospects]);

  const filteredProspects = useMemo(() => {
    let filtered = luminotecnicoProspects;

    if (search.trim()) {
      const term = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.name?.toLowerCase().includes(term) ||
        p.phone?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.company?.toLowerCase().includes(term) ||
        p.city?.toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [luminotecnicoProspects, search]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredProspects.map(p => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este prospect?")) return;
    await deleteProspect.mutateAsync(id);
  };

  const openConvertDialog = (prospect: Prospect) => {
    setConvertingProspect(prospect);
    setConvertForm({ 
      funnel_id: funnels?.[0]?.id || "", 
      title: `Projeto: ${prospect.name}`,
      create_company: !!prospect.company || prospect.is_company || false,
      company_name: prospect.company || (prospect.is_company ? prospect.name : ""),
      owner_id: ""
    });
    setShowConvertDialog(true);
  };

  const handleConvert = async () => {
    if (!convertingProspect || !convertForm.funnel_id) {
      toast.error("Selecione um funil");
      return;
    }
    await convertToDeal.mutateAsync({
      prospect_id: convertingProspect.id,
      funnel_id: convertForm.funnel_id,
      title: convertForm.title || convertingProspect.name,
      create_company: convertForm.create_company,
      company_name: convertForm.company_name.trim() || undefined,
      owner_id: convertForm.owner_id || undefined,
    });
    setShowConvertDialog(false);
    setConvertingProspect(null);
  };

  return (
    <MainLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">Prospects Luminotécnico</h1>
          <p className="text-muted-foreground">
            Leads qualificados vindos da Calculadora e Landing Page.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Leads
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{luminotecnicoProspects.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {luminotecnicoProspects.filter(p => !p.converted_at).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Convertidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {luminotecnicoProspects.filter(p => p.converted_at).length}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, empresa, cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredProspects.length > 0 && selectedIds.length === filteredProspects.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Lead / Empresa</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Registro</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredProspects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <div className="flex flex-col items-center gap-2">
                        <Users className="h-8 w-8 text-muted-foreground" />
                        <p className="text-muted-foreground">Nenhum lead encontrado</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProspects.map((prospect) => (
                    <TableRow key={prospect.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(prospect.id)}
                          onCheckedChange={(checked) => handleSelect(prospect.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{prospect.name}</span>
                          {prospect.company && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {prospect.company}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {prospect.phone}
                          </span>
                          {prospect.email && (
                            <span className="text-sm flex items-center gap-1 text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {prospect.email}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {prospect.city || prospect.state ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {[prospect.city, prospect.state].filter(Boolean).join(", ")}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {prospect.source || "Geral"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {prospect.converted_at ? (
                          <Badge className="bg-green-600">
                            <Check className="h-3 w-3 mr-1" />
                            Negociação
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(prospect.created_at), "dd/MM/yyyy")}
                          </span>
                          <span>{format(new Date(prospect.created_at), "HH:mm")}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!prospect.converted_at && (
                              <DropdownMenuItem onClick={() => openConvertDialog(prospect)}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Converter para Negociação
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleDelete(prospect.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Convert to Deal Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover para Kanban de Negociação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg border">
              <div className="flex items-center gap-2">
                <strong className="text-sm">{convertingProspect?.name}</strong>
                {convertingProspect?.company && (
                  <Badge variant="outline" className="border-blue-500 text-blue-600 text-xs">
                    <Building2 className="h-3 w-3 mr-1" />
                    Empresa
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{convertingProspect?.phone}</p>
            </div>
            
            <div className="space-y-2">
              <Label>Selecione o Kanban (Funil) *</Label>
              <select
                className="w-full p-2 border rounded-md bg-background"
                value={convertForm.funnel_id}
                onChange={(e) => setConvertForm(f => ({ ...f, funnel_id: e.target.value }))}
              >
                <option value="">Selecione um funil</option>
                {funnels?.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deal-title">Título da Negociação</Label>
              <Input
                id="deal-title"
                value={convertForm.title}
                onChange={(e) => setConvertForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Projeto Residencial"
              />
            </div>
            
            {canSelectSeller && (
            <div className="space-y-2">
              <Label>Responsável pela Negociação</Label>
              <select
                className="w-full p-2 border rounded-md bg-background text-sm"
                value={convertForm.owner_id}
                onChange={(e) => setConvertForm(f => ({ ...f, owner_id: e.target.value }))}
              >
                <option value="">Automático / Atribuído ao Prospect</option>
                {orgMembers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            )}

            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="create_company"
                  checked={convertForm.create_company}
                  onCheckedChange={(checked) => setConvertForm(f => ({ 
                    ...f, 
                    create_company: checked as boolean,
                    company_name: checked ? (f.company_name || convertingProspect?.company || convertingProspect?.name || "") : ""
                  }))}
                />
                <Label htmlFor="create_company" className="text-sm cursor-pointer">
                  Vincular/Criar empresa no CRM
                </Label>
              </div>
              
              {convertForm.create_company && (
                <div className="space-y-2 ml-6">
                  <Label htmlFor="company_name">Nome da Empresa</Label>
                  <Input
                    id="company_name"
                    value={convertForm.company_name}
                    onChange={(e) => setConvertForm(f => ({ ...f, company_name: e.target.value }))}
                    placeholder="Nome da empresa"
                  />
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={handleConvert} disabled={convertToDeal.isPending}>
                {convertToDeal.isPending ? "Processando..." : "Transformar em Negociação"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
