import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialVendasView from './comercial/ComercialVendasView';
import { ComercialActor, comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialVendas() {
  return (
    <PortalComercialShell>
      {(actor) => <ComercialVendasView basePath="/portal-comercial/vendas" actor={actor} listSales={comercialInternalApi.listSales} />}
    </PortalComercialShell>
  );
}
