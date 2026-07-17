# Assinatura de Contrato com Biometria + OTP + Rastreio Público

Reaproveita o módulo existente `doc_signature_*`. Não cria um módulo novo.

## 1. Banco de Dados (backend/schema-document-signatures.sql — ALTER)

Adicionar em `doc_signature_signers`:
- `selfie_url TEXT`, `document_front_url TEXT`, `document_back_url TEXT`
- `face_match_score DECIMAL(5,4)` — score do face-api (0..1)
- `face_validation_status VARCHAR(30)` — `pending|passed|failed`
- `face_validation_details JSONB`

Nova tabela `doc_signature_otps` (OTP a cada tentativa):
- `id, signer_id, code_hash, code_salt, sent_to_email, expires_at, used_at, created_at`

Adicionar em `doc_signature_documents`:
- `require_biometric BOOLEAN DEFAULT TRUE`
- `document_hash VARCHAR(128)` — SHA-256 do PDF final
- `public_tracking_slug VARCHAR(20) UNIQUE` — slug curto pro QR (`/rastreio/:slug`)

## 2. Backend (`backend/src/routes/document-signatures.js`)

Rotas públicas novas (sem auth):

- `POST /sign/:token/request-otp` → gera OTP 6 dígitos, envia email
- `POST /sign/:token/verify-otp {code}` → devolve `session_token` (JWT 15min)
- `GET  /sign/:token/file?session=` → serve PDF inline, watermark "PENDENTE" enquanto não `completed`, download real só quando `completed`
- `POST /sign/:token/upload-biometric` (session) → grava selfie + doc frente/verso + score
- `POST /sign/:token/submit` (session) → só aceita se biometria passou
- `GET  /track/:slug` → dados do rastreio público

## 3. Geração do PDF final (backend, com `pdf-lib` + `qrcode`)

Quando todos assinam:
1. Carrega original, aplica assinaturas nas posições dos `doc_signature_placements`.
2. **Página final "Certificado de Assinatura Digital"**: hash SHA-256, base legal MP 2.200-2/2001, e para cada signatário: nome, CPF, email, IP, geo, data/hora + thumbnails da selfie e documento frente/verso.
3. **Rodapé em todas as páginas**: QR code apontando pra `https://<host>/rastreio/<slug>` + texto "Verificar autenticidade".
4. Recalcula SHA-256 e grava em `document_hash`.

## 4. Frontend público — `src/pages/PublicSigningPage.tsx` (nova)

Rota: `/assinar/:token`. Stepper:

1. **OTP** — "Enviar código pro meu e-mail" → digita 6 dígitos → session.
2. **Leitura do contrato** — iframe inline, sem toolbar, watermark "Aguardando assinatura". Botão "Li e concordo".
3. **Biometria**:
   - Selfie: webcam → `face-api.js` detecta 1 rosto (score ≥ 0.6).
   - Documento frente: câmera traseira (`facingMode: environment`).
   - Documento verso: idem.
   - Match: `computeFaceDescriptor` selfie × doc frente, `euclideanDistance` ≤ 0.6.
   - Upload dos 3 base64 + score.
4. **Assinatura**: canvas (`react-signature-canvas`) → submit.
5. **Confirmação**: link pro rastreio público.

Modelos face-api.js em `/public/models/face-api/` (tiny_face_detector + landmarks + recognition).

## 5. Frontend público — `src/pages/PublicSignatureTracking.tsx` (nova)

Rota `/rastreio/:slug`. Mostra: título, hash, status, timeline (cada signatário: assinado em / IP / cidade / biometria ✓). Botão "Baixar documento" **apenas** se `completed`.

## 6. Frontend admin

- `use-document-signatures.ts`: novos métodos `requestOtp`, `verifyOtp`, `uploadBiometric`, `submitSignatureBiometric`, `getTracking`; parâmetro `require_biometric` no create.
- Na tela existente, um switch "Exigir biometria (selfie + documento)".

## 7. Segurança

- OTP com bcrypt, expira 10min, uso único.
- JWT session curto (15min).
- face-api.js roda no cliente (privacidade); servidor recebe apenas score + fotos.
- Download bloqueado antes de `completed` (headers + validação por sessão).
- Hash SHA-256 publicado permite verificar integridade sem expor conteúdo.

## Arquivos

**Novos:**
- `src/pages/PublicSigningPage.tsx`
- `src/pages/PublicSignatureTracking.tsx`
- `public/models/face-api/*.json` (~6MB, CDN oficial)

**Editados:**
- `backend/schema-document-signatures.sql` (ALTERs idempotentes)
- `backend/src/routes/document-signatures.js` (rotas + geração do PDF final)
- `backend/package.json` (`pdf-lib`, `qrcode` se faltarem)
- `src/App.tsx` (rotas `/assinar/:token`, `/rastreio/:slug`)
- `src/hooks/use-document-signatures.ts`
- `package.json` (`face-api.js`, `react-signature-canvas`)

## Fora do escopo (adiciono depois se quiser)

- Vivacidade real (piscar, virar rosto).
- OCR do documento pra ler CPF/nome.
- Fallback pra aprovação manual quando o match face-api falha 3x.
- Assinatura ICP-Brasil (A1/A3) — aqui a validade é a da MP 2.200-2/2001 §2º (assinatura eletrônica simples com evidências).

Confirma que posso implementar tudo isso?
