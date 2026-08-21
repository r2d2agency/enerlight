# Sprint 10: Gestão e Segurança Administrativa

## Requisitos
- Área administrativa completa para gestores.
- Gestão de representantes: visualização, bloqueio, permissões.
- Filtros avançados para orçamentos globais.
- Auditoria de alterações administrativas.
- Hardening de segurança (isolamento de dados de representantes).

## Backend
- Rota `GET /api/representatives/admin/all-quotes` com filtros globais.
- Rota `GET /api/representatives/admin/list` para gestão de usuários.
- Middleware de segurança reforçado em `backend/src/routes/representatives.js`.
- Sistema de logs de auditoria para ações administrativas.

## Frontend
- Implementação de `RepManagerQuotes.tsx`.
- Implementação de `RepManagerReps.tsx`.
- Refinamento de `RepManagerDashboard.tsx` com visão consolidada.
- Bloqueio de navegação para representantes em rotas não autorizadas.
- Exportação de relatórios em CSV/XLSX.