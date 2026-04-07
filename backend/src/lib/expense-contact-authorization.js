import { query } from '../db.js';

export function normalizeExpenseContactPhone(phone = '') {
  return String(phone || '').replace(/\D/g, '');
}

export function getExpenseContactPhoneVariants(phone = '') {
  const normalized = normalizeExpenseContactPhone(phone);
  if (!normalized) return [];

  const variants = new Set([normalized]);
  const nationalPhone = normalized.startsWith('55') && normalized.length > 2
    ? normalized.slice(2)
    : normalized;

  if (nationalPhone && nationalPhone.length <= 11) {
    variants.add(nationalPhone);
    variants.add(`55${nationalPhone}`);
  }

  if (/^\d{10,11}$/.test(nationalPhone)) {
    const ddd = nationalPhone.slice(0, 2);
    const localNumber = nationalPhone.slice(2);

    if (localNumber.length === 9 && localNumber.startsWith('9')) {
      const withoutNinthDigit = `${ddd}${localNumber.slice(1)}`;
      variants.add(withoutNinthDigit);
      variants.add(`55${withoutNinthDigit}`);
    }

    if (localNumber.length === 8) {
      const withNinthDigit = `${ddd}9${localNumber}`;
      variants.add(withNinthDigit);
      variants.add(`55${withNinthDigit}`);
    }
  }

  return Array.from(variants).filter(Boolean);
}

async function findExpenseContact({ organizationId, agentId, phone, requireUserId }) {
  const userFilter = requireUserId ? 'AND user_id IS NOT NULL' : '';

  if (agentId) {
    const agentScopedResult = await query(
      `SELECT id, agent_id, organization_id, user_id, name, phone, is_active, created_at
       FROM ai_agent_expense_contacts
       WHERE agent_id = $1 AND phone = $2 AND is_active = true ${userFilter}
       ORDER BY created_at DESC
       LIMIT 1`,
      [agentId, phone]
    );

    if (agentScopedResult.rows[0]) {
      return agentScopedResult.rows[0];
    }
  }

  const orgScopedResult = await query(
    `SELECT id, agent_id, organization_id, user_id, name, phone, is_active, created_at
     FROM ai_agent_expense_contacts
     WHERE organization_id = $1 AND phone = $2 AND is_active = true ${userFilter}
     ORDER BY created_at DESC
     LIMIT 1`,
    [organizationId, phone]
  );

  return orgScopedResult.rows[0] || null;
}

export async function resolveExpenseContactAuthorization({
  organizationId,
  agentId,
  contactPhone,
  requireUserId = false,
}) {
  const phoneVariants = getExpenseContactPhoneVariants(contactPhone);

  for (const phone of phoneVariants) {
    const contact = await findExpenseContact({ organizationId, agentId, phone, requireUserId });
    if (contact) {
      return {
        status: contact.user_id ? 'authorized' : 'unlinked',
        contact,
        matchedPhone: phone,
      };
    }
  }

  if (requireUserId) {
    for (const phone of phoneVariants) {
      const contact = await findExpenseContact({ organizationId, agentId, phone, requireUserId: false });
      if (contact) {
        return {
          status: contact.user_id ? 'authorized' : 'unlinked',
          contact,
          matchedPhone: phone,
        };
      }
    }
  }

  return {
    status: 'missing',
    contact: null,
    matchedPhone: null,
  };
}