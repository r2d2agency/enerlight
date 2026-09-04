import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialVendaDetailView from './comercial/ComercialVendaDetailView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialVendaDetail() {
  return (
    <PortalComercialShell>
      {() => <ComercialVendaDetailView basePath="/portal-comercial/vendas" getSale={comercialInternalApi.getSale} />}
    </PortalComercialShell>
  );
}
