Para que os cadastros da calculadora apareçam no módulo de Prospects do CRM, precisamos ajustar o endpoint de cadastro no backend para que ele crie um registro na tabela `crm_prospects` da organização, em vez de criar uma negociação (deal) para o superadmin. Além disso, vamos implementar o salvamento automático do histórico de simulações realizadas por cada prospect.

### Alterações no Backend:
- **`backend/src/routes/public.js`**:
    - Ajustar a rota `/pre-register` para:
        1. Identificar o usuário superadmin e sua organização (como já faz).
        2. Inserir o novo lead diretamente na tabela `crm_prospects` da organização.
        3. Adicionar campos como `company`, `city` e `state` que o usuário agora preenche.
    - Criar uma nova rota pública `/save-project` para salvar o histórico de cálculos luminotécnicos:
        - Receberá os dados do cálculo e o email/telefone do prospect.
        - Salvará o projeto vinculado ao prospect (provavelmente em um campo JSONB de histórico ou uma nova tabela de projetos).

### Alterações no Frontend:
- **`src/pages/CalculadoraLuminotecnica.tsx`**:
    - Após cada cálculo bem-sucedido (quando o usuário clica para ver o resultado ou imprimir), enviar os dados para o novo endpoint de histórico.
    - Garantir que o formulário de cadastro capture corretamente `empresa`, `cidade` e `estado`.
- **`src/pages/CRMLuminotecnicoProspects.tsx`**:
    - Adicionar uma aba ou botão para visualizar o "Histórico de Projetos" de cada prospect.

### Melhorias no CRM:
- Exibir a lista de projetos gerados diretamente no detalhe do prospect ou em uma coluna dedicada.
