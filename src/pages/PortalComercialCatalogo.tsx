import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialCatalogoView from './comercial/ComercialCatalogoView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialCatalogo() {
  return (
    <PortalComercialShell>
      {() => (
        <ComercialCatalogoView
          listCatalog={comercialInternalApi.listCatalog}
          listMyPriceLists={comercialInternalApi.listMyPriceLists}
        />
      )}
    </PortalComercialShell>
  );
}
