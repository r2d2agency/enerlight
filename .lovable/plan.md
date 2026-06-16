# Hub da Vendedora — gestão de múltiplos Representantes

Criar uma área onde a Vendedora vê todos os Representantes que ela gerencia (via Grupos existentes), entra no Kanban de cada um e executa ações em lote sem precisar abrir deal por deal.

## 1. Visibilidade via Grupos (sem schema novo)

Aproveita o vínculo já existente:
- `crm_representatives.linked_user_id` → usuário (vendedor) responsável pelo representante
- Tabela `group_members` já existe

Regra de acesso ao "Hub de Representantes":
- **Owner / Superadmin / Admin**: vê todos os representantes da org
- **Manager / Vendedora com grupo**: vê representantes cujo `linked_user_id` pertença a algum dos seus grupos
- **Representante (usuário comum)**: vê só o próprio (já é o comportamento atual)

Implementado no backend em `routes/representatives.js` (novo endpoint `GET /representatives/hub`) e reaproveitando a lógica de `manager-team-view` (mem://features/crm/manager-team-view).

## 2. Nova página: Hub de Representantes

Rota: `/crm/representantes-hub` (item novo na sidebar dentro do grupo CRM, visível só se `can_view_representatives` e o usuário tiver >1 representante acessível).

Layout — lista/grid de cards, um por Representante:

```text
┌─────────────────────────────────────────┐
│ João Silva                    [Abrir →] │
│ 12 deals abertos · R$ 145.000 em pipe   │
│ Lead 3 · Qualificação 4 · Proposta 5    │
│ ⚠ 2 deals parados há +15 dias           │
└─────────────────────────────────────────┘
```

- Busca por nome
- Ordenação: nome, valor em pipe, qtd. deals, deals parados
- Filtro: "com deals parados", "sem atividade nos últimos 7 dias"
- Clicar em "Abrir" → navega para `/crm/negociacoes?representative_id=<id>` (CRMNegociacoes já tem filtro de representante, só garantir leitura do query param)

## 3. Kanban por Representante + barra de seleção em lote

Em `CRMNegociacoes`, quando `?representative_id` está presente:
- Mostra breadcrumb "← Hub › Kanban de João Silva"
- Ativa um botão **"Modo seleção"** que liga `selectionMode` no `KanbanBoard` (já existe `selectionMode`, `selectedDealIds`, `onToggleSelect`)
- Aparece uma **barra de ações em lote** fixada no rodapé enquanto houver seleção:
  - **Mover para etapa…** (dropdown com as etapas do funil → PATCH em massa)
  - **Reatribuir a representante…** (dropdown com os representantes do hub → atualiza `representative_id`)
  - **Adicionar tarefa em massa** (abre dialog leve: título, tipo, prazo → cria 1 tarefa por deal selecionado)
  - **Comentar em massa** (textarea → insere a mesma nota no histórico de cada deal)
  - Botão "Limpar seleção"

## 4. Endpoints novos (backend)

Em `backend/src/routes/representatives.js`:
- `GET /representatives/hub` → retorna representantes acessíveis + agregados (qtd deals por etapa, valor total em pipe, qtd parados, último movimento)

Em `backend/src/routes/crm.js` (ou similar):
- `PATCH /deals/bulk/stage` → `{ deal_ids[], stage_id }`
- `PATCH /deals/bulk/representative` → `{ deal_ids[], representative_id }`
- `POST /deals/bulk/note` → `{ deal_ids[], content }`
- `POST /deals/bulk/task` → `{ deal_ids[], title, type, due_date }`

Todas validam que cada `deal_id` pertence a um representante visível ao usuário (mesma regra do Hub) e gravam snapshot de auditoria (mem://features/crm/audit-history-snapshots).

## 5. Frontend — novos arquivos

- `src/pages/RepresentativesHub.tsx` — página com cards/lista
- `src/components/crm/BulkActionsBar.tsx` — barra fixa de ações em lote
- `src/components/crm/BulkTaskDialog.tsx` + `BulkNoteDialog.tsx`
- `src/components/crm/BulkReassignRepDialog.tsx`
- `src/hooks/use-representatives-hub.ts` — fetch do hub + mutations em lote
- Edits em `src/pages/CRMNegociacoes.tsx` (breadcrumb, modo seleção, barra), `src/components/layout/Sidebar.tsx` (item Hub), `src/App.tsx` (rota)

## 6. Permissões e segurança

- Toda mutação em lote chama a mesma função de autorização que filtra os deals visíveis — se algum `deal_id` não passar, é descartado silenciosamente e retorna `{ updated: N, skipped: M }`.
- Logs por deal no histórico (`crm_indicator_history` / histórico de deal) com `user_name` snapshot.
- Inativos continuam ocultos das listas de reatribuição (mem://features/organization-management/user-status-and-deactivation).

## 7. O que NÃO entra agora (pode virar follow-up)

- Swimlanes por representante no mesmo Kanban
- Dashboard consolidado com gráficos (já existe metas)
- Vínculo N:N (vários gestores por representante) — fica para depois se precisar

---

**Quer que eu siga com essa implementação?** Se sim, começo pelos endpoints + Hub e depois ligo a barra de ações em lote no Kanban existente.