import ComercialLayout from './ComercialLayout';
import ComercialOportunidadeDetailView from './ComercialOportunidadeDetailView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialOportunidadeDetail = () => (
  <ComercialLayout>
    {() => (
      <ComercialOportunidadeDetailView
        basePath="/comercial/oportunidades"
        quotesBasePath="/comercial/orcamentos"
        getOpportunity={comercialExternalApi.getOpportunity}
        updateOpportunity={comercialExternalApi.updateOpportunity}
        createQuote={comercialExternalApi.createQuote}
      />
    )}
  </ComercialLayout>
);

export default ComercialOportunidadeDetail;
