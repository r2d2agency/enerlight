import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { query } from '../db.js';

// Same key/algorithm used by routes/email.js to encrypt per-organization SMTP passwords
const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';

function decryptPassword(encryptedPassword) {
  const [ivHex, encrypted] = String(encryptedPassword).split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// System-level emails (password reset, etc.) reuse the SMTP config of a single
// organization designated via SYSTEM_EMAIL_ORGANIZATION_ID, since there is no
// global/platform-wide SMTP config in this project.
async function getSystemSmtpConfig() {
  const organizationId = process.env.SYSTEM_EMAIL_ORGANIZATION_ID;
  if (!organizationId) {
    throw new Error('SYSTEM_EMAIL_ORGANIZATION_ID não configurado');
  }

  const result = await query(
    `SELECT * FROM email_smtp_configs WHERE organization_id = $1 AND is_active = true LIMIT 1`,
    [organizationId]
  );

  const config = result.rows[0];
  if (!config) {
    throw new Error('Configuração de SMTP do sistema não encontrada para SYSTEM_EMAIL_ORGANIZATION_ID');
  }

  return config;
}

export async function sendSystemEmail({ to, subject, html }) {
  const config = await getSystemSmtpConfig();

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.username,
      pass: decryptPassword(config.password_encrypted),
    },
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });

  await transporter.sendMail({
    from: `"${config.from_name || 'Enerlight'}" <${config.from_email}>`,
    to,
    subject,
    html,
  });
}
