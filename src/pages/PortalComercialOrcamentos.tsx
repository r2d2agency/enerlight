import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialOrcamentosView from './comercial/ComercialOrcamentosView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialOrcamentos() {
  return (
    <PortalComercialShell>
      {(actor) => (
        <ComercialOrcamentosView
          actor={actor}
          basePath="/portal-comercial/orcamentos"
          listQuotes={comercialInternalApi.listQuotes}
          createQuote={comercialInternalApi.createQuote}
          listCustomers={comercialInternalApi.listCustomers}
          createCustomer={comercialInternalApi.createCustomer}
          listMyPriceLists={comercialInternalApi.listMyPriceLists}
        />
      )}
    </PortalComercialShell>
  );
}
