import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
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
  } catch (e) {
    console.error('[document-signatures] migration failed:', e.message);
  }
})();

// ============= HELPERS =============

// Encryption key for password reveal (allows sender to see the current password)
const DRAFT_ENC_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';

function encryptText(text) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(DRAFT_ENC_KEY, 'draft-salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}
function decryptText(enc) {
  try {
    const [ivHex, data] = enc.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(DRAFT_ENC_KEY, 'draft-salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let dec = decipher.update(data, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch { return null; }
}

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
  // 8 chars alfanuméricos, sem ambíguos
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i++) out += chars[crypto.randomInt(0, chars.length)];
  return out;
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

async function sendDraftEmail({ smtp, to, recipientName, password, url, docTitle }) {
  if (!smtp) throw new Error('SMTP não configurado. Configure o e-mail em Configurações → E-mail.');
  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    auth: { user: smtp.username, pass: decryptEmailPassword(smtp.password_encrypted) },
    tls: { rejectUnauthorized: false },
  });
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
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
      <p style="font-size:12px;color:#9ca3af">Se você não esperava este e-mail, ignore esta mensagem.</p>
    </div>`;
  await transporter.sendMail({
    from: `"${smtp.from_name}" <${smtp.from_email}>`,
    to, subject: `Minuta para revisão: ${docTitle}`, html,
  });
}

async function getUserOrg(userId) {
  const r = await query(`SELECT om.organization_id FROM organization_members om WHERE om.user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0]?.organization_id;
}

// ============================================================
// ============= PUBLIC ENDPOINTS (no auth) ===================
// ============================================================

// Info da minuta (só metadata)
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
  } catch (e) {
    console.error('draft info', e); res.status(500).json({ error: 'Erro' });
  }
});

// Autenticar minuta com senha → retorna session token curto
router.post('/draft/:token/auth', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Senha obrigatória' });
    const r = await query(`SELECT * FROM doc_signature_drafts WHERE access_token = $1`, [req.params.token]);
    const dr = r.rows[0];
    if (!dr) return res.status(404).json({ error: 'Link inválido' });
    if (dr.revoked) return res.status(410).json({ error: 'Link revogado' });
    if (dr.expires_at && new Date(dr.expires_at) < new Date()) return res.status(410).json({ error: 'Link expirou' });
    if (!verifyPassword(password, dr.password_hash, dr.password_salt)) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    await query(`UPDATE doc_signature_drafts SET view_count = view_count + 1, last_viewed_at = NOW() WHERE id = $1`, [dr.id]);
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, user_agent, details)
      VALUES ($1, 'draft_viewed', $2, $3, $4)
    `, [dr.document_id, req.ip, req.headers['user-agent'], JSON.stringify({ draft_id: dr.id, recipient_email: dr.recipient_email })]);

    const sessionToken = jwt.sign(
      { draftId: dr.id, docId: dr.document_id, scope: 'draft_view' },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );
    res.json({
      session_token: sessionToken,
      recipient_name: dr.recipient_name,
      recipient_email: dr.recipient_email,
      expires_in: 1800,
    });
  } catch (e) {
    console.error('draft auth', e); res.status(500).json({ error: 'Erro' });
  }
});

// Stream do PDF para o visualizador (proxy protegido por session token)
router.get('/draft/:token/file', async (req, res) => {
  try {
    const session = req.query.session;
    if (!session) return res.status(401).send('Sem sessão');
    let decoded;
    try { decoded = jwt.verify(session, process.env.JWT_SECRET); }
    catch { return res.status(401).send('Sessão inválida'); }
    if (decoded.scope !== 'draft_view') return res.status(401).send('Escopo inválido');

    const r = await query(`
      SELECT dr.*, d.original_url, d.original_filename, d.original_mimetype
      FROM doc_signature_drafts dr
      JOIN doc_signature_documents d ON dr.document_id = d.id
      WHERE dr.access_token = $1 AND dr.id = $2
    `, [req.params.token, decoded.draftId]);
    const dr = r.rows[0];
    if (!dr) return res.status(404).send('Não encontrado');
    if (dr.revoked) return res.status(410).send('Revogado');
    if (dr.expires_at && new Date(dr.expires_at) < new Date()) return res.status(410).send('Expirado');

    // Faz proxy do arquivo original — inline, sem attachment
    const upstream = await fetch(dr.original_url);
    if (!upstream.ok) return res.status(502).send('Falha ao carregar arquivo');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', dr.original_mimetype || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="minuta.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.send(buf);
  } catch (e) {
    console.error('draft file', e); res.status(500).send('Erro');
  }
});

// ================================================
// ============= AUTHENTICATED ROUTES ============
// ================================================
router.use(authenticate);

// List documents
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
      WHERE d.org_id = $1
      ORDER BY d.created_at DESC
    `, [orgId]);
    res.json(result.rows);
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Erro ao listar documentos' });
  }
});

// Get single document
router.get('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;

    const docResult = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });

    const signers = await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1 ORDER BY sign_order`, [id]);
    const placements = await query(`SELECT * FROM doc_signature_placements WHERE document_id = $1`, [id]);
    const audit = await query(`SELECT * FROM doc_signature_audit_log WHERE document_id = $1 ORDER BY created_at DESC`, [id]);
    const drafts = await query(`
      SELECT id, recipient_name, recipient_email, access_token, expires_at,
             view_count, last_viewed_at, revoked, created_at
      FROM doc_signature_drafts WHERE document_id = $1 ORDER BY created_at DESC
    `, [id]);

    res.json({
      ...docResult.rows[0],
      signers: signers.rows,
      placements: placements.rows,
      audit_log: audit.rows,
      drafts: drafts.rows,
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Erro ao buscar documento' });
  }
});

// Create
router.post('/', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });

    const { title, description, original_url, original_filename, original_mimetype, signers } = req.body;
    if (!title || !original_url) return res.status(400).json({ error: 'Título e arquivo são obrigatórios' });

    const docResult = await query(`
      INSERT INTO doc_signature_documents (org_id, title, description, original_url, original_filename, original_mimetype, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
      RETURNING *
    `, [orgId, title, description, original_url, original_filename || 'document.pdf', original_mimetype || 'application/pdf', req.userId]);

    const doc = docResult.rows[0];

    if (signers?.length) {
      for (const s of signers) {
        await query(`
          INSERT INTO doc_signature_signers (document_id, name, email, cpf, phone, role, sign_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [doc.id, s.name, s.email, s.cpf || null, s.phone || null, s.role || 'Signatário', s.sign_order || 1]);
      }
    }

    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'created', $2, $3)
    `, [doc.id, req.ip, JSON.stringify({ created_by: req.userId })]);

    res.status(201).json(doc);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Erro ao criar documento' });
  }
});

// Update
router.patch('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const { title, description, status, signers, placements } = req.body;

    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });

    const sets = []; const vals = []; let idx = 1;
    if (title) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    await query(`UPDATE doc_signature_documents SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    if (signers) {
      await query(`DELETE FROM doc_signature_signers WHERE document_id = $1 AND status = 'pending'`, [id]);
      for (const s of signers) {
        await query(`
          INSERT INTO doc_signature_signers (document_id, name, email, cpf, phone, role, sign_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, s.name, s.email, s.cpf || null, s.phone || null, s.role || 'Signatário', s.sign_order || 1]);
      }
    }
    if (placements) {
      await query(`DELETE FROM doc_signature_placements WHERE document_id = $1`, [id]);
      for (const p of placements) {
        await query(`
          INSERT INTO doc_signature_placements (document_id, signer_id, page_number, x_position, y_position, width, height)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, p.signer_id, p.page_number || 1, p.x_position, p.y_position, p.width || 200, p.height || 80]);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
});

// Send for signing
router.post('/:id/send', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });

    const signers = await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1`, [id]);
    if (!signers.rows.length) return res.status(400).json({ error: 'Adicione ao menos um signatário' });

    await query(`UPDATE doc_signature_documents SET status = 'pending', updated_at = NOW() WHERE id = $1`, [id]);
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'sent', $2, $3)
    `, [id, req.ip, JSON.stringify({ signer_count: signers.rows.length })]);

    const links = signers.rows.map(s => ({
      signer_name: s.name, signer_email: s.email,
      signing_url: `/assinar/${s.access_token}`,
    }));
    res.json({ success: true, signing_links: links });
  } catch (error) {
    console.error('Send document error:', error);
    res.status(500).json({ error: 'Erro ao enviar documento' });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    await query(`DELETE FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Erro ao excluir documento' });
  }
});

// ========== DRAFTS (MINUTA) — envio protegido por senha ==========

// Cria minuta e envia por e-mail
router.post('/:id/drafts', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const { recipient_name, recipient_email, expires_in_days } = req.body || {};

    if (!recipient_name || !recipient_email) return res.status(400).json({ error: 'Nome e e-mail do destinatário são obrigatórios' });

    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });
    const doc = docCheck.rows[0];

    const password = generatePassword();
    const { hash, salt } = hashPassword(password);
    const expiresAt = expires_in_days ? new Date(Date.now() + Number(expires_in_days) * 86400000) : null;

    const ins = await query(`
      INSERT INTO doc_signature_drafts (document_id, recipient_name, recipient_email, password_hash, password_salt, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, recipient_name, recipient_email, hash, salt, expiresAt, req.userId]);
    const draft = ins.rows[0];

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/minuta/${draft.access_token}`;

    let emailSent = false; let emailError = null;
    try {
      const smtp = await getOrgSmtp(req.userId, orgId);
      await sendDraftEmail({ smtp, to: recipient_email, recipientName: recipient_name, password, url, docTitle: doc.title });
      emailSent = true;
    } catch (e) {
      emailError = e.message;
      console.error('Draft email send failed:', e.message);
    }

    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'draft_sent', $2, $3)
    `, [id, req.ip, JSON.stringify({ draft_id: draft.id, recipient_email, email_sent: emailSent })]);

    res.status(201).json({
      draft: {
        id: draft.id, recipient_name: draft.recipient_name, recipient_email: draft.recipient_email,
        access_token: draft.access_token, expires_at: draft.expires_at, view_count: 0, revoked: false,
        created_at: draft.created_at,
      },
      url,
      password, // retornado apenas nesta resposta para o remetente compartilhar caso o e-mail falhe
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (error) {
    console.error('Create draft error:', error);
    res.status(500).json({ error: 'Erro ao criar minuta' });
  }
});

// Regera senha de uma minuta e reenvia por e-mail
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
    await query(`UPDATE doc_signature_drafts SET password_hash = $1, password_salt = $2 WHERE id = $3`, [hash, salt, draftId]);

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const url = `${origin}/minuta/${draft.access_token}`;

    let emailSent = false; let emailError = null;
    try {
      const smtp = await getOrgSmtp(req.userId, orgId);
      await sendDraftEmail({ smtp, to: draft.recipient_email, recipientName: draft.recipient_name, password, url, docTitle: doc.title });
      emailSent = true;
    } catch (e) { emailError = e.message; }

    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'draft_password_regenerated', $2, $3)
    `, [id, req.ip, JSON.stringify({ draft_id: draftId, email_sent: emailSent })]);

    res.json({ success: true, url, password, email_sent: emailSent, email_error: emailError });
  } catch (error) {
    console.error('Regenerate draft error:', error);
    res.status(500).json({ error: 'Erro ao regerar senha' });
  }
});

// Revoga uma minuta
router.delete('/:id/drafts/:draftId', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id, draftId } = req.params;
    const doc = (await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId])).rows[0];
    if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
    await query(`UPDATE doc_signature_drafts SET revoked = TRUE WHERE id = $1 AND document_id = $2`, [draftId, id]);
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'draft_revoked', $2, $3)
    `, [id, req.ip, JSON.stringify({ draft_id: draftId })]);
    res.json({ success: true });
  } catch (error) {
    console.error('Revoke draft error:', error);
    res.status(500).json({ error: 'Erro ao revogar minuta' });
  }
});

// ========== PUBLIC SIGNING ENDPOINTS (existentes) ==========

router.get('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const signerResult = await query(`
      SELECT s.*, d.title, d.original_url, d.original_filename, d.status as doc_status
      FROM doc_signature_signers s
      JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1
    `, [token]);

    if (!signerResult.rows[0]) return res.status(404).json({ error: 'Link inválido' });
    const signer = signerResult.rows[0];
    if (signer.doc_status === 'cancelled') return res.status(400).json({ error: 'Documento cancelado' });
    if (signer.status === 'signed') return res.status(400).json({ error: 'Já assinado' });

    const placements = await query(`SELECT * FROM doc_signature_placements WHERE signer_id = $1`, [signer.id]);
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent)
      VALUES ($1, $2, 'viewed', $3, $4)
    `, [signer.document_id, signer.id, req.ip, req.headers['user-agent']]);

    res.json({
      document_title: signer.title, document_url: signer.original_url,
      signer_name: signer.name, signer_email: signer.email, signer_role: signer.role,
      placements: placements.rows, status: signer.status,
    });
  } catch (error) {
    console.error('Get signing page error:', error);
    res.status(500).json({ error: 'Erro ao carregar página de assinatura' });
  }
});

router.post('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { signature_data, cpf, geolocation } = req.body;
    if (!signature_data) return res.status(400).json({ error: 'Assinatura é obrigatória' });

    const signerResult = await query(`
      SELECT s.*, d.id as doc_id, d.status as doc_status
      FROM doc_signature_signers s JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1
    `, [token]);
    if (!signerResult.rows[0]) return res.status(404).json({ error: 'Link inválido' });
    const signer = signerResult.rows[0];
    if (signer.status === 'signed') return res.status(400).json({ error: 'Já assinado' });
    if (signer.doc_status === 'cancelled') return res.status(400).json({ error: 'Documento cancelado' });

    await query(`
      UPDATE doc_signature_signers SET status = 'signed', signed_at = NOW(),
        signature_data = $1, signature_ip = $2, signature_user_agent = $3,
        signature_geolocation = $4, cpf = COALESCE($5, cpf)
      WHERE id = $6
    `, [signature_data, req.ip, req.headers['user-agent'], geolocation || null, cpf || null, signer.id]);

    await query(`
      INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent, geolocation, details)
      VALUES ($1, $2, 'signed', $3, $4, $5, $6)
    `, [signer.doc_id, signer.id, req.ip, req.headers['user-agent'], geolocation || null,
        JSON.stringify({ cpf: cpf || null, signed_at: new Date().toISOString() })]);

    const remaining = await query(`SELECT COUNT(*) as cnt FROM doc_signature_signers WHERE document_id = $1 AND status = 'pending'`, [signer.doc_id]);
    if (parseInt(remaining.rows[0].cnt) === 0) {
      await query(`UPDATE doc_signature_documents SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [signer.doc_id]);
      await query(`INSERT INTO doc_signature_audit_log (document_id, action, details) VALUES ($1, 'completed', '{"all_signed": true}')`, [signer.doc_id]);
    } else {
      await query(`UPDATE doc_signature_documents SET status = 'partially_signed', updated_at = NOW() WHERE id = $1`, [signer.doc_id]);
    }
    res.json({ success: true, message: 'Assinatura registrada com sucesso' });
  } catch (error) {
    console.error('Sign document error:', error);
    res.status(500).json({ error: 'Erro ao assinar documento' });
  }
});

export default router;
