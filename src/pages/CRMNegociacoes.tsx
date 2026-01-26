import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { DealDetailDialog } from "@/components/crm/DealDetailDialog";
import { DealFormDialog } from "@/components/crm/DealFormDialog";
import { FunnelEditorDialog } from "@/components/crm/FunnelEditorDialog";
import { useCRMFunnels, useCRMFunnel, useCRMDeals, CRMDeal, CRMFunnel } from "@/hooks/use-crm";
import { Plus, Settings, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function CRMNegociacoes() {
  const { user } = useAuth();
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
  const [dealDetailOpen, setDealDetailOpen] = useState(false);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [funnelEditorOpen, setFunnelEditorOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<CRMFunnel | null>(null);

  const { data: funnels, isLoading: loadingFunnels } = useCRMFunnels();
  const { data: funnelData } = useCRMFunnel(selectedFunnelId);
  const { data: dealsByStage, isLoading: loadingDeals } = useCRMDeals(selectedFunnelId);

  // Select first funnel by default
  const currentFunnelId = selectedFunnelId || funnels?.[0]?.id || null;
  const currentFunnel = funnels?.find((f) => f.id === currentFunnelId) || null;

  const canManage = user?.role && ['owner', 'admin', 'manager'].includes(user.role);

  const handleDealClick = (deal: CRMDeal) => {
    setSelectedDeal(deal);
    setDealDetailOpen(true);
  };

  const handleEditFunnel = () => {
    setEditingFunnel(currentFunnel);
    setFunnelEditorOpen(true);
  };

  const handleNewFunnel = () => {
    setEditingFunnel(null);
    setFunnelEditorOpen(true);
  };

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Negociações</h1>
            
            {/* Funnel Selector */}
            <Select 
              value={currentFunnelId || ""} 
              onValueChange={(val) => setSelectedFunnelId(val)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Selecione um funil" />
              </SelectTrigger>
              <SelectContent>
                {funnels?.map((funnel) => (
                  <SelectItem key={funnel.id} value={funnel.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: funnel.color }} 
                      />
                      {funnel.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {canManage && currentFunnel && (
              <Button variant="ghost" size="icon" onClick={handleEditFunnel}>
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {canManage && (
              <Button variant="outline" onClick={handleNewFunnel}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Funil
              </Button>
            )}
            <Button onClick={() => setNewDealOpen(true)} disabled={!currentFunnelId}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Negociação
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loadingFunnels || loadingDeals ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : !funnels?.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h3 className="text-lg font-medium mb-2">Nenhum funil configurado</h3>
              <p className="text-muted-foreground mb-4">
                Crie um funil para começar a gerenciar suas negociações
              </p>
              {canManage && (
                <Button onClick={handleNewFunnel}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Funil
                </Button>
              )}
            </div>
          ) : funnelData?.stages ? (
            <KanbanBoard
              stages={funnelData.stages}
              dealsByStage={dealsByStage || {}}
              onDealClick={handleDealClick}
            />
          ) : null}
        </div>
      </div>

      {/* Dialogs */}
      <DealDetailDialog
        deal={selectedDeal}
        open={dealDetailOpen}
        onOpenChange={setDealDetailOpen}
      />

      <DealFormDialog
        funnel={currentFunnel}
        open={newDealOpen}
        onOpenChange={setNewDealOpen}
      />

      <FunnelEditorDialog
        funnel={editingFunnel}
        open={funnelEditorOpen}
        onOpenChange={setFunnelEditorOpen}
      />
    </MainLayout>
  );
}
