# Plano para correção dos erros 500 no módulo de Orçamentos Online

Identifiquei que os erros 500 no módulo de Orçamentos ocorrem principalmente devido a inconsistências na recuperação do contexto da organização do usuário e a possíveis conflitos de rotas duplicadas no backend.

## Alterações Propostas

### Backend
1.  **Refatoração do Contexto do Usuário:** Ajustar a função `getUserContext` em `backend/src/routes/online-quotes.js` para ser mais robusta, garantindo que usuários sem vínculo de organização não causem falhas fatais e tratando casos de múltiplos vínculos de forma consistente.
2.  **Remoção de Rotas Duplicadas:** Eliminar a definição duplicada do endpoint `/companies/create-from-quote` que foi identificada no final do arquivo, mantendo apenas a versão mais completa.
3.  **Padronização de Logs e Erros:** Garantir que todos os blocos `catch` utilizem `logError` para facilitar a depuração e que as verificações de permissão sejam consistentes em todos os endpoints.
4.  **Resiliência em Consultas SQL:** Refinar as consultas de permissões para evitar erros quando parâmetros opcionais (como templates de permissão) estiverem vazios.

### Frontend
1.  **Validação de Contexto:** Adicionar verificações nos hooks de Orçamentos Online para evitar chamadas de API desnecessárias quando o usuário ainda não tiver um contexto de organização carregado.

## Detalhes Técnicos
- Arquivos afetados: `backend/src/routes/online-quotes.js`
- Foco em: `getUserContext`, `GET /templates`, `GET /price-lists`, `GET /quotes` e `POST /companies/create-from-quote`.
