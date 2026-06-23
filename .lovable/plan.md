
# Módulo de Devoluções (RMA)

Vou criar um módulo completo para organizar todo o processo de devolução da Enerlight, desde a solicitação do cliente até a resolução final (troca, conserto ou reembolso), incluindo controle de notas fiscais e fretes (entrada e saída).

## Fluxo do processo (Kanban)

Cada devolução passa por etapas claras, visualizadas em um Kanban:

```text
Solicitado → Aguardando NF/Produto → Recebido → Em Análise/Teste →
Cliente Notificado → Aguardando NF Retorno → Troca/Conserto em Andamento →
Enviado ao Cliente → Concluído  (ou Recusado / Cancelado)
```

## Dados de cada devolução

**Identificação**
- Número sequencial (DEV-0001)
- Cliente (vinculado ao contato/empresa do CRM)
- Vendedor responsável + canal de abertura (SAC ou Vendedor)
- Data da solicitação, prioridade, motivo (defeito, arrependimento, erro de envio, garantia, outro)

**Produto**
- Descrição, código/SKU, quantidade, número de série
- Pedido/NF de venda original (opcional)
- Fotos e anexos

**Recebimento**
- NF de devolução do cliente (número, chave, data, valor)
- Data de recebimento físico
- Quem recebeu

**Análise técnica**
- Status do teste (com defeito / sem defeito / fora de garantia)
- Laudo técnico (texto + fotos)
- Decisão: troca, conserto, reembolso, descarte, devolver ao cliente

**Saída (envio de volta)**
- NF de saída (número e data) quando houver troca/conserto
- Rastreio e transportadora

**Fretes (controle financeiro)**
- Frete de entrada (recebimento) — transportadora, valor, código de rastreio, status
- Frete de saída (envio) — idem
- Total de custo do caso

**Comunicação**
- Histórico/timeline de eventos
- Notas internas
- Notificação ao cliente (registro de quando e como foi avisado)

## Telas

1. **Lista / Kanban** (`/devolucoes`) — alternar entre visão Kanban (por status) e lista/tabela com filtros (cliente, vendedor, motivo, período, status do frete).
2. **Dashboard** — cards de KPIs: abertas, em teste, aguardando NF, concluídas no mês, custo total de fretes, tempo médio de resolução, top motivos.
3. **Detalhe da devolução** (dialog/drawer) com abas:
   - Resumo (cliente, produto, status, timeline)
   - Recebimento (NF de entrada + frete de entrada)
   - Análise técnica (laudo, fotos, decisão)
   - Envio (NF de saída + frete de saída)
   - Anexos
   - Histórico
4. **Nova devolução** — formulário guiado (cliente → produto → motivo → fotos).

## Permissões (RBAC)

- **Vendedor / SAC**: cria devolução, vê as suas e do seu grupo, edita até a etapa "Recebido".
- **Logística / Almoxarifado**: confirma recebimento, lança NF de entrada e frete de entrada.
- **Técnico**: preenche laudo e decisão.
- **Gestor / Owner / Superadmin**: vê tudo, edita tudo, gera relatórios.
- Segue o padrão `has_role` e isolamento por `organization_id` já usado no sistema.

## Backend

- Nova migration `backend/schema-devolucoes.sql` com tabelas:
  - `devolucoes` (caso principal, status, vínculos, datas, totais de frete)
  - `devolucao_itens` (produtos)
  - `devolucao_eventos` (timeline/histórico automático a cada mudança)
  - `devolucao_anexos` (fotos, NFs em PDF, laudos)
- Rota `backend/src/routes/devolucoes.js` com CRUD, mudança de status, upload de anexos, registro de NFs e fretes.
- Registrada em `backend/src/index.js` como `/api/devolucoes`.
- GRANTs e RLS conforme o padrão do projeto.

## Frontend

- Página `src/pages/Devolucoes.tsx` (Kanban + lista + dashboard).
- Componentes em `src/components/devolucoes/`:
  - `DevolucaoKanban.tsx`
  - `DevolucaoList.tsx`
  - `DevolucaoFormDialog.tsx` (criar/editar)
  - `DevolucaoDetailDialog.tsx` (abas)
  - `DevolucaoTimeline.tsx`
  - `FreteFormSection.tsx`
- Hook `src/hooks/use-devolucoes.ts` (React Query: listar, criar, atualizar, mover status, anexar).
- Item de menu no `MainLayout` + rota protegida em `App.tsx`.

## Notificações

- Notificação interna ao vendedor quando o produto for recebido e quando o laudo for concluído.
- (Futuro/opcional) envio automático de WhatsApp ao cliente nos momentos chave usando a integração existente — deixarei o gancho pronto, mas sem disparo automático nesta entrega para evitar mensagens indevidas.

## Entregáveis

- Migration SQL pronta para rodar no deploy.
- API completa com isolamento por organização.
- UI Kanban + detalhe + criação, alinhada ao restante do sistema (mesmos componentes shadcn, mesma identidade visual).
- Item de menu "Devoluções" na navegação.

Posso seguir com a implementação?
