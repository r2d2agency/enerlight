import PortalComercialShell from './comercial/PortalComercialShell';
import ComercialOrcamentoDetailView from './comercial/ComercialOrcamentoDetailView';
import { comercialInternalApi } from '@/lib/comercial-api';

export default function PortalComercialOrcamentoDetail() {
  return (
    <PortalComercialShell>
      {(actor) => (
        <ComercialOrcamentoDetailView
          actor={actor}
          basePath="/portal-comercial/orcamentos"
          proposalBaseUrl={`${window.location.origin}/proposta`}
          api={comercialInternalApi}
        />
      )}
    </PortalComercialShell>
  );
}
