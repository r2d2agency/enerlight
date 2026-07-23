## Escopo

Fechar o módulo RH em 5 frentes, integradas ao backend real (fim do TODO no Kiosk e no MyPoint).

### 1. Registro de ponto (backend real)
- Nova tabela `rh_punches`: `id, organization_id, user_id, punch_type (entrada|almoco_ini|almoco_fim|saida|extra), punched_at (timestamptz), source (kiosk|app|manual), latitude, longitude, location_id, notes, created_by, created_at`.
- Nova tabela `rh_punch_audit`: `id, punch_id, action (create|update|delete), before jsonb, after jsonb, reason, actor_user_id, created_at`.
- Endpoints em `backend/src/routes/rh.js`:
  - `POST /api/rh/punches` — kiosk/app cria batida (grava reconhecido por facial ou usuário logado).
  - `GET /api/rh/punches/me?from=&to=` — colaborador vê só as próprias batidas do período (sem soma de horas).
  - `GET /api/rh/punches?date=&user_id=` — admin/RH vê todas as batidas do dia, com filtro por colaborador.
  - `POST /api/rh/punches/manual` — admin cria batida manual com `reason` obrigatório (grava auditoria).
  - `PATCH /api/rh/punches/:id` e `DELETE /api/rh/punches/:id` — edita/apaga com `reason`, grava auditoria.
  - `GET /api/rh/punches/:id/audit` — histórico do ponto.
  - `GET /api/rh/dashboard/missing-today` — lista quem tem jornada hoje e ainda não bateu entrada (ou já passou do horário e não bateu saída).

### 2. Minhas batidas (colaborador)
- `MyPoint.tsx`: seção "Minhas batidas" listando cronologicamente as batidas do dia/semana com hora, tipo, origem (Kiosk/App/Manual) e ícone se foi manual. **Sem** soma de horas.

### 3. Dashboard e ajuste manual (admin)
- Nova tela dentro da aba **Registros** de `RhModule` para quem tiver a permissão:
  - Card "Sem bater ponto hoje" (usa `/dashboard/missing-today`) com badge de alerta e botão de notificar.
  - Tabela do dia: colaborador, entrada, almoço ini/fim, saída, origem, ações (editar/adicionar manualmente).
  - Dialog de ajuste manual pede tipo, data/hora, motivo obrigatório → grava com `source=manual` e auditoria.
  - Aba de auditoria por batida (quem alterou, quando, antes/depois, motivo).

### 4. Ficha do colaborador (dados de contratação)
- Novos campos em `organization_members`: `hire_date`, `contract_type` (CLT|PJ|Estagio|Terceiro), `base_salary numeric`, `salary_composition jsonb` (lista de itens `{label, value, type: 'fixo'|'variavel'|'beneficio'|'desconto'}`), `access_active boolean default true`.
- `EmployeeRhDialog`: nova aba **Contratação** com edição desses campos + toggle **Acesso ativo no app**.
- Ao desativar acesso: chama `PATCH /api/organizations/:id/members/:userId` com `is_active=false` (fluxo existente).

### 5. Cascata de inativação
- Já existe a regra "Inactive users stripped from selections" em memória. Auditar e reforçar em:
  - CRM: seletores de owner/vendedor, filtros de equipe.
  - Metas: listas de colaboradores.
  - Relatórios agendados: pular usuários com `is_active=false`.
  - Notificações: filtrar destinatários por `is_active=true`.
- Onde faltar, adicionar `AND om.is_active = true` nas queries de listagem.

### 6. Permissões
- Adicionar chaves no template de acessos: `rh.view_all_punches`, `rh.manage_punches` (ajuste manual), `rh.view_hr_dashboard`.
- Menu/aba admin do RH só aparece com essas permissões (Owner/Admin já herdam tudo).

## Técnicas
- Timezone `America/Sao_Paulo`, gravar `timestamptz` e exibir com formato `HH:mm` local.
- Toda mutação de ponto por admin exige `reason` (400 se ausente) e escreve em `rh_punch_audit` na mesma transação.
- Kiosk passa `recognized_user_id` (via face-api) e `source='kiosk'`; se colaborador desconhecido, retorna 404 sem gravar.
- Migrações com `GRANT` explícito para `authenticated` e `service_role`.

## Fora de escopo (para próximas iterações)
- Cálculo de banco de horas / totalizadores diários (você pediu explicitamente sem soma).
- Folha de pagamento — só armazenamento da composição salarial, sem geração de holerite.
- Reconhecimento facial no Kiosk já foi entregue e é reaproveitado como está.

Confirma que sigo com essa entrega completa?