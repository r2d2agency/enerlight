# Sprint 8 & 9: Conversão em Venda e Dashboard de Comissões

## Sprint 8: Conversão em Venda
- Implementar fluxo de conversão de orçamento para venda no portal do representante.
- Mudança de status para "Convertido".
- Notificações para vendedores internos com detalhes do orçamento e representante.
- Registro de auditoria (data, hora, responsável) e prevenção de duplicidade.

## Sprint 9: Dashboard e Comissões
- Dashboard avançado para representantes:
    - KPIs: Criados no mês, Convertidos, Taxa de Conversão, Valor Total, Comissão Estimada.
    - Comparativos mensais e listas de orçamentos recentes/aguardando.
- Extrato de Comissões:
    - Listagem detalhada por venda: Cliente, Data, Valor, Percentual e Status da comissão.
    - Cálculo automático baseado no percentual do cadastro do representante.

## Backend
- Rota `POST /api/representatives/quotes/:id/convert` para lidar com a lógica de conversão e notificações.
- Rota `GET /api/representatives/stats` para alimentar o dashboard consolidado.
- Rota `GET /api/representatives/commissions` para o extrato detalhado.

## Frontend
- Botão "Converter em Venda" em `RepQuotes.tsx` com diálogo de confirmação.
- Refatoração de `RepDashboard.tsx` para incluir os novos widgets e gráficos.
- Nova página ou aba `RepCommissions.tsx` para o extrato.