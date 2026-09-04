import ComercialLayout from './ComercialLayout';
import ComercialDashboardView from './ComercialDashboardView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialDashboard = () => (
  <ComercialLayout>
    {(actor) => (
      <ComercialDashboardView actor={actor} getDashboard={comercialExternalApi.getDashboard} listMyCommissions={comercialExternalApi.listMyCommissions} />
    )}
  </ComercialLayout>
);

export default ComercialDashboard;
