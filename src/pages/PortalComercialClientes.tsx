import { useEffect, useState } from 'react';
import { ComercialActor, comercialInternalApi } from '@/lib/comercial-api';
import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialClientesView from './comercial/ComercialClientesView';
import type { ImportTarget, SellerOption, TeamOption } from '@/components/comercial/CustomerImportDialog';

export default function PortalComercialClientes() {
  return (
    <PortalComercialShell>
      {(actor: ComercialActor) => <ClientesContent actor={actor} />}
    </PortalComercialShell>
  );
}

function ClientesContent({ actor }: { actor: ComercialActor }) {
  const isAdmin = actor.profile === 'admin';
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    comercialInternalApi.importOptions()
      .then((res) => { setSellers(res.sellers); setTeams(res.teams); })
      .catch(() => {});
  }, [isAdmin]);

  const importCustomers = (customers: Record<string, string>[], target: ImportTarget) =>
    comercialInternalApi.importCustomers(
      customers,
      target.kind === 'seller' ? target.id : undefined,
      target.kind === 'team' ? target.id : undefined
    );

  return (
    <ComercialClientesView
      actor={actor}
      listCustomers={comercialInternalApi.listCustomers}
      createCustomer={comercialInternalApi.createCustomer}
      updateCustomer={comercialInternalApi.updateCustomer}
      isAdmin={isAdmin}
      importSellers={sellers}
      importTeams={teams}
      onImportCustomers={isAdmin ? importCustomers : undefined}
    />
  );
}
