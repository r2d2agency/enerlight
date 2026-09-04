import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialDashboardView from './comercial/ComercialDashboardView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialDashboard() {
  return (
    <PortalComercialShell>
      {(actor) => (
        <ComercialDashboardView actor={actor} getDashboard={comercialInternalApi.getDashboard} listMyCommissions={comercialInternalApi.listMyCommissions} />
      )}
    </PortalComercialShell>
  );
}
