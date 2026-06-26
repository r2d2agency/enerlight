import jwt from 'jsonwebtoken';
import { setRequestContext } from '../request-context.js';
import { query } from '../db.js';

// Small in-memory cache: userId -> { ts: epochMs, value: passwordChangedAtMs|null }
const pwdChangedCache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 30s

let schemaEnsured = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  try {
    await query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ`
    );
    schemaEnsured = true;
  } catch (e) {
    // Don't block auth if migration fails; will retry next request
    console.error('[auth] ensureSchema error:', e.message);
  }
}

async function getPasswordChangedAt(userId) {
  const cached = pwdChangedCache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const r = await query(
      'SELECT password_changed_at FROM users WHERE id = $1',
      [userId]
    );
    const val = r.rows[0]?.password_changed_at
      ? new Date(r.rows[0].password_changed_at).getTime()
      : null;
    pwdChangedCache.set(userId, { ts: Date.now(), value: val });
    return val;
  } catch (e) {
    return null;
  }
}

export function invalidatePasswordChangedCache(userId) {
  pwdChangedCache.delete(userId);
}

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.replace('Bearer ', '');

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Reject tokens issued before the user's last password change
  await ensureSchema();
  const pwdChangedAt = await getPasswordChangedAt(decoded.userId);
  if (pwdChangedAt && decoded.iat && decoded.iat * 1000 < pwdChangedAt) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;

  setRequestContext({ user_id: decoded.userId, user_email: decoded.email });

  next();
};
