# Plan: Rebuilding Representative Management and Online Quotes

The user wants a clean start on the "Representantes" module, with a new "Configuração" menu restricted to authorized personnel. This menu will allow creating "Tabelas" (Price Lists) that can import spreadsheets (items with code, cost, sale price) and have permissions linked to the system's "Permission Templates". These tables will be used in quotes later.

## User Review Required
- **Permissions**: I will add a new permission `can_manage_representative_config`. Please confirm if this is acceptable or if you prefer an existing one.
- **Table Scope**: I'll keep the existing `price_lists` and `price_list_items` tables but ensure they fully support the "permission template" filtering as requested.

## Proposed Changes

### Database & Backend
- Add `representative_config` permission to the permission system if not already there.
- Ensure `price_lists` table has `allowed_templates` column (JSONB) to store which permission templates have access. (Already partly implemented, will verify).
- Implement specialized import logic for XLSX/CSV with mapping for: Code, Cost Price, Sale Price.

### Frontend
- **Sidebar**:
  - Add "Configuração" under the "Representantes" section.
  - Apply `can_manage_representative_config` permission check.
- **New Page: `RepresentativeConfig.tsx`**:
  - Tab for "Tabelas de Preço".
  - List of existing tables with status and access groups.
  - "New Table" dialog with fields: Name, Description, Access Groups (Permission Templates).
  - Bulk Import feature with field mapping.
- **Existing Page: `OnlineQuotes.tsx`**:
  - Ensure the "Nova Proposta" flow correctly filters available price lists based on the current user's permission template.

## Technical Details
- **Permission Mapping**: A user's `permission_template_id` will be checked against the `allowed_templates` array in the `price_lists` table.
- **Role Isolation**: Only 'owner', 'admin', and users with `can_manage_representative_config` will see the configuration menu.

## Verification Plan
- **Backend**: Test the `GET /api/online-quotes/price-lists` endpoint with different user roles and permission templates to ensure correct filtering.
- **Frontend**: Verify the "Configuração" menu visibility in the sidebar. Test the XLSX import flow with various column names.
