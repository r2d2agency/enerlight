// Uazapi routes - webhook receiver for incoming messages
// The user registers this URL in the Uazapi panel:
//   {WEBHOOK_BASE_URL}/api/uazapi/webhook
// Payload format is normalized defensively: Uazapi instances may send
// Baileys-like envelopes (key.remoteJid) or flat phone-based payloads.

import { Router } from 'express';
import { query } from '../db.js';
import { pauseNurturingOnReply } from './nurturing.js';
import { processIncomingWithAgent } from '../lib/ai-agent-processor.js';
import { logError, logInfo } from '../logger.js';

const router = Router();

// In-memory webhook event buffer for diagnostics (not persisted)
const WEBHOOK_EVENTS_MAX = 200;
const webhookEvents = [];
const recentIncomingKeys = new Map();
const RECENT_INCOMING_TTL_MS = 15_000;

function pushWebhookEvent({ connectionId, instanceTokenPreview, eventType, req, payload }) {
  const event = {
    at: new Date().toISOString(),
    connectionId: connectionId || null,
    instanceTokenPreview: instanceTokenPreview || null,
    eventType: eventType || null,
    preview: JSON.stringify(payload).slice(0, 900),
  };
  webhookEvents.unshift(event);
  if (webhookEvents.length > WEBHOOK_EVENTS_MAX) webhookEvents.length = WEBHOOK_EVENTS_MAX;
  return event;
}

function reserveRecentIncomingKey(key) {
  const now = Date.now();
  for (const [k, expiresAt] of recentIncomingKeys) {
    if (expiresAt <= now) recentIncomingKeys.delete(k);
  }
  if (recentIncomingKeys.has(key)) return false;
  recentIncomingKeys.set(key, now + RECENT_INCOMING_TTL_MS);
  return true;
}

function isStatusJid(value) {
  if (!value) return false;
  const v = String(value).toLowerCase();
  return v === 'status' || v.includes('status@broadcast') || v.endsWith('@broadcast') || v.includes('@newsletter');
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Case-insensitive first-level lookup: Uazapi mixes camelCase/PascalCase
// (e.g. EventType vs event, Message vs message) across versions/endpoints.
function pick(obj, ...names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const wanted = names.map((n) => String(n).toLowerCase());
  for (const k of Object.keys(obj)) {
    if (wanted.includes(k.toLowerCase())) return obj[k];
  }
  return undefined;
}

function detectEventType(payload) {
  const event = String(pick(payload, 'event', 'eventtype', 'type') || '').toLowerCase();
  if (event) return event;
  const fromMe = payload.key?.fromMe ?? pick(payload, 'fromme', 'isfromme', 'sent_by_me', 'sentbyme');
  if (fromMe === true) return 'message_sent';
  return 'message_received';
}

// Deep-scan fallback: Uazapi nests phone/text at unpredictable depths/keys.
// Walks the whole payload collecting phone-like and text-like string values.
function deepScan(payload) {
  const phones = [];
  const texts = [];
  const media = [];
  const seen = new Set();
  const PHONE_KEY = /(phone|waid|wa_id|number|sender|remotejid|chatid|from|to\b|lid|owner|contact)/i;
  const TEXT_KEY = /^(text|body|content|caption|conversation|message|mensagem|texto)$/i;
  const MEDIA_KEY = /(mediaurl|file_url|fileurl|documenturl|imagepreview|image|audio|video|document|file$|url$)/i;
  (function walk(node, key) {
    if (node == null || seen.has(node)) return;
    if (typeof node === 'string') {
      const digits = onlyDigits(node);
      if (key && PHONE_KEY.test(key) && digits.length >= 10 && digits.length <= 15) phones.push(digits);
      else if (/^\d{10,15}$/.test(node.trim()) && key && !/^(id|_id|token|instance)/i.test(key)) phones.push(node.trim());
      if (key && TEXT_KEY.test(key) && node.trim().length > 0 && node.trim().length < 4000
        && !/^(messages?|text|image|audio|video|document|sticker|contact)$/i.test(node.trim())) texts.push(node.trim());
      if (key && MEDIA_KEY.test(key) && /^https?:\/\//i.test(node.trim())) media.push(node.trim());
      return;
    }
    if (typeof node !== 'object') return;
    seen.add(node);
    for (const k of Object.keys(node)) walk(node[k], k);
  })(payload, '');
  return { phones, texts, media };
}

/**
 * Normalize a Uazapi webhook payload into a common shape:
 * { remoteJid, chatPhone, messageId, fromMe, pushName, messageType, content, mediaUrl, mediaMimetype, isGroup, senderPhone }
 *
 * Real Uazapi format seen in production (PascalCase + nested objects):
 * {
 *   BaseUrl, EventType: "messages",
 *   chat: { id, phone?, waId?, number?, lid?, isGroup?, name?, pushName? },
 *   message: { id?, fromMe?, text?, content?, body?, type?, mediaUrl?, ... },
 *   sender: { id?, phone?, pushName? }, owner?...,
 * }
 */
function normalizePayload(payload) {
  const key = payload.key || {};
  // Message can be a string, a Baileys envelope, or a Uazapi object (any case).
  const msgRaw = pick(payload, 'message', 'msg', 'data') ?? payload.message ?? payload;
  const msg = (msgRaw && typeof msgRaw === 'object' ? (msgRaw.message || msgRaw) : msgRaw);
  const chatObj = pick(payload, 'chat', 'conversation', 'contact') || {};
  const senderObj = pick(payload, 'sender', 'author', 'participantobj') || {};
  const messageObj = (msg && typeof msg === 'object') ? msg : {};

  // JID: Baileys-style first, then Uazapi chat object, then flat fallbacks.
  const rawJid = key.remoteJid
    || pick(payload, 'chatid', 'remotejid', 'from', 'lid', 'owner', 'phone')
    || chatObj.id || chatObj.waId || chatObj.waid || chatObj.jid || chatObj.remoteJid
    || pick(payload, 'chat')?.id
    || payload.chat?.id || senderObj.id
    || payload.participant || payload.owner || payload.lid || null;
  const fromMe = key.fromMe
    ?? pick(payload, 'fromme', 'isfromme', 'sent_by_me', 'sentbyme', 'from_me')
    ?? messageObj.fromMe ?? messageObj.fromme ?? pick(messageObj, 'fromme', 'isfromme')
    ?? (payload.event && String(payload.event).toLowerCase().includes('sent')) ?? false;

  const jidHint = String(rawJid || chatObj.id || '').toLowerCase();
  const isGroup = Boolean(
    chatObj.isGroup === true || pick(chatObj, 'isgroup') === true
    || (rawJid && (String(rawJid).includes('@g.us') || String(rawJid).includes('@lid@g')))
    || jidHint.includes('@g.us')
  );
  let chatPhone = onlyDigits(
    pick(payload, 'phone', 'number', 'waid', 'wa_id') || chatObj.phone || chatObj.number
    || chatObj.waId || chatObj.waid || chatObj.lid || senderObj.phone || ''
  ) || null;
  if (rawJid && !isGroup && !chatPhone) {
    chatPhone = onlyDigits(String(rawJid).split('@')[0].split(':')[0]) || null;
  }
  // Deep-scan fallback: Uazapi nests the phone at unpredictable keys/depths.
  // Only accept scanned phones when the explicit JID looks like an internal
  // id (e.g. chat.id "rf6be61c...") instead of a phone-JID.
  const scanned = deepScan(payload);
  const rawJidLooksInternal = !rawJid || (!String(rawJid).includes('@') && onlyDigits(rawJid).length < 10);
  if (!chatPhone && rawJidLooksInternal && scanned.phones.length > 0) {
    // Prefer the most common phone found across the payload
    const freq = new Map();
    for (const p of scanned.phones) freq.set(p, (freq.get(p) || 0) + 1);
    chatPhone = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const remoteJid = rawJid && !rawJidLooksInternal
    ? (String(rawJid).includes('@') ? String(rawJid) : (isGroup ? `${rawJid}@g.us` : `${chatPhone || rawJid}@s.whatsapp.net`))
    : (chatPhone ? (isGroup ? `${chatPhone}@g.us` : `${chatPhone}@s.whatsapp.net`) : null);

  // Content extraction covering common Uazapi/Baileys fields.
  // Uazapi text webhooks often arrive as { message: "text", type: "text" },
  // { content: { text } }, { message: { text } } or { text: { message } },
  // or nested: { message: { text, content, body, type } } (any case).
  let messageType = pick(payload, 'messagetype', 'msgtype', 'type')
    || messageObj.type || messageObj.messageType || messageObj.msgType || null;
  let content = (typeof pick(payload, 'text', 'content', 'body') === 'string' ? pick(payload, 'text', 'content', 'body') : null)
    || (typeof pick(messageObj, 'text', 'content', 'body', 'caption') === 'string' ? pick(messageObj, 'text', 'content', 'body', 'caption') : null)
    || (typeof payload.message === 'string' ? payload.message : null)
    || payload.content?.text || payload.message?.text || payload.text?.message
    || messageObj.content?.text || messageObj.message?.text || messageObj.text?.message || null;
  let mediaUrl = pick(payload, 'mediaurl', 'file_url', 'fileurl', 'file', 'media', 'documenturl', 'url', 'filepreview')
    || messageObj.mediaUrl || messageObj.file_url || messageObj.fileUrl || messageObj.file
    || messageObj.media || messageObj.documentUrl || messageObj.url || null;
  let mediaMimetype = pick(payload, 'mimetype', 'mediamimetype', 'mime_type')
    || messageObj.mimetype || messageObj.mediaMimetype || messageObj.mimeType || messageObj.mime_type || null;
  if (typeof content === 'object' && content !== null) {
    content = content.text || content.body || content.message || null;
  }
  if (typeof mediaUrl === 'object' && mediaUrl !== null) {
    mediaUrl = mediaUrl.url || mediaUrl.fileUrl || mediaUrl.href || null;
  }
  // Deep-scan fallbacks when explicit paths miss.
  if (!mediaUrl && scanned.media.length > 0) mediaUrl = scanned.media[0];
  if (!content && scanned.texts.length > 0) {
    // Prefer longest non-trivial text that isn't a type label
    const sorted = [...scanned.texts].sort((a, b) => b.length - a.length);
    content = sorted.find((t) => t.length > 1) || sorted[0] || null;
  }

  if (msg.conversation || msg.extendedTextMessage?.text) {
    messageType = messageType || 'text';
    content = msg.conversation || msg.extendedTextMessage?.text || content;
  } else if (msg.imageMessage || messageObj.image) {
    messageType = messageType || 'image';
    content = msg.imageMessage?.caption || messageObj.caption || content;
    mediaUrl = mediaUrl || msg.imageMessage?.url || messageObj.url;
    mediaMimetype = mediaMimetype || msg.imageMessage?.mimetype || messageObj.mimetype;
  } else if (msg.videoMessage || messageObj.video) {
    messageType = messageType || 'video';
    content = msg.videoMessage?.caption || messageObj.caption || content;
    mediaUrl = mediaUrl || msg.videoMessage?.url || messageObj.url;
    mediaMimetype = mediaMimetype || msg.videoMessage?.mimetype || messageObj.mimetype;
  } else if (msg.audioMessage || msg.pttMessage || messageObj.audio) {
    messageType = messageType || 'audio';
    mediaUrl = mediaUrl || msg.audioMessage?.url || msg.pttMessage?.url || messageObj.url;
    mediaMimetype = mediaMimetype || msg.audioMessage?.mimetype || msg.pttMessage?.mimetype || messageObj.mimetype;
  } else if (msg.documentMessage || messageObj.document || messageObj.file) {
    messageType = messageType || 'document';
    content = msg.documentMessage?.caption || msg.documentMessage?.fileName || messageObj.caption || messageObj.fileName || content;
    mediaUrl = mediaUrl || msg.documentMessage?.url || messageObj.url || messageObj.fileUrl;
    mediaMimetype = mediaMimetype || msg.documentMessage?.mimetype || messageObj.mimetype;
  } else if (msg.documentWithCaptionMessage?.message?.documentMessage) {
    const doc = msg.documentWithCaptionMessage.message.documentMessage;
    messageType = messageType || 'document';
    content = doc.caption || doc.fileName || content;
    mediaUrl = mediaUrl || doc.url;
    mediaMimetype = mediaMimetype || doc.mimetype;
  } else if (msg.stickerMessage || messageObj.sticker) {
    messageType = messageType || 'sticker';
    mediaUrl = mediaUrl || msg.stickerMessage?.url || messageObj.url;
    mediaMimetype = mediaMimetype || msg.stickerMessage?.mimetype || messageObj.mimetype;
  } else if (msg.contactMessage || msg.contactsArrayMessage) {
    messageType = messageType || 'contact';
    content = msg.contactMessage?.displayName || content;
  }
  messageType = messageType || 'text';

  const senderPhone = isGroup
    ? (onlyDigits(String(key.participant || payload.participant || payload.sender?.id || '').split('@')[0]) || null)
    : chatPhone;

  return {
    remoteJid,
    chatPhone: chatPhone || (remoteJid && !isGroup ? onlyDigits(String(remoteJid).split('@')[0]) || null : null),
    messageId: key.id || messageObj.id || pick(payload, 'messageid', 'message_id', 'id') || messageObj.messageId || null,
    fromMe: fromMe === true,
    pushName: pick(payload, 'pushname', 'sendername') || chatObj.name || chatObj.pushName || senderObj.pushName || senderObj.name || msg.pushName || messageObj.pushName || null,
    messageType: String(messageType).toLowerCase(),
    content: content ? String(content) : null,
    mediaUrl: mediaUrl || null,
    mediaMimetype,
    isGroup,
    senderPhone,
  };
}

// GET for easy connectivity testing from the Uazapi panel
router.get('/webhook', (req, res) => {
  res.json({ status: 'ok', message: 'Uazapi webhook endpoint is working', timestamp: new Date().toISOString() });
});

router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    logInfo('uazapi.webhook_received', { preview: JSON.stringify(payload).slice(0, 300) });

    const tokenPreview = String(req.headers['token'] || req.headers['apikey'] || req.headers['authorization'] || '').replace('Bearer ', '').slice(0, 8) || null;

    // Find connection: by api_key (instance token) first, fallback to any uazapi connection
    let connection = null;
    if (tokenPreview) {
      const byToken = await query(
        `SELECT c.*, COALESCE(c.organization_id, om.organization_id) AS organization_id
         FROM connections c
         LEFT JOIN organization_members om ON om.user_id = c.user_id
         WHERE c.provider = 'uazapi' AND c.api_key = $1
         LIMIT 1`,
        [String(req.headers['token'] || req.headers['apikey'] || '').replace('Bearer ', '')]
      );
      connection = byToken.rows[0] || null;
    }
    if (!connection) {
      const anyUazapi = await query(
        `SELECT c.*, COALESCE(c.organization_id, om.organization_id) AS organization_id
         FROM connections c
         LEFT JOIN organization_members om ON om.user_id = c.user_id
         WHERE c.provider = 'uazapi'
         ORDER BY c.updated_at DESC NULLS LAST
         LIMIT 1`
      );
      connection = anyUazapi.rows[0] || null;
    }

    const eventType = detectEventType(payload);
    const diagEvent = pushWebhookEvent({ connectionId: connection?.id || null, instanceTokenPreview: tokenPreview, eventType, req, payload });

    if (!connection) {
      return res.status(200).json({ received: true, skipped: 'no uazapi connection' });
    }

    const msg = normalizePayload(payload);

    if (isStatusJid(msg.remoteJid) || msg.messageType === 'reaction') {
      return res.status(200).json({ received: true, skipped: 'status_or_reaction' });
    }
    if (!msg.remoteJid || (!msg.content && !msg.mediaUrl)) {
      logInfo('uazapi.skipped_empty', { eventType, remoteJid: msg.remoteJid, hasContent: Boolean(msg.content), hasMedia: Boolean(msg.mediaUrl) });
      return res.status(200).json({ received: true, skipped: 'empty_message' });
    }

    // Deduplicate
    if (msg.messageId && !reserveRecentIncomingKey(`${connection.id}:${msg.messageId}`)) {
      return res.status(200).json({ received: true, skipped: 'duplicate' });
    }

    if (msg.isGroup && !connection.show_groups) {
      return res.status(200).json({ received: true, skipped: 'group_disabled' });
    }

    // Get or create conversation
    let conversationId;
    const existing = await query(
      `SELECT id FROM conversations
       WHERE connection_id = $1 AND (remote_jid = $2 OR ($3::text IS NOT NULL AND contact_phone = $3))
       LIMIT 1`,
      [connection.id, msg.remoteJid, msg.isGroup ? null : msg.chatPhone]
    );

    if (existing.rows.length > 0) {
      conversationId = existing.rows[0].id;
      // Mirror Evolution/W-API: bump unread and reopen finished conversations
      // when an inbound (not from me) message arrives.
      await query(
        `UPDATE conversations
         SET last_message_at = NOW(),
             updated_at = NOW(),
             unread_count = CASE WHEN $3 THEN unread_count + 1 ELSE unread_count END,
             attendance_status = CASE WHEN $3 AND attendance_status = 'finished' THEN 'waiting' ELSE attendance_status END
         WHERE id = $1`,
        [conversationId, msg.isGroup ? null : msg.chatPhone, !msg.fromMe]
      );
    } else {
      const contactName = msg.pushName || msg.chatPhone || 'Contato';
      const created = await query(
        `INSERT INTO conversations (connection_id, remote_jid, contact_name, contact_phone, is_group, group_name, last_message_at, unread_count, attendance_status)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, 'waiting')
         RETURNING id`,
        [connection.id, msg.remoteJid, contactName, msg.isGroup ? null : msg.chatPhone, msg.isGroup, msg.isGroup ? contactName : null, msg.fromMe ? 0 : 1]
      );
      conversationId = created.rows[0].id;
    }

    // Save message
    const messageId = msg.messageId || `uazapi-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dup = await query(`SELECT id FROM chat_messages WHERE message_id = $1 LIMIT 1`, [messageId]);
    if (dup.rows.length === 0) {
      await query(
        `INSERT INTO chat_messages (conversation_id, message_id, content, message_type, media_url, media_mimetype, from_me, sender_name, sender_phone, status, timestamp)
         VALUES ($1, $2, $3::text, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [conversationId, messageId, msg.content, msg.messageType, msg.mediaUrl, msg.mediaMimetype, msg.fromMe, msg.isGroup ? msg.pushName : null, msg.isGroup ? msg.senderPhone : null, msg.fromMe ? 'sent' : 'received']
      );
    }

    // Pause nurturing on incoming reply
    if (!msg.fromMe && msg.chatPhone && connection.organization_id) {
      pauseNurturingOnReply(msg.chatPhone, connection.organization_id, conversationId)
        .catch((err) => console.error('[Uazapi] Error pausing nurturing:', err.message));
    }

    // AI agent processing (best-effort, mirrors other providers)
    if (!msg.fromMe && (msg.content || msg.mediaUrl)) {
      try {
        processIncomingWithAgent({
          connection,
          conversationId,
          contactPhone: msg.chatPhone,
          contactName: msg.pushName || msg.chatPhone || 'Contato',
          messageContent: msg.content,
          messageType: msg.messageType,
          mediaUrl: msg.mediaUrl,
          mediaMimetype: msg.mediaMimetype,
        }).catch((err) => console.error('[Uazapi] AI agent error:', err.message));
      } catch (e) {
        console.error('[Uazapi] AI agent dispatch error:', e.message);
      }
    }

    res.status(200).json({ received: true, processed: eventType });
  } catch (error) {
    logError('uazapi.webhook_error', error, {});
    res.status(200).json({ received: true, error: error.message });
  }
});

// Diagnostics: view last webhook events
router.get('/webhook-events', async (req, res) => {
  const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
  res.json({ events: webhookEvents.slice(0, limit) });
});

export default router;
