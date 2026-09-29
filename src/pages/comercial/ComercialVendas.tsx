import ComercialLayout from './ComercialLayout';
import ComercialVendasView from './ComercialVendasView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialVendas = () => (
  <ComercialLayout>
    {(actor) => <ComercialVendasView basePath="/comercial/vendas" actor={actor} listSales={comercialExternalApi.listSales} />}
  </ComercialLayout>
);

export default ComercialVendas;
