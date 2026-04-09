import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCRMCompaniesPaginated, CRMCompany } from "@/hooks/use-crm";
import { useCRMSegments } from "@/hooks/use-crm-config";
import { Search, Building2, Loader2, ChevronLeft, ChevronRight, Filter, Award, Phone, Mail } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useDebounce } from "@/hooks/use-debounce";

export default function Segmentacao() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [filterQualification, setFilterQualification] = useState<string>("");
  const [filterSegment, setFilterSegment] = useState<string>("");

  const { data: segments } = useCRMSegments();

  const { data: companiesResponse, isLoading, isFetching } = useCRMCompaniesPaginated({
    search: debouncedSearch || undefined,
    page,
    pageSize,
    qualification: filterQualification || undefined,
  });

  const allCompanies = companiesResponse?.items || [];
  // Client-side filter by segment (channel)
  const companies = filterSegment
    ? allCompanies.filter((c) => c.segment_id === filterSegment)
    : allCompanies;
  const total = filterSegment ? companies.length : (companiesResponse?.total || 0);
  const totalPages = Math.max(1, Math.ceil((companiesResponse?.total || 0) / pageSize));

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterQualification, filterSegment]);

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Segmentação</h1>
          <p className="text-muted-foreground">Filtre empresas por canal, qualificação e última negociação</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar empresas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Canal/Segmento Filter */}
          <Select value={filterSegment || "all"} onValueChange={(v) => setFilterSegment(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[200px]">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                <SelectValue placeholder="Canal/Segmento" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {segments?.map((seg) => (
                <SelectItem key={seg.id} value={seg.id}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                    {seg.name}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Qualification Filter */}
          <Select value={filterQualification || "all"} onValueChange={(v) => setFilterQualification(v === "all" ? "" : v)}>
            <SelectTrigger className="w-[180px]">
              <div className="flex items-center gap-2">
                <Award className="h-4 w-4" />
                <SelectValue placeholder="Qualificação" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="bronze">🥉 Bronze</SelectItem>
              <SelectItem value="prata">🥈 Prata</SelectItem>
              <SelectItem value="ouro">🥇 Ouro</SelectItem>
              <SelectItem value="platina">💎 Platina</SelectItem>
            </SelectContent>
          </Select>

          {isFetching && !isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !companies.length ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma empresa encontrada</h3>
                <p className="text-muted-foreground">Ajuste os filtros para ver resultados</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Qualificação</TableHead>
                    <TableHead>Canal/Segmento</TableHead>
                    <TableHead>Contato</TableHead>
                    <TableHead>Negociações</TableHead>
                    <TableHead>Últ. Negociação</TableHead>
                    <TableHead>Cidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{company.name}</p>
                            {company.cnpj && <p className="text-xs text-muted-foreground font-mono">{company.cnpj}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {company.qualification ? (
                          <Badge variant="outline" className={
                            company.qualification === 'platina' ? 'border-purple-400 text-purple-600' :
                            company.qualification === 'ouro' ? 'border-yellow-400 text-yellow-600' :
                            company.qualification === 'prata' ? 'border-gray-400 text-gray-500' :
                            'border-orange-400 text-orange-600'
                          }>
                            {company.qualification === 'platina' ? '💎' : company.qualification === 'ouro' ? '🥇' : company.qualification === 'prata' ? '🥈' : '🥉'}{' '}
                            {company.qualification.charAt(0).toUpperCase() + company.qualification.slice(1)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {company.segment_name ? (
                          <Badge variant="outline" style={{ borderColor: company.segment_color, color: company.segment_color }}>
                            <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: company.segment_color }} />
                            {company.segment_name}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          {company.phone && (
                            <div className="flex items-center gap-1 text-sm">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span>{company.phone}</span>
                            </div>
                          )}
                          {company.email && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span>{company.email}</span>
                            </div>
                          )}
                          {!company.phone && !company.email && "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{company.deals_count || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {company.last_deal_date ? format(parseISO(company.last_deal_date), "dd/MM/yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {company.city ? `${company.city}${company.state ? `, ${company.state}` : ""}` : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {total > 0 && (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {companies.length} empresas
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isFetching}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground min-w-[90px] text-center">
                Página {page} de {totalPages}
              </span>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching}>
                Próxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
