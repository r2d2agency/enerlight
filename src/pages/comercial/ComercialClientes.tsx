import { useEffect, useState } from 'react';
import { ComercialActor, comercialExternalApi } from '@/lib/comercial-api';
import ComercialLayout from './ComercialLayout';
import ComercialClientesView from './ComercialClientesView';
import type { ImportTarget, SellerOption, TeamOption } from '@/components/comercial/CustomerImportDialog';

const ComercialClientes = () => (
  <ComercialLayout>
    {(actor: ComercialActor) => <ClientesContent actor={actor} />}
  </ComercialLayout>
);

function ClientesContent({ actor }: { actor: ComercialActor }) {
  const isAdmin = actor.profile === 'admin';
  const [sellers, setSellers] = useState<SellerOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    comercialExternalApi.importOptions()
      .then((res) => { setSellers(res.sellers); setTeams(res.teams); })
      .catch(() => {});
  }, [isAdmin]);

  const importCustomers = (customers: Record<string, string>[], target: ImportTarget) =>
    comercialExternalApi.importCustomers(
      customers,
      target.kind === 'seller' ? target.id : undefined,
      target.kind === 'team' ? target.id : undefined
    );

  return (
    <ComercialClientesView
      actor={actor}
      listCustomers={comercialExternalApi.listCustomers}
      createCustomer={comercialExternalApi.createCustomer}
      updateCustomer={comercialExternalApi.updateCustomer}
      isAdmin={isAdmin}
      importSellers={sellers}
      importTeams={teams}
      onImportCustomers={isAdmin ? importCustomers : undefined}
    />
  );
}

export default ComercialClientes;
