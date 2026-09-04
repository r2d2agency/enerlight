import ComercialLayout from './ComercialLayout';
import ComercialOrcamentoDetailView from './ComercialOrcamentoDetailView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialOrcamentoDetail = () => (
  <ComercialLayout>
    {(actor) => (
      <ComercialOrcamentoDetailView
        actor={actor}
        basePath="/comercial/orcamentos"
        salesBasePath="/comercial/vendas"
        proposalBaseUrl={`${window.location.origin}/proposta`}
        api={comercialExternalApi}
      />
    )}
  </ComercialLayout>
);

export default ComercialOrcamentoDetail;
