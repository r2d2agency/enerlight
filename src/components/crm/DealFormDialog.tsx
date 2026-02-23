import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CRMFunnel, useCRMDealMutations, useCRMFunnel, useCRMGroups } from "@/hooks/use-crm";
import { Slider } from "@/components/ui/slider";
import { User, Handshake } from "lucide-react";
import { CompanySearchSelect } from "@/components/crm/CompanySearchSelect";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRepresentativesForDeal } from "@/hooks/use-representatives";

interface DealFormDialogProps {
  funnel: CRMFunnel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function useMyGroups() {
  return useQuery({
    queryKey: ["crm-my-groups"],
    queryFn: () => api<{ id: string; name: string; is_supervisor: boolean }[]>("/api/crm/groups/me"),
  });
}

export function DealFormDialog({ funnel, open, onOpenChange }: DealFormDialogProps) {
  const { user } = useAuth();
  const canManage = user?.role && ['owner', 'admin', 'manager'].includes(user.role);

  const [title, setTitle] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [stageId, setStageId] = useState("");
  const [value, setValue] = useState("");
  const [probability, setProbability] = useState(50);
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState("");
  const [representativeId, setRepresentativeId] = useState("");
  
  const [mode, setMode] = useState<"company" | "contact">("company");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const { data: funnelData } = useCRMFunnel(funnel?.id || null);
  const { data: groups } = useCRMGroups();
  const { data: myGroups } = useMyGroups();
  const { data: repsForDeal } = useRepresentativesForDeal();
  const { createDeal } = useCRMDealMutations();

  // Auto-fill group for non-managers
  useEffect(() => {
    if (!canManage && myGroups?.length && !groupId) {
      setGroupId(myGroups[0].id);
    }
  }, [canManage, myGroups, groupId]);

  useEffect(() => {
    if (open && funnelData?.stages?.length) {
      const firstStage = funnelData.stages.find((s) => !s.is_final);
      if (firstStage?.id) {
        setStageId(firstStage.id);
      }
    }
  }, [open, funnelData]);

  const handleSave = () => {
    if (!funnel || !title.trim() || !stageId) return;
    if (mode === "company" && !companyId) return;
    if (mode === "contact" && (!contactName.trim() || !contactPhone.trim())) return;

    createDeal.mutate({
      funnel_id: funnel.id,
      stage_id: stageId,
      company_id: mode === "company" ? companyId : undefined,
      title,
      value: Number(value) || 0,
      probability,
      expected_close_date: expectedCloseDate || undefined,
      description,
      group_id: groupId || undefined,
      representative_id: representativeId || undefined,
      contact_name: mode === "contact" ? contactName : undefined,
      contact_phone: mode === "contact" ? contactPhone : undefined,
    } as any);

    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setTitle("");
    setCompanyId("");
    setValue("");
    setProbability(50);
    setExpectedCloseDate("");
    setDescription("");
    setGroupId("");
    setRepresentativeId("");
    setContactName("");
    setContactPhone("");
    setMode("company");
  };

  const isValid = () => {
    if (!title.trim() || !stageId) return false;
    if (mode === "company") return !!companyId;
    if (mode === "contact") return !!contactName.trim() && !!contactPhone.trim();
    return false;
  };

  // Derive group name for display
  const userGroupName = !canManage && myGroups?.length
    ? myGroups.map(g => g.name).join(", ")
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Nova Negociação</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-1">
            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título da negociação"
              />
            </div>

            {/* Company or Contact Selection */}
            <div className="space-y-2">
              <Label>Vincular a *</Label>
              <Tabs value={mode} onValueChange={(v) => setMode(v as "company" | "contact")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="company" className="flex items-center gap-2">
                    Empresa
                  </TabsTrigger>
                  <TabsTrigger value="contact" className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Contato
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="company" className="mt-3">
                  <CompanySearchSelect value={companyId} onSelect={setCompanyId} />
                </TabsContent>

                <TabsContent value="contact" className="mt-3 space-y-3">
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Nome do contato"
                  />
                  <Input
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="Telefone (WhatsApp)"
                  />
                </TabsContent>
              </Tabs>
            </div>

            <div className="space-y-2">
              <Label>Etapa *</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {funnelData?.stages
                    ?.filter((s) => !s.is_final)
                    .map((stage) => (
                      <SelectItem key={stage.id} value={stage.id!}>
                        {stage.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0,00"
                  min={0}
                  step={0.01}
                />
              </div>
              <div className="space-y-2">
                <Label>Fechamento previsto</Label>
                <Input
                  type="date"
                  value={expectedCloseDate}
                  onChange={(e) => setExpectedCloseDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Probabilidade de fechamento: {probability}%</Label>
              <Slider
                value={[probability]}
                onValueChange={([val]) => setProbability(val)}
                min={0}
                max={100}
                step={5}
              />
            </div>

            {/* Group: managers can select, vendedores see auto-filled read-only */}
            {canManage ? (
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Select value={groupId || "none"} onValueChange={(val) => setGroupId(val === "none" ? "" : val)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um grupo (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : userGroupName ? (
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Input value={userGroupName} disabled className="bg-muted" />
              </div>
            ) : null}

            {/* Representative */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2"><Handshake className="h-4 w-4" /> Representante</Label>
              <Select value={representativeId || "none"} onValueChange={v => setRepresentativeId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um representante (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {repsForDeal?.map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>
                      {rep.name} ({rep.commission_percent}%)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes da negociação..."
                rows={3}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValid()}
          >
            Criar Negociação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
