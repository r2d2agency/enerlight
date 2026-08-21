# Módulo de Representantes - Sprint 1

O objetivo desta sprint é implementar o módulo independente de **Representantes**, integrando-o ao sistema existente através do CRM, permitindo que representantes gerenciem suas próprias negociações, orçamentos e visualizem suas comissões em um ambiente isolado.

## User Interface (Frontend)

### 1. Dashboard do Representante
- Refatorar a página `RepresentanteDashboard.tsx` para focar em indicadores de performance (KPIs).
- **KPIs Principais:**
  - Faturamento MTD (Mês Atual).
  - Valor Total de Comissões.
  - Negociações Abertas.
  - Orçamentos em Rascunho.
- Adicionar atalhos rápidos para "Nova Negociação" e "Ver Catálogo".

### 2. Fluxo de Negociação e Orçamento
- Integrar o `DealFormDialog.tsx` no dashboard do representante.
- Quando o representante criar uma negociação, ela será vinculada automaticamente ao seu ID.
- Permitir que o representante gere um PDF de orçamento diretamente da negociação (vinculando itens de tabelas de preço).

### 3. Tabelas de Preços e Catálogo
- Criar a visualização de **Catálogo de Produtos** (Galeria e Lista) baseada nas `price_lists`.
- Implementar filtros por Categoria, Subcategoria e Marca.
- Adicionar funcionalidade de "Carrinho" para compor orçamentos a partir do catálogo.

### 4. Permissões e Acesso
- Garantir que usuários com perfil "Representante" (conforme definido no `AuthContext`) vejam apenas o menu "Representantes" no `Sidebar.tsx`.
- Implementar isolamento de dados: representantes só veem seus próprios clientes e orçamentos.

## Business Logic (Backend)

### 1. Isolamento de Dados
- Atualizar `backend/src/routes/crm.js` e `backend/src/routes/online-quotes.js` para garantir que representantes (`representative_id`) só acessem registros vinculados a eles.
- Implementar lógica de "Clientes Exclusivos": clientes criados pelo representante não aparecem na base geral para outros vendedores (exceto admins).

### 2. Conversão e Notificação
- Implementar endpoint para converter orçamento em venda (atualizando status no CRM).
- Adicionar gatilho de notificação (WhatsApp/Push) para o vendedor interno responsável quando um representante fechar um negócio.

### 3. Controle de Comissão
- Refinar o motor de comissões (`backend/src/routes/commission.js`) para calcular bônus específicos de representantes baseados em tabelas de markup.

## Technical Details

### Database Schema
- As tabelas `price_lists` e `price_list_items` já existem (conforme `repair-db.js`).
- Adicionar coluna `representative_id` na tabela `contacts` para isolamento de clientes.
- Criar tabela `cart_items` para persistência temporária do carrinho por usuário.

### Security
- RLS (Row Level Security) via funções SQL no backend para filtrar queries por `representative_id`.
- Validação rigorosa de tokens JWT para garantir que um representante não acesse o `organization_id` global sem as devidas permissões.
