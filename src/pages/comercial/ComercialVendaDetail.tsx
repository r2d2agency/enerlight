import ComercialLayout from './ComercialLayout';
import ComercialVendaDetailView from './ComercialVendaDetailView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialVendaDetail = () => (
  <ComercialLayout>
    {() => <ComercialVendaDetailView basePath="/comercial/vendas" getSale={comercialExternalApi.getSale} />}
  </ComercialLayout>
);

export default ComercialVendaDetail;
