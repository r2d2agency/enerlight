# RMA de Fornecedor (Garantia com Fabricante)

Estender o módulo de Devoluções para cobrir também os RMAs abertos junto aos **fornecedores/fabricantes**, com opção de **cross-link** com um RMA de cliente (ex.: troca de luminária Blumenau — abrir garantia no fabricante e amarrar as duas ocorrências) ou **avulso** (pedido direto ao fabricante sem cliente).

## O que muda

### 1. Tipo de RMA
Novo campo `rma_type` em `devolucoes`:
- `cliente` (atual — cliente devolvendo para nós)
- `fornecedor` (nós devolvendo para o fornecedor/fabricante)

A tela de Devoluções ganha um **toggle no topo**: "RMA de Cliente" / "RMA de Fornecedor" / "Todos", filtrando o Kanban, lista e estatísticas.

### 2. Dados do Fornecedor
Novos campos para RMAs tipo `fornecedor`:
- `supplier_name`, `supplier_document` (CNPJ), `supplier_contact_name`
- `supplier_whatsapp`, `supplier_email`, `supplier_address`
- `supplier_rma_number` (número do RMA que o fornecedor gerou lá)
- `supplier_expected_return_date`
- `warranty_type` (garantia_fabrica | cortesia | troca_comercial | outro)

No formulário, quando `rma_type = fornecedor`, os campos de **cliente** somem e aparecem os campos de **fornecedor**. Quando `cliente` (padrão) segue igual.

### 3. Cross-link Cliente ↔ Fornecedor
Novo campo `linked_devolucao_id` (auto-referência em `devolucoes`).

Fluxo:
- Dentro de um RMA de cliente, botão **"Abrir RMA no Fornecedor"** — abre o dialog já com produto/serial/motivo pré-preenchidos e cria o novo RMA amarrado.
- Dentro do RMA de fornecedor, mostra card **"Vinculado ao RMA #123 do cliente X"** com link.
- Mudanças de status no RMA de fornecedor geram evento no RMA de cliente vinculado (e vice-versa).

### 4. Kanban / SLA
Reutiliza o mesmo Kanban, mas os status ganham labels contextuais quando `rma_type = fornecedor`:
- `solicitado` → "Solicitado ao Fornecedor"
- `aguardando_nf_produto` → "Aguardando NF/Produto p/ Envio"
- `enviado` → "Enviado ao Fornecedor"
- `recebido` → "Recebido pelo Fornecedor"
- `em_analise` → "Em Análise (Fornecedor)"
- `troca_conserto` → "Fornecedor aprovou troca/conserto"
- `concluido` → "Concluído (Recebido de volta)"

SLA config existente segue funcionando para os dois tipos.

### 5. Filtros e Estatísticas
Na página `Devoluções`:
- Filtro adicional por **Fornecedor** (quando view = fornecedor).
- Stats separados por tipo: total abertos com cliente vs. total abertos com fornecedor, valor em garantia pendente no fornecedor.
- Coluna "Vinculado" na tabela mostrando ícone quando há cross-link.

### 6. Cobrança de Fornecedor
Campo `supplier_charge_status` (pendente | cobrado | recebido_credito | recebido_produto | perdido) + `supplier_credit_value` para acompanhar quanto o fornecedor deve em crédito/produto — permite fechar o ciclo financeiro.

## Detalhes técnicos

### Backend
- **Migração** (`backend/schema-devolucoes-supplier.sql`, aplicada via `IF NOT EXISTS` para os `ALTER TABLE`):
  - `ALTER TABLE devolucoes ADD COLUMN rma_type VARCHAR(15) DEFAULT 'cliente'`
  - Colunas de fornecedor listadas acima + `linked_devolucao_id UUID REFERENCES devolucoes(id) ON DELETE SET NULL`
  - `supplier_charge_status`, `supplier_credit_value`
  - Índices em `rma_type`, `linked_devolucao_id`, `supplier_name`
  - Relaxar `customer_name NOT NULL` → default vazio (fornecedor não precisa)
- **Rotas** (`backend/src/routes/devolucoes.js`):
  - `GET /api/devolucoes` — aceitar `?rma_type=fornecedor|cliente|all` e `?supplier=`
  - `POST /api/devolucoes` — validar campos conforme `rma_type`
  - `GET /api/devolucoes/:id` — retornar dados do RMA vinculado (via JOIN em `linked_devolucao_id`)
  - `POST /api/devolucoes/:id/link-supplier` — cria RMA de fornecedor herdando dados
  - Stats endpoint segregado por tipo

### Frontend
- `use-devolucoes.ts`: novo campo `rma_type` no tipo `Devolucao`, filtros extras
- `src/pages/Devolucoes.tsx`: tabs/toggle "Cliente | Fornecedor | Todos", filtro Fornecedor
- `DevolucaoFormDialog.tsx`: seção condicional Cliente vs. Fornecedor, seleção de tipo no topo
- `DevolucaoKanban.tsx`: labels contextuais + badge "Fornecedor" no card
- `DevolucaoDetail` (dialog existente): botão "Abrir RMA no Fornecedor" + card de vínculo

## Não incluso (fora do escopo)
- Integração automática com sistema/portal de RMA do fornecedor (é registro manual).
- Emissão de NF de remessa ao fornecedor (segue nos campos já existentes de NF de saída, mas rotulados como "NF para Fornecedor" quando `rma_type = fornecedor`).

Posso seguir com a implementação?