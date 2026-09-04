import ComercialLayout from './ComercialLayout';
import ComercialOrcamentosView from './ComercialOrcamentosView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialOrcamentos = () => (
  <ComercialLayout>
    {() => (
      <ComercialOrcamentosView
        basePath="/comercial/orcamentos"
        listQuotes={comercialExternalApi.listQuotes}
        createQuote={comercialExternalApi.createQuote}
        listCustomers={comercialExternalApi.listCustomers}
      />
    )}
  </ComercialLayout>
);

export default ComercialOrcamentos;
