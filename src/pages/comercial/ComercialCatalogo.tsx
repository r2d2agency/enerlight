import ComercialLayout from './ComercialLayout';
import ComercialCatalogoView from './ComercialCatalogoView';
import { comercialExternalApi } from '@/lib/comercial-api';

const ComercialCatalogo = () => (
  <ComercialLayout>
    {() => (
      <ComercialCatalogoView
        listCatalog={comercialExternalApi.listCatalog}
        listMyPriceLists={comercialExternalApi.listMyPriceLists}
      />
    )}
  </ComercialLayout>
);

export default ComercialCatalogo;
