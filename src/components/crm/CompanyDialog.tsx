import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CRMCompany, useCRMCompanyMutations } from "@/hooks/use-crm";
import { useCRMSegments } from "@/hooks/use-crm-config";
import { useContacts, Contact, ContactList } from "@/hooks/use-contacts";
import { Tag, User, Plus, Trash2, Phone, Search, Check, UserPlus, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface CNPJData {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  capital_social: string;
  natureza: string;
  data_abertura: string;
  socios: { nome: string; qualificacao: string; data_entrada: string }[];
}

interface CompanyContact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  role?: string;
  is_primary?: boolean;
}

interface CompanyDialogProps {
  company: CRMCompany | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyDialog({ company, open, onOpenChange }: CompanyDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    cnpj: "",
    email: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    notes: "",
    segment_id: "",
  });

  const [contacts, setContacts] = useState<CompanyContact[]>([]);
  const [newContact, setNewContact] = useState({ name: "", phone: "", email: "", role: "" });
  const [contactMode, setContactMode] = useState<"new" | "existing">("new");
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [listContacts, setListContacts] = useState<Contact[]>([]);
  const [searchContact, setSearchContact] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [loadingCNPJ, setLoadingCNPJ] = useState(false);
  const [cnpjData, setCnpjData] = useState<CNPJData | null>(null);

  const { createCompany, updateCompany } = useCRMCompanyMutations();
  const { data: segments } = useCRMSegments();
  const contactsApi = useContacts();

  // Load contact lists on mount
  useEffect(() => {
    contactsApi.getLists().then(setContactLists).catch(console.error);
  }, []);

  // Load contacts when list is selected
  useEffect(() => {
    if (selectedListId) {
      contactsApi.getContacts(selectedListId).then(setListContacts).catch(console.error);
    }
  }, [selectedListId]);

  useEffect(() => {
    if (company) {
      setFormData({
        name: company.name || "",
        cnpj: company.cnpj || "",
        email: company.email || "",
        phone: company.phone || "",
        website: company.website || "",
        address: company.address || "",
        city: company.city || "",
        state: company.state || "",
        zip_code: company.zip_code || "",
        notes: company.notes || "",
        segment_id: company.segment_id || "",
      });
      // TODO: Load existing contacts from API
      setContacts([]);
      setCnpjData(null);
    } else {
      setFormData({
        name: "",
        cnpj: "",
        email: "",
        phone: "",
        website: "",
        address: "",
        city: "",
        state: "",
        zip_code: "",
        notes: "",
        segment_id: "",
      });
      setContacts([]);
      setCnpjData(null);
    }
  }, [company, open]);

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleCNPJLookup = async () => {
    const digits = formData.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return;
    }
    setLoadingCNPJ(true);
    setCnpjData(null);
    try {
      const data = await api<CNPJData>(`/api/cnpj/lookup/${digits}`);
      setCnpjData(data);
      // Auto-fill form fields
      setFormData((prev) => ({
        ...prev,
        name: prev.name || data.nome_fantasia || data.razao_social || prev.name,
        phone: prev.phone || data.telefone || prev.phone,
        email: prev.email || data.email || prev.email,
        address: prev.address || [data.logradouro, data.numero].filter(Boolean).join(", ") || prev.address,
        city: prev.city || data.municipio || prev.city,
        state: prev.state || data.uf || prev.state,
        zip_code: prev.zip_code || data.cep || prev.zip_code,
        notes: prev.notes || buildCNPJNotes(data),
      }));
      toast.success("Dados do CNPJ preenchidos!");
    } catch {
      toast.error("Erro ao consultar CNPJ. Verifique e tente novamente.");
    } finally {
      setLoadingCNPJ(false);
    }
  };

  const buildCNPJNotes = (data: CNPJData) => {
    const parts: string[] = [];
    if (data.razao_social) parts.push(`Razão Social: ${data.razao_social}`);
    if (data.capital_social) parts.push(`Capital Social: R$ ${Number(data.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    if (data.natureza) parts.push(`Natureza Jurídica: ${data.natureza}`);
    if (data.data_abertura) parts.push(`Data Abertura: ${data.data_abertura}`);
    if (data.socios?.length) {
      parts.push("", "=== SÓCIOS ===");
      data.socios.forEach((s, i) => {
        parts.push(`${i + 1}. ${s.nome} - ${s.qualificacao}${s.data_entrada ? ` (desde ${s.data_entrada})` : ""}`);
      });
    }
    return parts.join("\n");
  };

  const handleAddContact = () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) return;
    
    setContacts((prev) => [
      ...prev,
      {
        ...newContact,
        id: crypto.randomUUID(),
        is_primary: prev.length === 0, // First contact is primary
      },
    ]);
    setNewContact({ name: "", phone: "", email: "", role: "" });
  };

  const handleRemoveContact = (id: string) => {
    setContacts((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      // If we removed the primary, make first one primary
      if (filtered.length > 0 && !filtered.some((c) => c.is_primary)) {
        filtered[0].is_primary = true;
      }
      return filtered;
    });
  };

  const handleSetPrimary = (id: string) => {
    setContacts((prev) =>
      prev.map((c) => ({ ...c, is_primary: c.id === id }))
    );
  };

  const handleSave = () => {
    const data = {
      ...formData,
      segment_id: formData.segment_id || undefined,
      contacts: contacts.length > 0 ? contacts : undefined,
    };
    if (company) {
      updateCompany.mutate({ id: company.id, ...data } as any);
    } else {
      createCompany.mutate(data as any);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" aria-describedby={undefined}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{company ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto" style={{ maxHeight: "calc(90vh - 160px)" }}>
          <div className="space-y-4 p-1 pr-4">
            <div className="space-y-2">
              <Label>Nome da empresa *</Label>
              <Input
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Nome da empresa"
              />
            </div>

            {/* Segmento */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Segmento
              </Label>
              <Select
                value={formData.segment_id || "none"}
                onValueChange={(value) => handleChange("segment_id", value === "none" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um segmento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {segments?.map((segment) => (
                    <SelectItem key={segment.id} value={segment.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: segment.color }}
                        />
                        {segment.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    value={formData.cnpj}
                    onChange={(e) => handleChange("cnpj", e.target.value)}
                    placeholder="00.000.000/0000-00"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCNPJLookup}
                    disabled={loadingCNPJ || !formData.cnpj.replace(/\D/g, "").length}
                    title="Buscar dados do CNPJ"
                  >
                    {loadingCNPJ ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            {/* CNPJ Data Preview */}
            {cnpjData && (
              <Card className="p-3 bg-muted/30">
                <div className="text-xs space-y-1.5">
                  <p className="font-medium text-foreground">{cnpjData.razao_social}</p>
                  {cnpjData.nome_fantasia && <p className="text-muted-foreground">Fantasia: {cnpjData.nome_fantasia}</p>}
                  {cnpjData.municipio && <p className="text-muted-foreground">📍 {cnpjData.municipio}/{cnpjData.uf}</p>}
                  {cnpjData.capital_social && (
                    <p className="text-muted-foreground">
                      💰 Capital: R$ {Number(cnpjData.capital_social).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  )}
                  {cnpjData.socios?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border">
                      <p className="font-medium text-foreground flex items-center gap-1 mb-1">
                        <Users className="h-3 w-3" />
                        Sócios ({cnpjData.socios.length})
                      </p>
                      {cnpjData.socios.map((s, i) => (
                        <p key={i} className="text-muted-foreground pl-4">
                          • {s.nome} <span className="text-muted-foreground/70">— {s.qualificacao}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="email@empresa.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={formData.website}
                  onChange={(e) => handleChange("website", e.target.value)}
                  placeholder="https://empresa.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Rua, número, bairro"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => handleChange("city", e.target.value)}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Input
                  value={formData.state}
                  onChange={(e) => handleChange("state", e.target.value)}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
              <div className="space-y-2">
                <Label>CEP</Label>
                <Input
                  value={formData.zip_code}
                  onChange={(e) => handleChange("zip_code", e.target.value)}
                  placeholder="00000-000"
                />
              </div>
            </div>

            {/* Contacts Section */}
            <div className="space-y-3 border-t pt-4">
              <Label className="flex items-center gap-2 text-base">
                <User className="h-4 w-4" />
                Contatos da Empresa
              </Label>

              {/* Tabs for adding contacts */}
              <Tabs value={contactMode} onValueChange={(v) => setContactMode(v as "new" | "existing")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="new">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Contato
                  </TabsTrigger>
                  <TabsTrigger value="existing">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Vincular Existente
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="new" className="mt-3">
                  <Card className="p-3">
                    <div className="grid grid-cols-4 gap-2">
                      <Input
                        value={newContact.name}
                        onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Nome"
                      />
                      <Input
                        value={newContact.phone}
                        onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                        placeholder="Telefone"
                      />
                      <Input
                        value={newContact.role}
                        onChange={(e) => setNewContact((p) => ({ ...p, role: e.target.value }))}
                        placeholder="Cargo"
                      />
                      <Button
                        variant="outline"
                        onClick={handleAddContact}
                        disabled={!newContact.name.trim() || !newContact.phone.trim()}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                </TabsContent>

                <TabsContent value="existing" className="mt-3">
                  <Card className="p-3 space-y-3">
                    {/* Select contact list first */}
                    <div className="space-y-2">
                      <Label className="text-sm">Lista de Contatos</Label>
                      <Select
                        value={selectedListId || "none"}
                        onValueChange={(v) => setSelectedListId(v === "none" ? null : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma lista" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Selecione...</SelectItem>
                          {contactLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name} ({list.contact_count} contatos)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Search and select contacts from list */}
                    {selectedListId && (
                      <div className="space-y-2">
                        <Label className="text-sm">Buscar Contato</Label>
                        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className="w-full justify-between"
                            >
                              <span className="flex items-center gap-2">
                                <Search className="h-4 w-4" />
                                Buscar na lista...
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput
                                placeholder="Buscar por nome ou telefone..."
                                value={searchContact}
                                onValueChange={setSearchContact}
                              />
                              <CommandList>
                                <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                                <CommandGroup>
                                  {listContacts
                                    .filter((c) => {
                                      const search = searchContact.toLowerCase();
                                      return (
                                        c.name.toLowerCase().includes(search) ||
                                        c.phone.includes(search)
                                      );
                                    })
                                    .filter((c) => !contacts.some((cc) => cc.phone === c.phone))
                                    .slice(0, 10)
                                    .map((contact) => (
                                      <CommandItem
                                        key={contact.id}
                                        value={`${contact.name} ${contact.phone}`}
                                        onSelect={() => {
                                          setContacts((prev) => [
                                            ...prev,
                                            {
                                              id: contact.id,
                                              name: contact.name,
                                              phone: contact.phone,
                                              is_primary: prev.length === 0,
                                            },
                                          ]);
                                          setPopoverOpen(false);
                                          setSearchContact("");
                                        }}
                                      >
                                        <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <User className="h-4 w-4" />
                                          </div>
                                          <div>
                                            <p className="font-medium">{contact.name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {contact.phone}
                                            </p>
                                          </div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Contacts List */}
              {contacts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">
                    {contacts.length} contato{contacts.length > 1 ? "s" : ""} vinculado{contacts.length > 1 ? "s" : ""}
                  </Label>
                  {contacts.map((contact) => (
                    <Card key={contact.id} className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm flex items-center gap-2">
                              {contact.name}
                              {contact.is_primary && (
                                <Badge variant="secondary" className="text-[10px]">Principal</Badge>
                              )}
                              {contact.role && (
                                <span className="text-muted-foreground font-normal">• {contact.role}</span>
                              )}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!contact.is_primary && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSetPrimary(contact.id!)}
                            >
                              Definir principal
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveContact(contact.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Anotações sobre a empresa..."
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim()}>
            {company ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
