import jwt from 'jsonwebtoken';
import { setRequestContext } from '../request-context.js';
import { query } from '../db.js';

// Small in-memory cache: userId -> { ts: epochMs, value: passwordChangedAtMs|null }
const pwdChangedCache = new Map();
const CACHE_TTL_MS = 5 * 1000; // 5s for fast forced logout across instances

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

export async function isTokenInvalidated(userId, issuedAtSeconds) {
  const pwdChangedAt = await getPasswordChangedAt(userId);
  return Boolean(
    pwdChangedAt &&
    issuedAtSeconds &&
    (issuedAtSeconds * 1000) < pwdChangedAt
  );
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

  // Reject tokens issued before the user's last password change.
  // Schema is created during app startup; never run DDL inside auth middleware.
  if (await isTokenInvalidated(decoded.userId, decoded.iat)) {
    return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
  }

  req.userId = decoded.userId;
  req.userEmail = decoded.email;

  setRequestContext({ user_id: decoded.userId, user_email: decoded.email });

  next();
};
