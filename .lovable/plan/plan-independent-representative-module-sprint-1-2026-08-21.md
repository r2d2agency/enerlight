# Plan - Independent Representative Module (Sprint 1)

Implement a separate management structure for Representatives, isolated from the main CRM, with its own login, roles, and dashboard.

## Technical Details

- **Database**:
  - Add `is_representative` and `is_representative_manager` columns to `users` (or `organization_members`).
  - Ensure `crm_representatives` table is linked to `users`.
- **Auth**:
  - Update `AuthContext` to handle representative-specific session data.
  - Create a dedicated login page/flow for representatives if needed, or adapt the existing one to redirect based on role.
- **Frontend**:
  - Create `RepresentativeLayout` for the isolated sidebar.
  - Implement `RepresentativeDashboard` (Sprint 1 basic version).
  - Implement `RepresentativeManagerDashboard` (Sprint 1 basic version).
  - Routes: `/rep/login`, `/rep/dashboard`, `/rep/manager/dashboard`, etc.

## Proposed Changes

### Database & Backend
- **Migration**: Add columns to `users` and ensure `crm_representatives` is ready.
- **Auth Route**: Update `/api/auth/login` to return representative status.
- **Permissions**: Update `ROLE_DEFAULTS` and `PERMISSION_COLUMNS` in `backend/src/routes/permissions.js`.

### Frontend
- **Auth Context**: Update `User` and `UserPermissions` interfaces.
- **Layout**: New `RepresentativeLayout.tsx` with the requested menu items.
- **Pages**:
  - `src/pages/representative/RepLogin.tsx`
  - `src/pages/representative/RepDashboard.tsx`
  - `src/pages/representative/RepManagerDashboard.tsx`
- **Routing**: Update `src/App.tsx` with new routes and layout wrapping.

## Sprint 1 Requirements Check
- [ ] Login and separate access.
- [ ] Representative cannot access other modules.
- [ ] Two profiles: Representative and Internal Manager.
- [ ] Responsive sidebar.
- [ ] Basic login and dashboard screens.
