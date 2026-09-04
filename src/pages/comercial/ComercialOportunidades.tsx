import ComercialLayout from './ComercialLayout';
import ComercialOportunidadesView from './ComercialOportunidadesView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialOportunidades = () => (
  <ComercialLayout>
    {() => (
      <ComercialOportunidadesView
        basePath="/comercial/oportunidades"
        listStages={comercialExternalApi.listStages}
        listOpportunities={comercialExternalApi.listOpportunities}
        createOpportunity={comercialExternalApi.createOpportunity}
        updateOpportunity={comercialExternalApi.updateOpportunity}
        listCustomers={comercialExternalApi.listCustomers}
      />
    )}
  </ComercialLayout>
);

export default ComercialOportunidades;
