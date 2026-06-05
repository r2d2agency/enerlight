I will fix the permissions and menu visibility issues by synchronizing the permission keys and module settings across the application.

### Improvements:

1.  **Sync Permission Templates**:
    *   Update `src/components/admin/PermissionTemplatesTab.tsx` to include the missing "Logística" and "Assinaturas" permission groups.
    *   Ensure all permission keys (like `can_view_logistics`, `can_view_document_signatures`) are available in the templates UI.
2.  **Sync Permissions Dialog**:
    *   Update `src/components/permissions/PermissionsDialog.tsx` to match the groups and keys in the templates tab.
3.  **Update Sidebar Module Logic**:
    *   Add `moduleKey: 'goals'` to the "Metas" menu item.
    *   Add `moduleKey: 'representatives'` to the "Indicadores" menu item.
    *   This ensures that even if a user has the permission, the item only appears if the module is enabled for the organization.
4.  **Update Auth Context**:
    *   Add `goals` and `representatives` to the `ModulesEnabled` interface and default state.
5.  **Refactor Permission Groups**:
    *   I will extract the `PERMISSION_GROUPS` to a shared file or at least ensure they are identical in both components to avoid future sync issues.

### Technical Details:
-   **Files to modify**:
    -   `src/contexts/AuthContext.tsx`: Update `ModulesEnabled` and `defaultModules`.
    -   `src/components/admin/PermissionTemplatesTab.tsx`: Add missing groups and keys.
    -   `src/components/permissions/PermissionsDialog.tsx`: Match the template groups.
    -   `src/components/layout/Sidebar.tsx`: Add `moduleKey` to Metas and Indicadores.
-   **New Permission Keys to ensure everywhere**:
    -   `can_view_logistics`, `can_edit_logistics`, `can_delete_logistics`
    -   `can_view_document_signatures`
    -   `can_view_goals`
    -   `can_view_representatives`
