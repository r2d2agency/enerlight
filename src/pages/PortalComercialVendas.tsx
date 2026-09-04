import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialVendasView from './comercial/ComercialVendasView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialVendas() {
  return (
    <PortalComercialShell>
      {() => <ComercialVendasView basePath="/portal-comercial/vendas" listSales={comercialInternalApi.listSales} />}
    </PortalComercialShell>
  );
}
