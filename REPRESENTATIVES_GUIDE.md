# 📋 Guia: Sistema de Representantes (Enerlight)

## 🎯 Visão Geral

O sistema de representantes é **completamente isolado** do CRM principal. Um representante é um **registro no banco de dados**, não um usuário do sistema completo.

### Fluxo de Acesso

```
Admin/Manager
    ↓
/crm/representantes/admin (AdminRepresentativeConfig)
    ├→ Criar/editar representantes
    ├→ Vincular usuários do sistema
    └→ Configurar comissões e áreas
         ↓
Usuário vinculado ao Representante
    ↓
/crm/representante-dashboard (RepresentanteDashboard - Portal)
    ├→ Ver APENAS seus clientes
    ├→ Ver APENAS seus orçamentos
    ├→ Ver APENAS seus pedidos
    └→ Criar orçamentos com tabelas de preço
```

---

## ⚙️ Para Administradores

### 1️⃣ Acessar Configuração de Representantes

1. **Menu**: `CRM` → `Config. Representantes` (nova opção)
2. Ou direto em: `/crm/representantes/admin`

### 2️⃣ Criar um Novo Representante

1. Clique em **"Novo Representante"**
2. Preencha:
   - **Nome**: Nome completo
   - **Tipo**: Representante / Parceiro / Indicador / Instalador
   - **Email**: Email de contato
   - **Telefone**: Telefone de contato
   - **CPF/CNPJ**: Documento
   - **Comissão**: Percentual (ex: 5.00%)
   - **Usuário Vinculado**: Selecione um usuário do sistema
   - **Cidade/Estado**: Localização

3. Clique em **"Criar"**

### 3️⃣ Filtrar e Buscar Representantes

- **Buscar**: Por nome
- **Filtrar por Tipo**: Representante, Parceiro, Indicador, Instalador
- **Filtrar por Status**: Ativo, Inativo

### 4️⃣ Editar Representante

1. Clique no botão **"Editar"** na linha
2. Modifique os dados
3. Clique em **"Atualizar"**

### 5️⃣ Deletar Representante

1. Clique no botão **"Deletar"** (ícone lixeira)
2. Confirme na dialog
3. ⚠️ Isso é **irreversível** e limpa todas as referências

---

## 👤 Para Representantes (Portal)

### 1️⃣ Acessar o Portal

1. **Menu**: `Representantes` → `Painel Representante`
2. Ou direto em: `/crm/representante-dashboard`
3. ⚠️ Você só acessa se estiver **vinculado a um representante** pelo admin

### 2️⃣ Adicionar Cliente

1. Clique em **"Novo Cliente"**
2. Preencha:
   - **Razão Social**: Obrigatório
   - **Nome Fantasia**: Opcional
   - **CNPJ**: Opcional
   - **Contato**: Nome e telefone
   - **Endereço**: Completo
   - **Observações**: Notas adicionais

3. Clique em **"Salvar"**

### 3️⃣ Criar Orçamento

1. Clique em **"Novo Orçamento"**
2. Selecione:
   - **Cliente**: Um dos seus clientes
   - **Tabela de Preço**: Disponibilizada pelo admin
3. Adicione itens:
   - Selecione produtos da tabela
   - Defina quantidade e preço unitário
4. Revise o total
5. Clique em **"Salvar"**

### 4️⃣ Converter Orçamento em Pedido

1. Na aba **"Orçamentos"**
2. Selecione um orçamento em status "Draft"
3. Clique em **"Converter para Pedido"**
4. O pedido aparecerá na aba **"Pedidos"** com status "Pending"

### 5️⃣ Visualizar Dados

- **Dashboard**: Resumo (clientes, orçamentos, pedidos, total em R$)
- **Clientes**: Lista com filtros
- **Orçamentos**: Lista com status (Draft, Sent, Approved, Rejected)
- **Pedidos**: Lista com status de integração com ERP

---

## 🔒 Isolamento de Dados (Validação)

### O que é Isolado?

```
Representante A
├─ Clientes: Ver APENAS seus clientes
├─ Orçamentos: Ver APENAS seus orçamentos
├─ Pedidos: Ver APENAS seus pedidos
└─ Tabelas de Preço: Ver TODAS (compartilhadas)

Representante B
├─ Clientes: Ver APENAS seus clientes (não vê A)
├─ Orçamentos: Ver APENAS seus orçamentos (não vê A)
├─ Pedidos: Ver APENAS seus pedidos (não vê A)
└─ Tabelas de Preço: Ver TODAS (compartilhadas)
```

### Como Validar?

Execute no terminal:

```bash
node validate-representatives.js
```

Isso verifica:
- ✓ Estrutura do banco de dados
- ✓ Isolamento de dados por representante
- ✓ Integridade referencial (sem dados orfãos)
- ✓ Permissões configuradas
- ✓ Vinculação usuário ↔ representante

---

## 🛣️ Rotas da API

### Administrativas (requerem permissão `can_view_representatives`)

```
GET    /api/crm/representatives         - Listar todos
GET    /api/crm/representatives/:id     - Detalhe 1
POST   /api/crm/representatives         - Criar
PUT    /api/crm/representatives/:id     - Atualizar
DELETE /api/crm/representatives/:id     - Deletar
```

### Portal (requerem vinculação com representante)

```
GET    /api/representative-portal/me              - Dados do representante logado
GET    /api/representative-portal/dashboard       - Resumo (clientes, orçamentos, pedidos)
GET    /api/representative-portal/companies       - Listar clientes
POST   /api/representative-portal/companies       - Criar cliente
GET    /api/representative-portal/quotes          - Listar orçamentos
POST   /api/representative-portal/quotes          - Criar orçamento
GET    /api/representative-portal/orders          - Listar pedidos
GET    /api/representative-portal/price-lists     - Tabelas de preço
GET    /api/representative-portal/price-lists/:id/items - Itens da tabela
```

---

## 📊 Tabela de Permissões

| Permissão | O que faz | Quem precisa |
|-----------|----------|-------------|
| `can_view_representative_dashboard` | Acesso ao portal (painel pessoal) | Representantes |
| `can_view_representatives` | Gestão de representantes (CRUD) | Admins/Managers |
| `can_manage_representative_config` | Configuração de tabelas de preço | Admins/Managers |
| `can_view_all_representative_quotes` | Hub: ver orçamentos de todos os reps | Supervisores/Managers |

---

## 🚀 Checklist de Setup Inicial

- [ ] **Admin criou representantes** em `/crm/representantes/admin`
- [ ] **Usuários vinculados** a representantes
- [ ] **Tabelas de preço criadas** em `/crm/representantes/config`
- [ ] **Representantes acessam portal** em `/crm/representante-dashboard`
- [ ] **Validação rodou sem erros**: `node validate-representatives.js`

---

## ⚠️ Troubleshooting

### "Usuário sem vínculo com representante"

**Causa**: Usuário não está vinculado a um representante

**Solução**:
1. Vá para `/crm/representantes/admin`
2. Edite ou crie um representante
3. Selecione o usuário em "Usuário Vinculado"
4. Clique "Atualizar"

### "Acesso negado" ao portal

**Causa**: Permissão `can_view_representative_dashboard` não configurada

**Solução**:
1. Vá para `/admin`
2. Vá para "Permissões"
3. Localize o usuário
4. Marque `can_view_representative_dashboard`

### Dados desaparecendo/duplicando

**Solução**: Execute validação
```bash
node validate-representatives.js
```

Se houver "dados orfãos", execute verificação de integridade no BD.

---

## 📞 Suporte

- **Erro 403 (Acesso Negado)**: Verificar permissões e vinculação
- **Erro 404 (Não encontrado)**: Verificar se o representante existe
- **Erro 500**: Verificar logs do backend

---

*Última atualização: 2026-08-31*
