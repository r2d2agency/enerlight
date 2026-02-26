import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CompanyDialog } from "@/components/crm/CompanyDialog";
import { CompanyImportDialog } from "@/components/crm/CompanyImportDialog";
import { BulkCNPJUpdateDialog } from "@/components/crm/BulkCNPJUpdateDialog";
import { DealFormDialog } from "@/components/crm/DealFormDialog";
import { useCRMCompaniesPaginated, useCRMCompanyMutations, useCRMFunnels, CRMCompany, CRMFunnel } from "@/hooks/use-crm";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, MoreHorizontal, Building2, Phone, Mail, Trash2, Edit, Loader2, FileSpreadsheet, Briefcase, Database, ChevronLeft, ChevronRight } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";

export default function CRMEmpresas() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [bulkCNPJOpen, setBulkCNPJOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CRMCompany | null>(null);
  const [funnelPickerOpen, setFunnelPickerOpen] = useState(false);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [selectedFunnel, setSelectedFunnel] = useState<CRMFunnel | null>(null);
  const [selectedCompanyForDeal, setSelectedCompanyForDeal] = useState<CRMCompany | null>(null);

  const { data: companiesResponse, isLoading, isFetching } = useCRMCompaniesPaginated({
    search: debouncedSearch || undefined,
    page,
    pageSize,
  });
  const companies = companiesResponse?.items || [];
  const total = companiesResponse?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const { data: funnels } = useCRMFunnels();
  const { deleteCompany, importCompanies } = useCRMCompanyMutations();
  const { user } = useAuth();
  const isAdmin = user?.role === 'owner' || user?.role === 'admin';

  const handleEdit = (company: CRMCompany) => {
    setEditingCompany(company);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingCompany(null);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Tem certeza que deseja excluir esta empresa?")) {
      deleteCompany.mutate(id);
    }
  };

  const handleCreateDeal = (company: CRMCompany) => {
    setSelectedCompanyForDeal(company);
    if (funnels?.length === 1) {
      setSelectedFunnel(funnels[0]);
      setDealDialogOpen(true);
    } else {
      setFunnelPickerOpen(true);
    }
  };

  const handleFunnelSelected = (funnel: CRMFunnel) => {
    setSelectedFunnel(funnel);
    setFunnelPickerOpen(false);
    setDealDialogOpen(true);
  };

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Empresas</h1>
            <p className="text-muted-foreground">Gerencie sua base de empresas</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => setBulkCNPJOpen(true)}>
                <Database className="h-4 w-4 mr-2" />
                Atualizar CNPJs
              </Button>
            )}
            <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Importar Excel
            </Button>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Empresa
          </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Atualizando...
            </div>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !companies?.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma empresa cadastrada</h3>
                <p className="text-muted-foreground mb-4">
                  Adicione empresas para vincular às suas negociações
                </p>
                <Button onClick={handleNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Empresa
                </Button>
              </div>
            ) : (
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[28%]">Empresa</TableHead>
                    <TableHead className="w-[13%]">Segmento</TableHead>
                    <TableHead className="w-[14%]">CNPJ</TableHead>
                    <TableHead className="w-[15%]">Contato</TableHead>
                    <TableHead className="w-[10%]">Negociações</TableHead>
                    <TableHead className="w-[12%]">Criado em</TableHead>
                    <TableHead className="w-[8%] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id} className="cursor-pointer" onClick={() => handleEdit(company)}>
                      <TableCell className="max-w-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate" title={company.name}>{company.name}</p>
                            {company.city && (
                              <p className="text-sm text-muted-foreground truncate">
                                {company.city}{company.state ? `, ${company.state}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.segment_name ? (
                          <Badge 
                            variant="outline" 
                            className="flex items-center gap-1 w-fit"
                            style={{ 
                              borderColor: company.segment_color,
                              color: company.segment_color 
                            }}
                          >
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: company.segment_color }} 
                            />
                            <span className="truncate">{company.segment_name}</span>
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm truncate block">
                          {company.cnpj || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 min-w-0">
                          {company.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate">{company.phone}</span>
                            </div>
                          )}
                          {company.email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{company.email}</span>
                            </div>
                          )}
                          {!company.phone && !company.email && "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {company.deals_count || 0}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {company.created_at ? format(parseISO(company.created_at), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(company)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateDeal(company)}>
                              <Briefcase className="h-4 w-4 mr-2" />
                              Criar Negociação
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDelete(company.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total} empresas
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground min-w-[90px] text-center">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isFetching}
              >
                Próxima
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <CompanyDialog
        company={editingCompany}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />

      <CompanyImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImport={async (companies) => {
          await importCompanies.mutateAsync(companies);
        }}
      />

      <BulkCNPJUpdateDialog
        open={bulkCNPJOpen}
        onOpenChange={setBulkCNPJOpen}
      />

      {/* Funnel Picker Dialog */}
      <Dialog open={funnelPickerOpen} onOpenChange={setFunnelPickerOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Selecione o Funil</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {funnels?.map((funnel) => (
              <Button
                key={funnel.id}
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleFunnelSelected(funnel)}
              >
                <Briefcase className="h-4 w-4 mr-2" />
                {funnel.name}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Deal Form Dialog */}
      <DealFormDialog
        funnel={selectedFunnel}
        open={dealDialogOpen}
        onOpenChange={(open) => {
          setDealDialogOpen(open);
          if (!open) setSelectedCompanyForDeal(null);
        }}
        defaultCompanyId={selectedCompanyForDeal?.id}
      />
    </MainLayout>
  );
}
