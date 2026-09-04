import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialOportunidadeDetailView from './comercial/ComercialOportunidadeDetailView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialOportunidadeDetail() {
  return (
    <PortalComercialShell>
      {() => (
        <ComercialOportunidadeDetailView
          basePath="/portal-comercial/oportunidades"
          quotesBasePath="/portal-comercial/orcamentos"
          getOpportunity={comercialInternalApi.getOpportunity}
          updateOpportunity={comercialInternalApi.updateOpportunity}
          createQuote={comercialInternalApi.createQuote}
        />
      )}
    </PortalComercialShell>
  );
}
