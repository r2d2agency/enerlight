# Plano de Implementação - Sprint 5: Clientes Exclusivos do Representante

Este plano detalha a criação de uma base de dados de clientes isolada para o módulo de Representantes, garantindo privacidade e autonomia para cada representante.

## Alterações Técnicas

### Banco de Dados (Backend)
- **Tabela `rep_customers`**: Criar tabela para armazenar os clientes exclusivos dos representantes.
    - Campos: `id`, `representative_id`, `name` (razão social), `trading_name` (fantasia), `cpf_cnpj`, `contact_name`, `phone`, `email`, `address`, `city`, `state`, `zip_code`, `notes`, `created_at`, `updated_at`.
    - Índice em `representative_id` para performance e isolamento.
- **Isolamento de Dados**: Garantir que as rotas de API filtrem obrigatoriamente pelo `representative_id` do usuário logado.

### API (Backend)
- Criar rotas em `backend/src/routes/representatives.js` (ou similar):
    - `GET /api/representatives/customers`: Listar clientes do representante logado.
    - `POST /api/representatives/customers`: Cadastrar novo cliente.
    - `PUT /api/representatives/customers/:id`: Editar cliente.
    - `GET /api/representatives/customers/:id/quotes`: Histórico de orçamentos do cliente.

### Frontend
- **Página `RepCustomers.tsx`**: Nova página para gestão de clientes.
    - Lista com busca e filtros.
    - Modal/Formulário para cadastro e edição.
    - Visualização de detalhes com histórico de orçamentos vinculados.
- **Integração no Checkout**: Atualizar o formulário de finalização de orçamento no `RepresentativeCatalog.tsx` para permitir a seleção de clientes desta nova base exclusiva.
- **Sidebar**: Adicionar o item "Clientes" ao menu do representante.

## Próximos Passos
1. Criar a migração para a tabela `rep_customers`.
2. Implementar as rotas de CRUD no backend com validação de representante.
3. Desenvolver a interface de gestão de clientes no frontend.
4. Conectar a seleção de clientes no fluxo de orçamento.
