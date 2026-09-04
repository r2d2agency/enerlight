import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialClientesView from './comercial/ComercialClientesView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialClientes() {
  return (
    <PortalComercialShell>
      {(actor) => (
        <ComercialClientesView
          actor={actor}
          listCustomers={comercialInternalApi.listCustomers}
          createCustomer={comercialInternalApi.createCustomer}
          updateCustomer={comercialInternalApi.updateCustomer}
        />
      )}
    </PortalComercialShell>
  );
}
