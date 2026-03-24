import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { useFlows, Flow } from "@/hooks/use-flows";
import { useStageAutomations, useStageAutomationMutations, StageAutomation } from "@/hooks/use-crm-automation";
import { useCRMFunnels, CRMStage } from "@/hooks/use-crm";
import { Zap, ChevronDown, ChevronUp, Clock, ArrowRight, Loader2, Trash2, Plus } from "lucide-react";

interface StageAutomationEditorProps {
  stage: CRMStage;
  allStages: CRMStage[];
  funnelId?: string;
}

interface AutomationItemConfig {
  id?: string;
  flow_id: string | null;
  wait_hours: number;
  next_stage_id: string | null;
  fallback_funnel_id: string | null;
  fallback_stage_id: string | null;
  is_active: boolean;
  execute_immediately: boolean;
}

const defaultConfig = (): AutomationItemConfig => ({
  flow_id: null,
  wait_hours: 24,
  next_stage_id: null,
  fallback_funnel_id: null,
  fallback_stage_id: null,
  is_active: true,
  execute_immediately: true,
});

function AutomationFlowItem({
  config,
  index,
  flows,
  loadingFlows,
  allStages,
  stage,
  funnelId,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  config: AutomationItemConfig;
  index: number;
  flows: Flow[];
  loadingFlows: boolean;
  allStages: CRMStage[];
  stage: CRMStage;
  funnelId?: string;
  onSave: (cfg: AutomationItemConfig) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [local, setLocal] = useState<AutomationItemConfig>(config);
  const { data: funnels } = useCRMFunnels();

  useEffect(() => {
    setLocal(config);
  }, [config]);

  const nextStageOptions = allStages.filter(s => s.id !== stage.id && s.position > stage.position && !s.is_final);
  const flowName = flows.find(f => f.id === local.flow_id)?.name;

  return (
    <Card className="p-3 space-y-3 bg-muted/50 border-l-2 border-primary/30">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground">Fluxo #{index + 1}</span>
        {flowName && <Badge variant="outline" className="text-[10px]">{flowName}</Badge>}
      </div>

      {/* Flow Selection */}
      <div className="space-y-1">
        <Label className="text-xs">Fluxo de automação</Label>
        <Select
          value={local.flow_id || "none"}
          onValueChange={(v) => setLocal(prev => ({ ...prev, flow_id: v === "none" ? null : v }))}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione um fluxo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhum fluxo</SelectItem>
            {loadingFlows ? (
              <SelectItem value="loading" disabled>Carregando...</SelectItem>
            ) : (
              flows.map(flow => (
                <SelectItem key={flow.id} value={flow.id}>{flow.name}</SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Wait Time */}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Tempo de espera (horas)
        </Label>
        <Input
          type="number"
          min={1}
          value={local.wait_hours}
          onChange={(e) => setLocal(prev => ({ ...prev, wait_hours: Number(e.target.value) }))}
          className="h-8 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Dispara após {local.wait_hours}h
        </p>
      </div>

      {/* Next Stage */}
      <div className="space-y-1">
        <Label className="text-xs flex items-center gap-1">
          <ArrowRight className="h-3 w-3" />
          Próxima etapa (sem resposta)
        </Label>
        <Select
          value={local.next_stage_id || "none"}
          onValueChange={(v) => setLocal(prev => ({ ...prev, next_stage_id: v === "none" ? null : v }))}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Selecione a próxima etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma (usar fallback)</SelectItem>
            {nextStageOptions.map(s => (
              <SelectItem key={s.id} value={s.id!}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Fallback Funnel */}
      {!local.next_stage_id && (
        <div className="space-y-2 p-2 bg-background rounded border">
          <p className="text-[10px] font-medium text-muted-foreground">Fallback (última etapa)</p>
          <div className="space-y-1">
            <Label className="text-xs">Mover para funil</Label>
            <Select
              value={local.fallback_funnel_id || "none"}
              onValueChange={(v) => setLocal(prev => ({
                ...prev,
                fallback_funnel_id: v === "none" ? null : v,
                fallback_stage_id: null
              }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione o funil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {funnels?.filter(f => f.id !== funnelId).map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Options */}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Ativo</Label>
        <Switch
          checked={local.is_active}
          onCheckedChange={(v) => setLocal(prev => ({ ...prev, is_active: v }))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-xs">Executar ao entrar na etapa</Label>
        <Switch
          checked={local.execute_immediately}
          onCheckedChange={(v) => setLocal(prev => ({ ...prev, execute_immediately: v }))}
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="flex-1 h-7 text-xs"
          onClick={() => onSave(local)}
          disabled={saving}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="h-7 text-xs"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </Card>
  );
}

export function StageAutomationEditor({ stage, allStages, funnelId }: StageAutomationEditorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: automations, isLoading: loadingAutomations } = useStageAutomations(stage.id || null);
  const { saveAutomation, deleteAutomation } = useStageAutomationMutations();

  const [flows, setFlows] = useState<Flow[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const { getFlows } = useFlows();

  useEffect(() => {
    async function loadFlows() {
      setLoadingFlows(true);
      const result = await getFlows();
      setFlows(result.filter(f => f.is_active));
      setLoadingFlows(false);
    }
    if (isOpen) loadFlows();
  }, [isOpen, getFlows]);

  const handleSave = (cfg: AutomationItemConfig) => {
    if (!stage.id) return;
    saveAutomation.mutate({
      stageId: stage.id,
      id: cfg.id,
      flow_id: cfg.flow_id,
      wait_hours: cfg.wait_hours,
      next_stage_id: cfg.next_stage_id,
      fallback_funnel_id: cfg.fallback_funnel_id,
      fallback_stage_id: cfg.fallback_stage_id,
      is_active: cfg.is_active,
      execute_immediately: cfg.execute_immediately,
    });
  };

  const handleDelete = (automationId: string) => {
    if (!stage.id) return;
    deleteAutomation.mutate({ stageId: stage.id, automationId });
  };

  const handleAddNew = () => {
    if (!stage.id) return;
    saveAutomation.mutate({
      stageId: stage.id,
      ...defaultConfig(),
    });
  };

  const activeCount = automations?.filter(a => a.is_active).length || 0;

  if (stage.is_final) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between mt-2 h-8">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3" />
            <span className="text-xs">Automação</span>
            {activeCount > 0 && (
              <Badge variant="default" className="text-[10px] h-4">
                {activeCount} fluxo{activeCount > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {loadingAutomations ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <>
              {automations?.map((automation, idx) => (
                <AutomationFlowItem
                  key={automation.id}
                  config={{
                    id: automation.id,
                    flow_id: automation.flow_id,
                    wait_hours: automation.wait_hours,
                    next_stage_id: automation.next_stage_id,
                    fallback_funnel_id: automation.fallback_funnel_id,
                    fallback_stage_id: automation.fallback_stage_id,
                    is_active: automation.is_active,
                    execute_immediately: automation.execute_immediately,
                  }}
                  index={idx}
                  flows={flows}
                  loadingFlows={loadingFlows}
                  allStages={allStages}
                  stage={stage}
                  funnelId={funnelId}
                  onSave={handleSave}
                  onDelete={() => handleDelete(automation.id)}
                  saving={saveAutomation.isPending}
                  deleting={deleteAutomation.isPending}
                />
              ))}

              {(!automations || automations.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhum fluxo configurado
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={handleAddNew}
                disabled={saveAutomation.isPending}
              >
                <Plus className="h-3 w-3 mr-1" />
                Adicionar fluxo
              </Button>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
