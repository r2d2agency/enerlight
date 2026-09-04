import ComercialLayout from './ComercialLayout';
import ComercialClientesView from './ComercialClientesView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialClientes = () => (
  <ComercialLayout>
    {(actor) => (
      <ComercialClientesView
        actor={actor}
        listCustomers={comercialExternalApi.listCustomers}
        createCustomer={comercialExternalApi.createCustomer}
        updateCustomer={comercialExternalApi.updateCustomer}
      />
    )}
  </ComercialLayout>
);

export default ComercialClientes;
