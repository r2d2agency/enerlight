# Módulo NFC — Ener ID

Plataforma completa para vincular cartões NFC físicos a vendedores, com landing page pública de contato, captura de leads em materiais e analytics de leituras.

## Escopo

### 1. Backend — Banco de dados
Novo schema `backend/schema-nfc.sql` com tabelas:

- **nfc_cards**: `id`, `uid` (único), `chip_type` (NTAG213/215/216), `status` (active/inactive/blocked), `user_id`, `organization_id`, `company_id` (opcional, p/ multiempresa interna), `public_slug` (curto, ex `ABC123`), `public_url`, `qr_code_url`, `activated_at`, `created_at`, `updated_at`. GRANTs + RLS por organização.
- **nfc_card_profiles**: dados do vCard/landing por cartão (foto, cargo, telefone, whatsapp, email, site, linkedin, instagram, endereço, bio, theme). 1:1 com `nfc_cards`. Permite personalização sem mexer no usuário.
- **nfc_materials**: materiais por organização/cartão (`title`, `type` catalogo/pdf/video/case, `file_url`, `thumbnail`, `requires_lead` bool default true).
- **nfc_reads** (analytics): `card_id`, `read_at`, `ip`, `city`, `state`, `country`, `device`, `browser`, `os`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer`.
- **nfc_leads**: lead capturado em download de material — `card_id`, `material_id`, `name`, `whatsapp`, `email`, `company`, `role`, `utm_*`, `created_at`. Vínculo automático ao vendedor (`user_id` do cartão).

### 2. Backend — Rotas (`backend/src/routes/nfc.js`)
Autenticadas (admin/owner):
- `GET /api/nfc/cards` — listagem com filtros (status, user_id, organization, período).
- `POST /api/nfc/cards` — cria cartão (gera `public_slug`, `public_url`, `qr_code_url`).
- `PATCH /api/nfc/cards/:id` — atualiza status, vínculo de usuário, perfil.
- `DELETE /api/nfc/cards/:id`.
- `GET /api/nfc/dashboard` — agregados (ativos, inativos, vinculados, leituras totais/hoje/mês, top vendedores).
- `GET /api/nfc/cards/:id/reads` — analytics detalhados.
- `GET /api/nfc/cards/:id/leads`.
- `POST /api/nfc/materials`, `GET/PATCH/DELETE` correspondentes.

Públicas (sem auth):
- `GET /api/nfc/public/:slug` — dados do cartão + perfil + materiais (registra read com geo via IP + UA parse).
- `GET /api/nfc/public/:slug/vcard` — retorna `.vcf` (Content-Type `text/vcard`).
- `POST /api/nfc/public/:slug/lead` — registra lead e devolve URL assinada do material.

Registrar em `backend/src/index.js`.

### 3. Frontend — Admin

**Página `src/pages/CartoesNFC.tsx`** (rota `/cartoes-nfc`, no menu lateral com ícone `CreditCard`/`Nfc`):
- Dashboard topo: 5 cards de métricas + gráfico de leituras (recharts) + top vendedores.
- Tabela de cartões com filtros (Empresa, Usuário, Status, Período).
- Botão "Novo Cartão" abre `NfcCardDialog`.

**`src/components/nfc/NfcCardDialog.tsx`** — tela "Associar Cartão":
- Detecção via Web NFC (`NDEFReader`) quando disponível: ao aproximar, preenche UID e chip_type automaticamente. Fallback campo manual.
- Mostra UID, chip, status, empresa, usuário, URL gerada.
- Botões: **Associar Cartão**, **Gravar URL NFC**, **Testar Cartão** (abre landing em nova aba), **Visualizar Landing Page**.
- "Gravar URL NFC": `await new NDEFReader().write({ records:[{ recordType:'url', data: public_url }] })` com toast de sucesso/erro. Quando não suportado, exibe `NfcWriteTutorial` com passos do NFC Tools.

**`src/components/nfc/NfcAnalyticsPanel.tsx`** — drawer com leituras (data/hora, IP, cidade, dispositivo) e leads do cartão.

**`src/hooks/use-nfc.ts`** — React Query: `useNfcCards`, `useNfcDashboard`, `useCreateNfcCard`, `useUpdateNfcCard`, `useWriteNfcTag` etc.

### 4. Frontend — Landing pública

**Rota pública** `/c/:slug` em `src/pages/PublicNfcCard.tsx` (registrada em `App.tsx` fora do `ProtectedRoute`):

Estrutura mobile-first, premium (azul petróleo `#0c2340`, azul elétrico `#3b82f6`, branco, verde WhatsApp `#25D366`):
- **Hero**: foto, nome, cargo, empresa, logo.
- **Botões rápidos**: WhatsApp (verde), Ligar, E-mail, Site, Localização (maps), **Salvar Contato** (baixa `.vcf`).
- **Meus Contatos**: lista clicável com ícones.
- **Empresa**: logo + descrição.
- **Materiais**: grid de cards. Click em material com `requires_lead=true` abre `LeadCaptureModal` (nome, whatsapp, empresa, cargo). Após submit: libera download + registra lead + UTM da URL.
- SEO: title/description dinâmicos, OG image com foto, JSON-LD `Person`.

Contatos **sempre públicos**, sem bloqueio. Lead capture só em materiais.

### 5. vCard
Geração server-side em `backend/src/routes/nfc.js`:
```
BEGIN:VCARD
VERSION:3.0
FN:{nome}
ORG:{empresa}
TITLE:{cargo}
TEL;TYPE=CELL:{telefone}
TEL;TYPE=WORK:{whatsapp}
EMAIL:{email}
URL:{site}
ADR:;;{endereço}
END:VCARD
```
Compatível iOS/Android.

### 6. Tracking
- Middleware na rota pública parseia `User-Agent` (lib `ua-parser-js`) e resolve geo por IP (usar `req.ip` + serviço gratuito tipo `ipapi.co` com cache). UTMs lidos do query string.
- Pixel/Analytics avançados ficam para o Plano Pro (placeholder de config).

## Diferenciação por plano
Flag `nfc_plan` em `nfc_cards` (`card` | `pro`). Pro libera: leads/UTM/SEO/pixel/forms/materiais avançados. Card mostra só landing + vCard + redes. UI esconde recursos conforme plano.

## Estrutura de arquivos

```text
backend/
  schema-nfc.sql
  src/routes/nfc.js
src/
  pages/
    CartoesNFC.tsx            # admin
    PublicNfcCard.tsx         # /c/:slug
  components/nfc/
    NfcCardDialog.tsx
    NfcWriteTutorial.tsx
    NfcAnalyticsPanel.tsx
    LeadCaptureModal.tsx
    VCardButton.tsx
  hooks/use-nfc.ts
  lib/nfc-web-api.ts          # wrapper NDEFReader
```

## Pontos de atenção
- Web NFC só funciona em Chrome Android via HTTPS. UI deve detectar (`'NDEFReader' in window`) e ocultar/explicar.
- `public_slug` gerado com nanoid (6-8 chars, base58, sem ambiguidade).
- Rate limit na rota pública de lead (já há padrão no projeto).
- RLS: leitura pública liberada via rota backend (service_role), não via PostgREST direto.
- Memória do projeto: timezone America/Sao_Paulo nas datas; respeitar limite 100MB upload de materiais.

## Fora do escopo desta entrega
- Editor visual do tema da landing (cores customizadas por cartão) — fica para iteração 2.
- Integração com Meta Pixel / GA4 — preparar campos no schema, UI fica para Pro v2.
- Impressão/pedido físico de cartões.

Confirma para eu implementar?
