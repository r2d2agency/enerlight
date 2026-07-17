import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ============= AUTO MIGRATION =============
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS doc_signature_drafts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL,
        recipient_name VARCHAR(255) NOT NULL,
        recipient_email VARCHAR(255) NOT NULL,
        access_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE,
        view_count INTEGER DEFAULT 0,
        last_viewed_at TIMESTAMP WITH TIME ZONE,
        revoked BOOLEAN DEFAULT FALSE,
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_doc_sig_drafts_doc ON doc_signature_drafts(document_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_doc_sig_drafts_token ON doc_signature_drafts(access_token)`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS access_ips JSONB DEFAULT '[]'::jsonb`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS last_password_sent_at TIMESTAMP WITH TIME ZONE`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS last_password_ip TEXT`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS password_send_count INTEGER DEFAULT 0`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS response_status VARCHAR(20) DEFAULT 'pending'`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS response_reason TEXT`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP WITH TIME ZONE`);
    await query(`ALTER TABLE doc_signature_drafts ADD COLUMN IF NOT EXISTS response_ip TEXT`);

    // Biometric + OTP + Tracking (v2)
    await query(`ALTER TABLE doc_signature_signers ADD COLUMN IF NOT EXISTS selfie_url TEXT`);
    await query(`ALTER TABLE doc_signature_signers ADD COLUMN IF NOT EXISTS document_front_url TEXT`);
    await query(`ALTER TABLE doc_signature_signers ADD COLUMN IF NOT EXISTS document_back_url TEXT`);
    await query(`ALTER TABLE doc_signature_signers ADD COLUMN IF NOT EXISTS face_match_score DECIMAL(6,4)`);
    await query(`ALTER TABLE doc_signature_signers ADD COLUMN IF NOT EXISTS face_validation_status VARCHAR(30) DEFAULT 'pending'`);
    await query(`ALTER TABLE doc_signature_signers ADD COLUMN IF NOT EXISTS face_validation_details JSONB`);
    await query(`ALTER TABLE doc_signature_documents ADD COLUMN IF NOT EXISTS require_biometric BOOLEAN DEFAULT TRUE`);
    await query(`ALTER TABLE doc_signature_documents ADD COLUMN IF NOT EXISTS is_minuta BOOLEAN DEFAULT FALSE`);
    await query(`CREATE INDEX IF NOT EXISTS idx_doc_sig_docs_is_minuta ON doc_signature_documents(is_minuta)`);
    await query(`ALTER TABLE doc_signature_documents ADD COLUMN IF NOT EXISTS document_hash VARCHAR(128)`);
    await query(`ALTER TABLE doc_signature_documents ADD COLUMN IF NOT EXISTS public_tracking_slug VARCHAR(20) UNIQUE`);

    await query(`
      CREATE TABLE IF NOT EXISTS doc_signature_otps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        signer_id UUID NOT NULL,
        code_hash TEXT NOT NULL,
        code_salt TEXT NOT NULL,
        sent_to_email VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        used_at TIMESTAMP WITH TIME ZONE,
        attempts INTEGER DEFAULT 0,
        ip_address VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_doc_sig_otps_signer ON doc_signature_otps(signer_id)`);

    // Backfill slugs for legacy documents
    await query(`
      UPDATE doc_signature_documents
      SET public_tracking_slug = substr(md5(id::text || random()::text), 1, 12)
      WHERE public_tracking_slug IS NULL
    `);
  } catch (e) {
    console.error('[document-signatures] migration failed:', e.message);
  }
})();

// ============= HELPERS =============
const DRAFT_ENC_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}
function verifyPassword(password, hash, salt) {
  try {
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch { return false; }
}
function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[crypto.randomInt(0, chars.length)];
  return out;
}
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}
function generateSlug() {
  return crypto.randomBytes(6).toString('hex');
}

function decryptEmailPassword(encryptedPassword) {
  const ALGO = 'aes-256-cbc';
  const KEY = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';
  const [ivHex, encrypted] = encryptedPassword.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  let dec = decipher.update(encrypted, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

async function getOrgSmtp(userId, organizationId) {
  const u = await query(`SELECT * FROM email_user_smtp_configs WHERE user_id = $1 AND organization_id = $2 AND is_active = true`, [userId, organizationId]);
  if (u.rows[0]) return u.rows[0];
  const o = await query(`SELECT * FROM email_smtp_configs WHERE organization_id = $1 AND is_active = true`, [organizationId]);
  return o.rows[0] || null;
}

function buildTransporter(smtp) {
  if (!smtp) throw new Error('SMTP não configurado. Configure o e-mail em Configurações → E-mail.');
  return nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    auth: { user: smtp.username, pass: decryptEmailPassword(smtp.password_encrypted) },
    tls: { rejectUnauthorized: false },
  });
}

async function sendDraftEmail({ smtp, to, recipientName, password, url, docTitle }) {
  const transporter = buildTransporter(smtp);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
      <h2 style="color:#1a1a2e">Minuta de Contrato — ${docTitle}</h2>
      <p>Olá <strong>${recipientName}</strong>,</p>
      <p>Você recebeu uma minuta de contrato para análise. O documento é <strong>apenas para leitura</strong> e requer a senha abaixo para ser aberto.</p>
      <div style="background:#f6f7fb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px;color:#6b7280;font-size:13px">Senha de acesso</p>
        <p style="margin:0;font-size:22px;letter-spacing:3px;font-weight:700">${password}</p>
      </div>
      <p style="margin:20px 0"><a href="${url}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block">Abrir Minuta</a></p>
      <p style="font-size:13px;color:#6b7280">Este link é pessoal e o documento não permite download, impressão ou cópia.</p>
    </div>`;
  await transporter.sendMail({
    from: `"${smtp.from_name}" <${smtp.from_email}>`,
    to, subject: `Minuta para revisão: ${docTitle}`, html,
  });
}

async function sendOtpEmail({ smtp, to, recipientName, code, docTitle, url }) {
  const transporter = buildTransporter(smtp);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
      <h2 style="color:#1a1a2e">Assinatura de Contrato — ${docTitle}</h2>
      <p>Olá <strong>${recipientName}</strong>,</p>
      <p>Use o código abaixo para acessar o contrato e realizar sua assinatura. Este código é válido por <strong>10 minutos</strong>.</p>
      <div style="background:#f6f7fb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin:16px 0;text-align:center">
        <p style="margin:0 0 8px;color:#6b7280;font-size:13px">Código de acesso</p>
        <p style="margin:0;font-size:34px;letter-spacing:8px;font-weight:800;color:#1a1a2e">${code}</p>
      </div>
      ${url ? `<p style="margin:20px 0"><a href="${url}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block">Abrir contrato</a></p>` : ''}
      <p style="font-size:13px;color:#6b7280">Se você não solicitou este código, ignore este e-mail.</p>
    </div>`;
  await transporter.sendMail({
    from: `"${smtp.from_name}" <${smtp.from_email}>`,
    to, subject: `Código de acesso: ${docTitle}`, html,
  });
}

async function sendSigningInviteEmail({ smtp, to, recipientName, url, docTitle }) {
  const transporter = buildTransporter(smtp);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111">
      <h2 style="color:#1a1a2e">Você foi convidado para assinar</h2>
      <p>Olá <strong>${recipientName}</strong>,</p>
      <p>Você tem um contrato aguardando sua assinatura: <strong>${docTitle}</strong>.</p>
      <p>O processo é rápido e seguro:</p>
      <ol style="line-height:1.7">
        <li>Um código de acesso será enviado ao seu e-mail a cada tentativa de abertura.</li>
        <li>Você tirará uma <strong>selfie</strong> e uma foto do seu <strong>documento (frente e verso)</strong>.</li>
        <li>Após validação biométrica, você assinará no navegador.</li>
      </ol>
      <p style="margin:20px 0"><a href="${url}" style="background:#1a1a2e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block">Iniciar assinatura</a></p>
      <p style="font-size:12px;color:#6b7280">O contrato só poderá ser baixado após todas as assinaturas serem concluídas.</p>
    </div>`;
  await transporter.sendMail({
    from: `"${smtp.from_name}" <${smtp.from_email}>`,
    to, subject: `Contrato para assinar: ${docTitle}`, html,
  });
}

async function getUserOrg(userId) {
  const r = await query(`SELECT om.organization_id FROM organization_members om WHERE om.user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0]?.organization_id;
}

function getIp(req) {
  return req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.ip;
}

function ensureSlug(row) {
  return row.public_tracking_slug || null;
}

function isValidDataUrl(u) {
  return typeof u === 'string' && u.startsWith('data:image/') && u.length < 6_000_000; // ~4.5MB image
}

// ============================================================
// ============= PUBLIC ENDPOINTS (no auth) ===================
// ============================================================

// ---------- MINUTA (draft) ----------
router.get('/draft/:token/info', async (req, res) => {
  try {
    const r = await query(`
      SELECT dr.id, dr.recipient_name, dr.recipient_email, dr.expires_at, dr.revoked,
             d.title as document_title
      FROM doc_signature_drafts dr
      JOIN doc_signature_documents d ON dr.document_id = d.id
      WHERE dr.access_token = $1
    `, [req.params.token]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Link inválido' });
    const dr = r.rows[0];
    if (dr.revoked) return res.status(410).json({ error: 'Este link foi revogado' });
    if (dr.expires_at && new Date(dr.expires_at) < new Date()) return res.status(410).json({ error: 'Este link expirou' });
    res.json({
      document_title: dr.document_title,
      recipient_name: dr.recipient_name,
      recipient_email_masked: dr.recipient_email.replace(/(.).+(@.*)/, '$1***$2'),
      requires_password: true,
    });
  } catch (e) { console.error('draft info', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/draft/:token/auth', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
    const r = await query(`SELECT * FROM doc_signature_drafts WHERE access_token = $1`, [req.params.token]);
    const dr = r.rows[0];
    if (!dr) return res.status(404).json({ error: 'Link inválido' });
    if (dr.revoked) return res.status(410).json({ error: 'Link revogado' });
    if (dr.expires_at && new Date(dr.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirou' });
    if (!verifyPassword(password, dr.password_hash, dr.password_salt)) return res.status(401).json({ error: 'Senha incorreta' });

    const ipAddr = getIp(req);
    await query(`UPDATE doc_signature_drafts SET view_count = view_count + 1, last_viewed_at = NOW(),
      access_ips = COALESCE(access_ips,'[]'::jsonb) || $2::jsonb WHERE id = $1`,
      [dr.id, JSON.stringify([{ ip: ipAddr, user_agent: req.headers['user-agent'] || null, at: new Date().toISOString(), event: 'opened' }])]);
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, user_agent, details)
      VALUES ($1,'draft_viewed',$2,$3,$4)`,
      [dr.document_id, ipAddr, req.headers['user-agent'], JSON.stringify({ draft_id: dr.id, recipient_email: dr.recipient_email })]);

    const sessionToken = jwt.sign({ draftId: dr.id, docId: dr.document_id, scope: 'draft_view' }, process.env.JWT_SECRET, { expiresIn: '30m' });
    res.json({
      session_token: sessionToken,
      recipient_name: dr.recipient_name,
      recipient_email: dr.recipient_email,
      expires_in: 1800,
      response_status: dr.response_status || 'pending',
      response_reason: dr.response_reason || null,
      responded_at: dr.responded_at || null,
    });
  } catch (e) { console.error('draft auth', e); res.status(500).json({ error: 'Erro' }); }
});

router.get('/draft/:token/file', async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).send('Sem sessão');
    let decoded;
    try { decoded = jwt.verify(session, process.env.JWT_SECRET); } catch { return res.status(401).send('Sessão inválida'); }
    if (decoded.scope !== 'draft_view') return res.status(401).send('Escopo inválido');

    const r = await query(`SELECT dr.*, d.original_url, d.original_filename, d.original_mimetype
      FROM doc_signature_drafts dr JOIN doc_signature_documents d ON dr.document_id = d.id
      WHERE dr.access_token = $1 AND dr.id = $2`, [req.params.token, decoded.draftId]);
    const dr = r.rows[0];
    if (!dr) return res.status(404).send('Não encontrado');
    if (dr.revoked) return res.status(410).send('Revogado');
    if (dr.expires_at && new Date(dr.expires_at) < new Date()) return res.status(410).send('Expirado');

    const upstream = await fetch(dr.original_url);
    if (!upstream.ok) return res.status(502).send('Falha ao carregar arquivo');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', dr.original_mimetype || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="minuta.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(buf);
  } catch (e) { console.error('draft file', e); res.status(500).send('Erro'); }
});

router.post('/draft/:token/request-password', async (req, res) => {
  try {
    const ipAddr = getIp(req);
    const r = await query(`SELECT dr.*, d.title as document_title, d.org_id FROM doc_signature_drafts dr
      JOIN doc_signature_documents d ON dr.document_id = d.id WHERE dr.access_token = $1`, [req.params.token]);
    const dr = r.rows[0];
    if (!dr) return res.status(404).json({ error: 'Link inválido' });
    if (dr.revoked) return res.status(410).json({ error: 'Link revogado' });
    if (dr.expires_at && new Date(dr.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirou' });
    if (dr.last_password_sent_at) {
      const diffMs = Date.now() - new Date(dr.last_password_sent_at).getTime();
      if (diffMs < 30_000) return res.status(429).json({ error: `Aguarde ${Math.ceil((30_000 - diffMs) / 1000)}s para solicitar outra senha` });
    }
    const password = generatePassword();
    const { hash, salt } = hashPassword(password);
    const smtpRes = await query(`SELECT * FROM email_smtp_configs WHERE organization_id = $1 AND is_active = true LIMIT 1`, [dr.org_id]);
    const smtp = smtpRes.rows[0];
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/minuta/${dr.access_token}`;
    let emailSent = false, emailError = null;
    try {
      await sendDraftEmail({ smtp, to: dr.recipient_email, recipientName: dr.recipient_name, password, url, docTitle: dr.document_title });
      emailSent = true;
    } catch (e) { emailError = e.message; console.error('request-password email failed:', e.message); }

    if (emailSent) {
      await query(`UPDATE doc_signature_drafts SET password_hash=$1,password_salt=$2,last_password_sent_at=NOW(),
        last_password_ip=$3,password_send_count=COALESCE(password_send_count,0)+1,
        access_ips=COALESCE(access_ips,'[]'::jsonb) || $5::jsonb WHERE id=$4`,
        [hash, salt, ipAddr, dr.id, JSON.stringify([{ ip: ipAddr, user_agent: req.headers['user-agent'] || null, at: new Date().toISOString(), event: 'password_requested' }])]);
    }
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, user_agent, details)
      VALUES ($1,'draft_password_requested',$2,$3,$4)`,
      [dr.document_id, ipAddr, req.headers['user-agent'], JSON.stringify({ draft_id: dr.id, recipient_email: dr.recipient_email, email_sent: emailSent, email_error: emailError })]);

    if (!emailSent) return res.status(500).json({ error: emailError || 'Falha ao enviar e-mail com a senha' });
    res.json({ success: true, recipient_email_masked: dr.recipient_email.replace(/(.).+(@.*)/, '$1***$2'), message: 'Uma nova senha foi enviada para o seu e-mail' });
  } catch (e) { console.error('request-password error:', e); res.status(500).json({ error: 'Erro ao enviar senha' }); }
});

// Registra resposta do destinatário à minuta: 'accepted' (De acordo) ou 'objected' (Ressalva)
router.post('/draft/:token/respond', async (req, res) => {
  try {
    const { session_token, status, reason } = req.body || {};
    if (!session_token) return res.status(401).json({ error: 'Sem sessão' });
    if (!['accepted', 'objected'].includes(status)) return res.status(400).json({ error: 'Status inválido' });
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (status === 'objected' && trimmedReason.length < 5) {
      return res.status(400).json({ error: 'Descreva a ressalva (mínimo 5 caracteres)' });
    }
    let decoded;
    try { decoded = jwt.verify(session_token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Sessão expirada' }); }
    if (decoded.scope !== 'draft_view') return res.status(401).json({ error: 'Escopo inválido' });

    const r = await query(
      `SELECT * FROM doc_signature_drafts WHERE access_token = $1 AND id = $2`,
      [req.params.token, decoded.draftId]
    );
    const dr = r.rows[0];
    if (!dr) return res.status(404).json({ error: 'Não encontrado' });
    if (dr.revoked) return res.status(410).json({ error: 'Link revogado' });
    if (dr.response_status && dr.response_status !== 'pending') {
      return res.status(409).json({ error: 'Já existe uma resposta registrada para esta minuta', response_status: dr.response_status });
    }

    const ipAddr = getIp(req);
    const storedReason = status === 'objected' ? trimmedReason : (trimmedReason || null);
    await query(
      `UPDATE doc_signature_drafts SET response_status=$1, response_reason=$2, responded_at=NOW(), response_ip=$3 WHERE id=$4`,
      [status, storedReason, ipAddr, dr.id]
    );
    await query(
      `INSERT INTO doc_signature_audit_log (document_id, action, ip_address, user_agent, details)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        dr.document_id,
        status === 'accepted' ? 'draft_accepted' : 'draft_objected',
        ipAddr,
        req.headers['user-agent'],
        JSON.stringify({ draft_id: dr.id, recipient_name: dr.recipient_name, recipient_email: dr.recipient_email, reason: storedReason }),
      ]
    );
    res.json({ success: true, response_status: status, responded_at: new Date().toISOString(), response_reason: storedReason });
  } catch (e) {
    console.error('draft respond', e);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

// ---------- SIGNING (v2 com OTP + biometria) ----------

// Info público do signatário (sem OTP validado ainda)
router.get('/sign/:token/info', async (req, res) => {
  try {
    const r = await query(`
      SELECT s.id, s.name, s.email, s.role, s.status, s.face_validation_status, s.selfie_url IS NOT NULL as has_selfie,
             d.id as doc_id, d.title, d.status as doc_status, d.require_biometric, d.public_tracking_slug
      FROM doc_signature_signers s
      JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1
    `, [req.params.token]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Link inválido' });
    const s = r.rows[0];
    if (s.doc_status === 'cancelled') return res.status(410).json({ error: 'Documento cancelado' });
    res.json({
      document_title: s.title,
      document_status: s.doc_status,
      require_biometric: s.require_biometric !== false,
      signer_name: s.name,
      signer_email_masked: s.email.replace(/(.).+(@.*)/, '$1***$2'),
      signer_role: s.role,
      status: s.status,
      face_status: s.face_validation_status || 'pending',
      tracking_slug: s.public_tracking_slug,
      already_signed: s.status === 'signed',
    });
  } catch (e) { console.error('sign info', e); res.status(500).json({ error: 'Erro' }); }
});

// Solicita OTP
router.post('/sign/:token/request-otp', async (req, res) => {
  try {
    const ipAddr = getIp(req);
    const r = await query(`
      SELECT s.*, d.title as doc_title, d.org_id, d.status as doc_status
      FROM doc_signature_signers s JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1
    `, [req.params.token]);
    const s = r.rows[0];
    if (!s) return res.status(404).json({ error: 'Link inválido' });
    if (s.doc_status === 'cancelled') return res.status(410).json({ error: 'Documento cancelado' });
    if (s.status === 'signed') return res.status(400).json({ error: 'Você já assinou este documento' });

    // rate-limit 30s
    const lastOtp = await query(`SELECT created_at FROM doc_signature_otps WHERE signer_id = $1 ORDER BY created_at DESC LIMIT 1`, [s.id]);
    if (lastOtp.rows[0]) {
      const diff = Date.now() - new Date(lastOtp.rows[0].created_at).getTime();
      if (diff < 30_000) return res.status(429).json({ error: `Aguarde ${Math.ceil((30_000 - diff) / 1000)}s para solicitar novo código` });
    }

    const code = generateOtp();
    const { hash, salt } = hashPassword(code);
    // invalidate previous OTPs
    await query(`UPDATE doc_signature_otps SET used_at = NOW() WHERE signer_id = $1 AND used_at IS NULL`, [s.id]);
    await query(`INSERT INTO doc_signature_otps (signer_id, code_hash, code_salt, sent_to_email, expires_at, ip_address)
      VALUES ($1,$2,$3,$4, NOW() + INTERVAL '10 minutes', $5)`, [s.id, hash, salt, s.email, ipAddr]);

    const smtpRes = await query(`SELECT * FROM email_smtp_configs WHERE organization_id = $1 AND is_active = true LIMIT 1`, [s.org_id]);
    const smtp = smtpRes.rows[0];
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/assinar/${s.access_token}`;
    let sent = false, err = null;
    try { await sendOtpEmail({ smtp, to: s.email, recipientName: s.name, code, docTitle: s.doc_title, url }); sent = true; }
    catch (e) { err = e.message; console.error('OTP email failed:', e.message); }

    await query(`INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent, details)
      VALUES ($1,$2,'otp_requested',$3,$4,$5)`,
      [s.document_id, s.id, ipAddr, req.headers['user-agent'], JSON.stringify({ email_sent: sent, email_error: err })]);

    if (!sent) return res.status(500).json({ error: err || 'Falha ao enviar código' });
    res.json({ success: true, recipient_email_masked: s.email.replace(/(.).+(@.*)/, '$1***$2') });
  } catch (e) { console.error('request-otp', e); res.status(500).json({ error: 'Erro ao enviar código' }); }
});

// Verifica OTP
router.post('/sign/:token/verify-otp', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !/^\d{6}$/.test(String(code))) return res.status(400).json({ error: 'Código inválido' });
    const ipAddr = getIp(req);
    const r = await query(`SELECT s.*, d.id as doc_id FROM doc_signature_signers s
      JOIN doc_signature_documents d ON s.document_id = d.id WHERE s.access_token = $1`, [req.params.token]);
    const s = r.rows[0];
    if (!s) return res.status(404).json({ error: 'Link inválido' });

    const otpRes = await query(`SELECT * FROM doc_signature_otps
      WHERE signer_id = $1 AND used_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`, [s.id]);
    const otp = otpRes.rows[0];
    if (!otp) return res.status(400).json({ error: 'Código expirado ou não solicitado' });
    if (otp.attempts >= 5) return res.status(429).json({ error: 'Muitas tentativas. Solicite um novo código.' });

    if (!verifyPassword(String(code), otp.code_hash, otp.code_salt)) {
      await query(`UPDATE doc_signature_otps SET attempts = attempts + 1 WHERE id = $1`, [otp.id]);
      return res.status(401).json({ error: 'Código incorreto' });
    }
    await query(`UPDATE doc_signature_otps SET used_at = NOW() WHERE id = $1`, [otp.id]);
    await query(`INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent)
      VALUES ($1,$2,'otp_verified',$3,$4)`, [s.doc_id, s.id, ipAddr, req.headers['user-agent']]);

    const sessionToken = jwt.sign({ signerId: s.id, docId: s.doc_id, scope: 'sign_session' }, process.env.JWT_SECRET, { expiresIn: '20m' });
    res.json({ session_token: sessionToken, expires_in: 1200 });
  } catch (e) { console.error('verify-otp', e); res.status(500).json({ error: 'Erro ao validar código' }); }
});

function requireSignSession(req, res, next) {
  const session = req.body?.session_token || req.query.session;
  if (!session) return res.status(401).json({ error: 'Sessão obrigatória' });
  try {
    const dec = jwt.verify(session, process.env.JWT_SECRET);
    if (dec.scope !== 'sign_session') throw new Error('bad scope');
    req.signSession = dec;
    next();
  } catch { return res.status(401).json({ error: 'Sessão inválida ou expirada' }); }
}

// Servir PDF (inline, watermark quando não completo)
router.get('/sign/:token/file', async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).send('Sem sessão');
    let dec;
    try { dec = jwt.verify(session, process.env.JWT_SECRET); } catch { return res.status(401).send('Sessão inválida'); }
    if (dec.scope !== 'sign_session') return res.status(401).send('Escopo inválido');
    const r = await query(`SELECT s.*, d.original_url, d.status as doc_status, d.signed_pdf_url
      FROM doc_signature_signers s JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1 AND s.id = $2`, [req.params.token, dec.signerId]);
    const s = r.rows[0];
    if (!s) return res.status(404).send('Não encontrado');

    // Se completo, permite download do assinado
    const url = s.doc_status === 'completed' && s.signed_pdf_url ? s.signed_pdf_url : s.original_url;
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(502).send('Falha ao carregar');
    let buf = Buffer.from(await upstream.arrayBuffer());

    // watermark "AGUARDANDO ASSINATURA" enquanto não completo
    if (s.doc_status !== 'completed') {
      try {
        const pdf = await PDFDocument.load(buf);
        const font = await pdf.embedFont(StandardFonts.HelveticaBold);
        pdf.getPages().forEach((p) => {
          const { width, height } = p.getSize();
          p.drawText('AGUARDANDO ASSINATURA', {
            x: width / 2 - 180, y: height / 2, size: 42,
            font, color: rgb(0.85, 0.1, 0.1), opacity: 0.18, rotate: degrees(-30),
          });
        });
        buf = Buffer.from(await pdf.save());
      } catch (e) { console.error('watermark failed', e.message); }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', s.doc_status === 'completed' ? `attachment; filename="contrato-assinado.pdf"` : `inline; filename="contrato.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buf);
  } catch (e) { console.error('sign file', e); res.status(500).send('Erro'); }
});

// Upload biometria (base64)
router.post('/sign/:token/upload-biometric', async (req, res) => {
  try {
    const { session_token, selfie, doc_front, doc_back, face_match_score, faces_detected, distance } = req.body || {};
    if (!session_token) return res.status(401).json({ error: 'Sessão obrigatória' });
    let dec;
    try { dec = jwt.verify(session_token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Sessão inválida' }); }
    if (dec.scope !== 'sign_session') return res.status(401).json({ error: 'Sessão inválida' });

    if (!isValidDataUrl(selfie) || !isValidDataUrl(doc_front) || !isValidDataUrl(doc_back)) {
      return res.status(400).json({ error: 'Selfie e documentos são obrigatórios (imagens)' });
    }
    const s = (await query(`SELECT * FROM doc_signature_signers WHERE id = $1`, [dec.signerId])).rows[0];
    if (!s) return res.status(404).json({ error: 'Signatário não encontrado' });

    const scoreNum = Number(face_match_score) || 0;
    const facesNum = Number(faces_detected) || 0;
    // Regras: precisa ao menos 1 rosto na selfie; score do detector ≥ 0.5; distance ≤ 0.6 (se fornecida)
    const passed = facesNum >= 1 && scoreNum >= 0.5 && (distance == null || Number(distance) <= 0.6);
    const status = passed ? 'passed' : 'failed';

    await query(`UPDATE doc_signature_signers SET
      selfie_url = $1, document_front_url = $2, document_back_url = $3,
      face_match_score = $4, face_validation_status = $5,
      face_validation_details = $6 WHERE id = $7`,
      [selfie, doc_front, doc_back, scoreNum, status,
       JSON.stringify({ faces_detected: facesNum, distance: distance ?? null, at: new Date().toISOString() }),
       s.id]);

    await query(`INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent, details)
      VALUES ($1,$2,'biometric_uploaded',$3,$4,$5)`,
      [s.document_id, s.id, getIp(req), req.headers['user-agent'],
       JSON.stringify({ score: scoreNum, distance, faces_detected: facesNum, status })]);

    if (!passed) return res.status(400).json({ error: 'Não foi possível validar a biometria. Tente novamente com melhor iluminação.', status });
    res.json({ success: true, status });
  } catch (e) { console.error('upload-biometric', e); res.status(500).json({ error: 'Erro ao processar biometria' }); }
});

// Submeter assinatura final
router.post('/sign/:token/submit', async (req, res) => {
  try {
    const { session_token, signature_data, cpf, geolocation } = req.body || {};
    if (!session_token) return res.status(401).json({ error: 'Sessão obrigatória' });
    let dec;
    try { dec = jwt.verify(session_token, process.env.JWT_SECRET); } catch { return res.status(401).json({ error: 'Sessão inválida' }); }
    if (dec.scope !== 'sign_session') return res.status(401).json({ error: 'Sessão inválida' });
    if (!signature_data || !signature_data.startsWith('data:image/')) return res.status(400).json({ error: 'Assinatura obrigatória' });

    const s = (await query(`SELECT s.*, d.require_biometric, d.status as doc_status
      FROM doc_signature_signers s JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.id = $1`, [dec.signerId])).rows[0];
    if (!s) return res.status(404).json({ error: 'Signatário não encontrado' });
    if (s.status === 'signed') return res.status(400).json({ error: 'Já assinado' });
    if (s.doc_status === 'cancelled') return res.status(410).json({ error: 'Documento cancelado' });
    if (s.require_biometric !== false && s.face_validation_status !== 'passed') {
      return res.status(400).json({ error: 'Complete a verificação biométrica antes de assinar' });
    }

    await query(`UPDATE doc_signature_signers SET status='signed', signed_at=NOW(),
      signature_data=$1, signature_ip=$2, signature_user_agent=$3, signature_geolocation=$4,
      cpf=COALESCE($5,cpf) WHERE id=$6`,
      [signature_data, getIp(req), req.headers['user-agent'], geolocation || null, cpf || null, s.id]);

    await query(`INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent, geolocation, details)
      VALUES ($1,$2,'signed',$3,$4,$5,$6)`,
      [s.document_id, s.id, getIp(req), req.headers['user-agent'], geolocation || null,
       JSON.stringify({ cpf: cpf || null, signed_at: new Date().toISOString() })]);

    const remaining = await query(`SELECT COUNT(*) as cnt FROM doc_signature_signers WHERE document_id = $1 AND status = 'pending'`, [s.document_id]);
    if (parseInt(remaining.rows[0].cnt) === 0) {
      await query(`UPDATE doc_signature_documents SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`, [s.document_id]);
      await query(`INSERT INTO doc_signature_audit_log (document_id, action, details) VALUES ($1,'completed','{"all_signed":true}')`, [s.document_id]);
      // Gera PDF final assinado com certificado, QR e biometria
      finalizePdf(s.document_id).catch(e => console.error('finalize PDF failed', e));
    } else {
      await query(`UPDATE doc_signature_documents SET status='partially_signed', updated_at=NOW() WHERE id=$1`, [s.document_id]);
    }
    res.json({ success: true });
  } catch (e) { console.error('submit', e); res.status(500).json({ error: 'Erro ao assinar' }); }
});

// ---------- Public tracking ----------
router.get('/track/:slug', async (req, res) => {
  try {
    const r = await query(`SELECT d.id, d.title, d.status, d.created_at, d.completed_at, d.document_hash, d.signed_pdf_url,
      d.public_tracking_slug FROM doc_signature_documents d WHERE d.public_tracking_slug = $1`, [req.params.slug]);
    const d = r.rows[0];
    if (!d) return res.status(404).json({ error: 'Documento não encontrado' });

    const signers = await query(`SELECT id, name, email, role, status, signed_at, signature_ip, signature_geolocation,
      face_validation_status, face_match_score FROM doc_signature_signers WHERE document_id = $1 ORDER BY sign_order`, [d.id]);
    const audit = await query(`SELECT action, created_at, ip_address FROM doc_signature_audit_log
      WHERE document_id = $1 ORDER BY created_at ASC`, [d.id]);

    res.json({
      title: d.title,
      status: d.status,
      created_at: d.created_at,
      completed_at: d.completed_at,
      document_hash: d.document_hash,
      is_completed: d.status === 'completed',
      download_url: d.status === 'completed' ? d.signed_pdf_url : null,
      signers: signers.rows.map(s => ({
        name: s.name,
        email_masked: s.email.replace(/(.).+(@.*)/, '$1***$2'),
        role: s.role,
        status: s.status,
        signed_at: s.signed_at,
        ip: s.signature_ip,
        geolocation: s.signature_geolocation,
        biometric_status: s.face_validation_status,
      })),
      audit_log: audit.rows,
    });
  } catch (e) { console.error('track', e); res.status(500).json({ error: 'Erro' }); }
});

// ================================================================
// ============= FINALIZAÇÃO DO PDF (assinatura + certificado) ====
// ================================================================
async function finalizePdf(documentId) {
  const docRow = (await query(`SELECT * FROM doc_signature_documents WHERE id = $1`, [documentId])).rows[0];
  if (!docRow) return;
  const signers = (await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1 ORDER BY sign_order`, [documentId])).rows;
  const placements = (await query(`SELECT * FROM doc_signature_placements WHERE document_id = $1`, [documentId])).rows;

  const upstream = await fetch(docRow.original_url);
  if (!upstream.ok) throw new Error('Failed to fetch original PDF');
  const originalBuf = Buffer.from(await upstream.arrayBuffer());

  const pdf = await PDFDocument.load(originalBuf, { ignoreEncryption: true });
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const slug = docRow.public_tracking_slug || generateSlug();
  if (!docRow.public_tracking_slug) {
    await query(`UPDATE doc_signature_documents SET public_tracking_slug=$1 WHERE id=$2`, [slug, documentId]);
  }
  const publicBase = process.env.PUBLIC_APP_URL || process.env.APP_URL || '';
  const trackUrl = `${publicBase.replace(/\/$/, '')}/rastreio/${slug}`;

  // QR code
  const qrDataUrl = await QRCode.toDataURL(trackUrl, { margin: 0, width: 180 });
  const qrPng = await pdf.embedPng(qrDataUrl);

  // 1) Aplica assinaturas visuais em suas posições
  for (const p of placements) {
    const signer = signers.find(x => x.id === p.signer_id);
    if (!signer || !signer.signature_data) continue;
    const pages = pdf.getPages();
    const pageIdx = Math.max(0, Math.min(pages.length - 1, (p.page_number || 1) - 1));
    const page = pages[pageIdx];
    try {
      const sigImg = signer.signature_data.startsWith('data:image/png')
        ? await pdf.embedPng(signer.signature_data)
        : await pdf.embedJpg(signer.signature_data);
      const w = Number(p.width) || 200;
      const h = Number(p.height) || 80;
      // y_position vem em coordenadas top-down (canvas); pdf-lib usa bottom-up
      const y = page.getHeight() - Number(p.y_position) - h;
      page.drawImage(sigImg, { x: Number(p.x_position), y, width: w, height: h });
      page.drawText(`${signer.name} • ${new Date(signer.signed_at || Date.now()).toLocaleString('pt-BR')}`, {
        x: Number(p.x_position), y: y - 12, size: 7, font: helv, color: rgb(0.3, 0.3, 0.3),
      });
    } catch (e) { console.error('sig embed failed', e.message); }
  }

  // 2) Rodapé com QR em todas as páginas
  const pages = pdf.getPages();
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const qrSize = 42;
    page.drawImage(qrPng, { x: 20, y: 12, width: qrSize, height: qrSize });
    page.drawText('Verifique a autenticidade:', { x: 68, y: 42, size: 7, font: helvBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(trackUrl, { x: 68, y: 32, size: 7, font: helv, color: rgb(0.1, 0.1, 0.5) });
    page.drawText(`Página ${i + 1}/${pages.length} • Doc ID: ${slug}`, { x: 68, y: 20, size: 6, font: helv, color: rgb(0.4, 0.4, 0.4) });
  }

  // 3) Página final: Certificado de Assinatura Digital + biometria
  const certPage = pdf.addPage([595.28, 841.89]); // A4
  const pw = certPage.getWidth();
  let y = 800;
  certPage.drawText('CERTIFICADO DE ASSINATURA DIGITAL', {
    x: 40, y, size: 16, font: helvBold, color: rgb(0.1, 0.1, 0.15),
  });
  y -= 22;
  certPage.drawText(`Documento: ${docRow.title}`, { x: 40, y, size: 10, font: helvBold });
  y -= 14;
  certPage.drawText(`Concluído em: ${new Date().toLocaleString('pt-BR')}`, { x: 40, y, size: 9, font: helv });
  y -= 12;
  certPage.drawText(`ID público: ${slug}`, { x: 40, y, size: 9, font: helv });
  y -= 20;

  certPage.drawText('Signatários', { x: 40, y, size: 12, font: helvBold });
  y -= 14;

  for (const s of signers) {
    if (y < 200) { y = 800; pdf.addPage([595.28, 841.89]); }
    certPage.drawText(`• ${s.name} — ${s.role || 'Signatário'}`, { x: 40, y, size: 10, font: helvBold });
    y -= 12;
    certPage.drawText(`   E-mail: ${s.email}`, { x: 40, y, size: 8, font: helv }); y -= 10;
    if (s.cpf) { certPage.drawText(`   CPF: ${s.cpf}`, { x: 40, y, size: 8, font: helv }); y -= 10; }
    certPage.drawText(`   Assinado em: ${s.signed_at ? new Date(s.signed_at).toLocaleString('pt-BR') : '—'}`, { x: 40, y, size: 8, font: helv }); y -= 10;
    certPage.drawText(`   IP: ${s.signature_ip || '—'} • Geo: ${s.signature_geolocation || '—'}`, { x: 40, y, size: 8, font: helv }); y -= 10;
    certPage.drawText(`   Biometria: ${s.face_validation_status || 'n/a'} (score ${s.face_match_score ?? '—'})`, { x: 40, y, size: 8, font: helv }); y -= 10;

    // thumbnails: selfie + docs
    const thumbs = [
      { label: 'Selfie', data: s.selfie_url },
      { label: 'Doc. Frente', data: s.document_front_url },
      { label: 'Doc. Verso', data: s.document_back_url },
    ];
    let tx = 40;
    for (const t of thumbs) {
      if (!t.data || !t.data.startsWith('data:image/')) { tx += 100; continue; }
      try {
        const img = t.data.includes('image/png')
          ? await pdf.embedPng(t.data)
          : await pdf.embedJpg(t.data);
        const w = 80, h = 80;
        certPage.drawImage(img, { x: tx, y: y - h, width: w, height: h });
        certPage.drawText(t.label, { x: tx, y: y - h - 10, size: 7, font: helv, color: rgb(0.3, 0.3, 0.3) });
      } catch (e) { console.error('thumb failed', e.message); }
      tx += 100;
    }
    y -= 108;
  }

  y -= 6;
  certPage.drawText('Base legal: MP 2.200-2/2001, Art. 10, §2º — assinatura eletrônica com evidências.', {
    x: 40, y, size: 8, font: helv, color: rgb(0.3, 0.3, 0.3),
  });
  y -= 10;
  certPage.drawText(`Rastreio público (QR em todas as páginas): ${trackUrl}`, {
    x: 40, y, size: 8, font: helv, color: rgb(0.1, 0.1, 0.5),
  });

  const outBytes = await pdf.save();
  const hash = crypto.createHash('sha256').update(outBytes).digest('hex');

  // Salva no storage do backend via API interna de uploads públicos.
  // Fallback: guarda como base64 data URL (backend usa `original_url` que pode ser data URL).
  const dataUrl = 'data:application/pdf;base64,' + Buffer.from(outBytes).toString('base64');
  await query(`UPDATE doc_signature_documents SET signed_pdf_url=$1, document_hash=$2, updated_at=NOW() WHERE id=$3`,
    [dataUrl, hash, documentId]);
}

// ===============================================================
// ============= AUTHENTICATED ROUTES ============================
// ===============================================================
router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });
    const result = await query(`
      SELECT d.*, u.name as creator_name,
        (SELECT COUNT(*) FROM doc_signature_signers WHERE document_id = d.id) as total_signers,
        (SELECT COUNT(*) FROM doc_signature_signers WHERE document_id = d.id AND status = 'signed') as signed_count
      FROM doc_signature_documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.org_id = $1 ORDER BY d.created_at DESC
    `, [orgId]);
    res.json(result.rows);
  } catch (e) { console.error('list', e); res.status(500).json({ error: 'Erro ao listar' }); }
});

router.get('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const docResult = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });
    const signers = await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1 ORDER BY sign_order`, [id]);
    const placements = await query(`SELECT * FROM doc_signature_placements WHERE document_id = $1`, [id]);
    const audit = await query(`SELECT * FROM doc_signature_audit_log WHERE document_id = $1 ORDER BY created_at DESC`, [id]);
    const drafts = await query(`SELECT id, recipient_name, recipient_email, access_token, expires_at,
      view_count, last_viewed_at, revoked, created_at, response_status, response_reason, responded_at, response_ip
      FROM doc_signature_drafts WHERE document_id = $1 ORDER BY created_at DESC`, [id]);
    res.json({ ...docResult.rows[0], signers: signers.rows, placements: placements.rows, audit_log: audit.rows, drafts: drafts.rows });
  } catch (e) { console.error('get', e); res.status(500).json({ error: 'Erro ao buscar' }); }
});

router.post('/', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });
    const { title, description, original_url, original_filename, original_mimetype, signers, require_biometric } = req.body;
    if (!title || !original_url) return res.status(400).json({ error: 'Título e arquivo são obrigatórios' });
    const slug = generateSlug();
    const docResult = await query(`
      INSERT INTO doc_signature_documents (org_id, title, description, original_url, original_filename, original_mimetype, created_by, status, require_biometric, public_tracking_slug)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9) RETURNING *
    `, [orgId, title, description, original_url, original_filename || 'document.pdf', original_mimetype || 'application/pdf',
        req.userId, require_biometric !== false, slug]);
    const doc = docResult.rows[0];
    if (signers?.length) {
      for (const s of signers) {
        await query(`INSERT INTO doc_signature_signers (document_id, name, email, cpf, phone, role, sign_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [doc.id, s.name, s.email, s.cpf || null, s.phone || null, s.role || 'Signatário', s.sign_order || 1]);
      }
    }
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1,'created',$2,$3)`, [doc.id, req.ip, JSON.stringify({ created_by: req.userId })]);
    res.status(201).json(doc);
  } catch (e) { console.error('create', e); res.status(500).json({ error: 'Erro ao criar' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const { title, description, status, signers, placements, require_biometric } = req.body;
    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });
    const sets = [], vals = []; let idx = 1;
    if (title) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
    if (require_biometric !== undefined) { sets.push(`require_biometric = $${idx++}`); vals.push(!!require_biometric); }
    sets.push(`updated_at = NOW()`); vals.push(id);
    await query(`UPDATE doc_signature_documents SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    if (signers) {
      await query(`DELETE FROM doc_signature_signers WHERE document_id = $1 AND status = 'pending'`, [id]);
      for (const s of signers) {
        await query(`INSERT INTO doc_signature_signers (document_id, name, email, cpf, phone, role, sign_order)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, s.name, s.email, s.cpf || null, s.phone || null, s.role || 'Signatário', s.sign_order || 1]);
      }
    }
    if (placements) {
      await query(`DELETE FROM doc_signature_placements WHERE document_id = $1`, [id]);
      for (const p of placements) {
        await query(`INSERT INTO doc_signature_placements (document_id, signer_id, page_number, x_position, y_position, width, height)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, p.signer_id, p.page_number || 1, p.x_position, p.y_position, p.width || 200, p.height || 80]);
      }
    }
    res.json({ success: true });
  } catch (e) { console.error('update', e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/:id/send', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });
    const doc = docCheck.rows[0];
    const signers = await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1`, [id]);
    if (!signers.rows.length) return res.status(400).json({ error: 'Adicione ao menos um signatário' });

    await query(`UPDATE doc_signature_documents SET status = 'pending', updated_at = NOW() WHERE id = $1`, [id]);

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const smtp = await getOrgSmtp(req.userId, orgId);
    const links = [];
    for (const s of signers.rows) {
      const url = `${origin}/assinar/${s.access_token}`;
      let sent = false, err = null;
      try {
        if (smtp) await sendSigningInviteEmail({ smtp, to: s.email, recipientName: s.name, url, docTitle: doc.title });
        sent = !!smtp;
      } catch (e) { err = e.message; }
      links.push({ signer_name: s.name, signer_email: s.email, signing_url: url, email_sent: sent, email_error: err });
    }
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1,'sent',$2,$3)`, [id, req.ip, JSON.stringify({ signer_count: signers.rows.length })]);
    res.json({ success: true, signing_links: links });
  } catch (e) { console.error('send', e); res.status(500).json({ error: 'Erro ao enviar' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    await query(`DELETE FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (e) { console.error('delete', e); res.status(500).json({ error: 'Erro' }); }
});

// ---------- DRAFTS (minuta) ----------
router.post('/:id/drafts', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const { recipient_name, recipient_email, expires_in_days } = req.body || {};
    if (!recipient_name || !recipient_email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });
    const doc = docCheck.rows[0];
    const password = generatePassword();
    const { hash, salt } = hashPassword(password);
    const expiresAt = expires_in_days ? new Date(Date.now() + Number(expires_in_days) * 86400000) : null;
    const ins = await query(`INSERT INTO doc_signature_drafts (document_id, recipient_name, recipient_email, password_hash, password_salt, expires_at, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, recipient_name, recipient_email, hash, salt, expiresAt, req.userId]);
    const draft = ins.rows[0];
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/minuta/${draft.access_token}`;
    let emailSent = false, emailError = null;
    try {
      const smtp = await getOrgSmtp(req.userId, orgId);
      await sendDraftEmail({ smtp, to: recipient_email, recipientName: recipient_name, password, url, docTitle: doc.title });
      emailSent = true;
    } catch (e) { emailError = e.message; }
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1,'draft_sent',$2,$3)`, [id, req.ip, JSON.stringify({ draft_id: draft.id, recipient_email, email_sent: emailSent })]);
    res.status(201).json({
      draft: { id: draft.id, recipient_name: draft.recipient_name, recipient_email: draft.recipient_email,
        access_token: draft.access_token, expires_at: draft.expires_at, view_count: 0, revoked: false, created_at: draft.created_at },
      url, password, email_sent: emailSent, email_error: emailError,
    });
  } catch (e) { console.error('draft create', e); res.status(500).json({ error: 'Erro ao criar minuta' }); }
});

router.post('/:id/drafts/:draftId/regenerate', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id, draftId } = req.params;
    const doc = (await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId])).rows[0];
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    const draft = (await query(`SELECT * FROM doc_signature_drafts WHERE id = $1 AND document_id = $2`, [draftId, id])).rows[0];
    if (!draft) return res.status(404).json({ error: 'Minuta não encontrada' });
    if (draft.revoked) return res.status(400).json({ error: 'Minuta revogada' });
    const password = generatePassword();
    const { hash, salt } = hashPassword(password);
    await query(`UPDATE doc_signature_drafts SET password_hash=$1,password_salt=$2 WHERE id=$3`, [hash, salt, draftId]);
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/minuta/${draft.access_token}`;
    let emailSent = false, emailError = null;
    try {
      const smtp = await getOrgSmtp(req.userId, orgId);
      await sendDraftEmail({ smtp, to: draft.recipient_email, recipientName: draft.recipient_name, password, url, docTitle: doc.title });
      emailSent = true;
    } catch (e) { emailError = e.message; }
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1,'draft_password_regenerated',$2,$3)`, [id, req.ip, JSON.stringify({ draft_id: draftId, email_sent: emailSent })]);
    res.json({ success: true, url, password, email_sent: emailSent, email_error: emailError });
  } catch (e) { console.error('regen', e); res.status(500).json({ error: 'Erro' }); }
});

router.delete('/:id/drafts/:draftId', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id, draftId } = req.params;
    const doc = (await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId])).rows[0];
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    await query(`UPDATE doc_signature_drafts SET revoked = TRUE WHERE id = $1 AND document_id = $2`, [draftId, id]);
    await query(`INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1,'draft_revoked',$2,$3)`, [id, req.ip, JSON.stringify({ draft_id: draftId })]);
    res.json({ success: true });
  } catch (e) { console.error('revoke', e); res.status(500).json({ error: 'Erro' }); }
});

// ---------- Legacy GET/POST /sign/:token (compat com UI atual) ----------
// Mantém para não quebrar chamadas antigas; a nova UI usa /sign/:token/info + fluxo com OTP.
router.get('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const r = await query(`SELECT s.*, d.title, d.original_url, d.original_filename, d.status as doc_status, d.signed_pdf_url
      FROM doc_signature_signers s JOIN doc_signature_documents d ON s.document_id = d.id WHERE s.access_token = $1`, [token]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Link inválido' });
    const s = r.rows[0];
    if (s.doc_status === 'cancelled') return res.status(400).json({ error: 'Documento cancelado' });
    const placements = await query(`SELECT * FROM doc_signature_placements WHERE signer_id = $1`, [s.id]);
    res.json({
      document_title: s.title,
      document_url: s.doc_status === 'completed' ? s.signed_pdf_url : null, // só libera baixado depois de completo
      signer_name: s.name, signer_email: s.email, signer_role: s.role,
      placements: placements.rows, status: s.status,
    });
  } catch (e) { console.error('legacy sign get', e); res.status(500).json({ error: 'Erro' }); }
});

export default router;
