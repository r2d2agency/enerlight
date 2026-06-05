O usuário relata que, mesmo após ativar as permissões (como Metas, Indicadores e Logística) e salvar no usuário, os itens não aparecem no menu lateral.

Após análise técnica, identifiquei que:
1.  **Sidebar.tsx**: A lógica de visibilidade no menu lateral utiliza `userPermissions` e `modulesEnabled`. A função `hasModuleAccess` prioriza permissões explícitas em `userPermissions`.
2.  **AuthContext.tsx**: O estado `userPermissions` é derivado de `user.user_permissions`. Quando as permissões são atualizadas via API, o frontend chama `refreshUser()` para buscar os dados atualizados do endpoint `/api/auth/me`.
3.  **Persistence**: Se o usuário salva e "não funciona", pode ser um problema de cache no navegador, falha na atualização do estado global do React após o salvamento, ou os campos no banco de dados não estarem sendo lidos corretamente pelo endpoint `/me`.

Vou realizar as seguintes correções:
- **Forçar refresh de permissões**: Garantir que após salvar permissões em `PermissionsDialog.tsx` e templates em `PermissionTemplatesTab.tsx`, o estado de autenticação seja invalidado ou atualizado corretamente.
- **Sincronização de Chaves**: Verificar se todas as chaves de permissão usadas no Sidebar (ex: `can_view_goals`, `can_view_representatives`, `can_view_logistics`) estão presentes no `AuthContext` e nos diálogos de permissão.
- **Módulos da Organização**: Garantir que as permissões de usuário tenham precedência sobre as travas de módulos da organização no menu lateral, conforme a lógica pretendida.

### Detalhes Técnicos
- Atualizar `src/components/permissions/PermissionsDialog.tsx` para garantir que `refreshUser()` atualize o estado local de forma reativa.
- Verificar o mapeamento de `modulePermissionMap` no `Sidebar.tsx` para garantir que cobre todos os novos módulos adicionados recentemente.
- Adicionar logs de depuração temporários (se necessário) para rastrear o fluxo de dados de permissões.
