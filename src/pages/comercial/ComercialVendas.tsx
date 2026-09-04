import ComercialLayout from './ComercialLayout';
import ComercialVendasView from './ComercialVendasView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialVendas = () => (
  <ComercialLayout>
    {() => <ComercialVendasView basePath="/comercial/vendas" listSales={comercialExternalApi.listSales} />}
  </ComercialLayout>
);

export default ComercialVendas;
