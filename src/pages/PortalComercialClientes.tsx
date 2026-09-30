import { useEffect, useState } from 'react';
import { ComercialActor, comercialAdminApi, ComercialAdminActor, ComercialTeam } from '@/lib/comercial-api';
import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialClientesView from './comercial/ComercialClientesView';
import { comercialInternalApi } from '@/lib/comercial-api';
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
    comercialAdminApi.listActors().then((res) => setSellers(
      res.actors.filter((a: ComercialAdminActor) => ['vendedor', 'parceiro'].includes(a.profile) && a.status === 'active')
        .map((a: ComercialAdminActor) => ({ id: a.id, name: a.name, email: a.email }))
    )).catch(() => {});
    comercialAdminApi.listTeams().then((res) => setTeams(res.teams.map((t: ComercialTeam) => ({ id: t.id, name: t.name })))).catch(() => {});
  }, [isAdmin]);

  const importCustomers = (customers: Record<string, string>[], target: ImportTarget) =>
    comercialAdminApi.importCustomers(customers, target.kind === 'seller' ? target.id : undefined, target.kind === 'team' ? target.id : undefined);

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
