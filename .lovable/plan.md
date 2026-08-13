# Plan: Implement Granular Price List Permissions

The user wants to control which price lists each representative can access. Currently, representatives see all active price lists. We will implement a system where each price list can be restricted to specific "Permission Templates". Since representatives are assigned to these templates during creation/editing, this will provide the requested granular control.

## Proposed Changes

### Database & Backend
1. **Migration**: 
   - Ensure the `price_lists` table has an `allowed_templates` column (JSONB array of template IDs).
   - Ensure the `price_list_access` table exists (though we'll primarily use `allowed_templates` on the price list for template-based matching).
2. **Backend API (`backend/src/routes/online-quotes.js`)**:
   - Update `POST /price-lists` to accept and save `allowed_templates`.
   - Update `GET /price-lists` to filter lists based on the user's `permission_template_id` if they aren't an admin.

### Frontend
1. **Price List Management (`src/pages/OnlineQuotes.tsx`)**:
   - Update the "Edit Price List" dialog to allow selecting which Permission Templates can access it.
   - Fetch the list of available Permission Templates from `/api/permission-templates`.
2. **Quote Creation (`src/components/crm/OnlineQuoteFormDialog.tsx`)**:
   - The hook `usePriceLists` will already return filtered lists from the backend.
   - (Verification) Ensure the frontend filter `filteredPriceLists` correctly respects the user's template.

## User Review Required

> [!IMPORTANT]
> The system will now use "Permission Templates" to control price list visibility. If a price list has no templates selected, it will be visible to everyone (current behavior). If templates are selected, only users assigned to those templates will see that price list.

- Do you want to restrict by **individual user** as well, or is restricting by **Permission Template** (which groups users) sufficient?
- Should a price list with NO templates selected be visible to **everyone** or **no one**? (I'll default to "everyone" to avoid breaking current setups).

---

## Technical Details

### Backend Changes (`backend/src/routes/online-quotes.js`)
- `GET /price-lists`: Join with `users` to get `permission_template_id`.
- Filter: `WHERE (pl.allowed_templates IS NULL OR pl.allowed_templates = '[]'::jsonb OR pl.allowed_templates @> jsonb_build_array(u.permission_template_id))`.

### Frontend Changes (`src/pages/OnlineQuotes.tsx`)
- Add a multi-select for templates in the `Dialog` for price list editing.
- Display assigned templates in the price lists table/cards for admins.

### File Modifications
- `backend/src/routes/online-quotes.js`: Update CRUD logic and filters.
- `src/pages/OnlineQuotes.tsx`: Update management UI.
- `src/hooks/use-online-quotes.ts`: Update types if needed.
