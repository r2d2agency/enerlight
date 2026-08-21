# Sprint 7: PDF e capas personalizadas

## Requisitos
- Geração de orçamento em PDF com capa personalizada.
- A capa é vinculada à categoria da tabela de preços.
- Fluxo: Visualizar -> Baixar -> Compartilhar.
- Layout restrito a administradores.

## Backend
- Criado `backend/src/utils/pdf-generator.js` usando `pdfkit`.
- Atualizado `backend/src/routes/representatives.js` com endpoint `GET /quotes/:id/pdf`.
- Suporte a `custom_cover_url` puxado da tabela `price_lists`.

## Frontend
- Atualizado `RepQuotes.tsx` com ações de Visualizar, Baixar e Compartilhar.
- Integração com `navigator.share` para dispositivos móveis.
- Feedback visual com `sonner` toasts.

## Instrução de Sistema
- Atualizada em `src/components/system-instruction.txt`.