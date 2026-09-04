import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialOportunidadesView from './comercial/ComercialOportunidadesView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialOportunidades() {
  return (
    <PortalComercialShell>
      {() => (
        <ComercialOportunidadesView
          basePath="/portal-comercial/oportunidades"
          listStages={comercialInternalApi.listStages}
          listOpportunities={comercialInternalApi.listOpportunities}
          createOpportunity={comercialInternalApi.createOpportunity}
          updateOpportunity={comercialInternalApi.updateOpportunity}
          listCustomers={comercialInternalApi.listCustomers}
        />
      )}
    </PortalComercialShell>
  );
}
