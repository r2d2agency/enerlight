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

function detectEventType(payload) {
  const event = String(payload.event || payload.type || '').toLowerCase();
  if (event) return event;
  const fromMe = payload.key?.fromMe ?? payload.fromMe ?? payload.isFromMe;
  if (fromMe === true) return 'message_sent';
  return 'message_received';
}

/**
 * Normalize a Uazapi webhook payload into a common shape:
 * { remoteJid, chatPhone, messageId, fromMe, pushName, messageType, content, mediaUrl, mediaMimetype, isGroup, senderPhone }
 */
function normalizePayload(payload) {
  const key = payload.key || {};
  const msg = payload.message?.message || payload.message || payload;

  // JID: Baileys-style first, fallbacks to flat fields.
  // Uazapi also sends owner/phone/LID style fields (e.g. owner, phone, lid,
  // sender: { id }, participant) that must be considered.
  const rawJid = key.remoteJid || payload.chatid || payload.chatId || payload.remoteJid
    || payload.from || payload.chat?.id || payload.sender?.id
    || payload.participant || payload.phone || payload.owner || payload.lid || null;
  const fromMe = key.fromMe ?? payload.fromMe ?? payload.isFromMe ?? payload.sent_by_me
    ?? payload.from_me ?? (payload.event && String(payload.event).toLowerCase().includes('sent')) ?? false;

  const isGroup = Boolean(rawJid && (String(rawJid).includes('@g.us') || String(rawJid).includes('@lid@g')));
  let chatPhone = onlyDigits(payload.phone || payload.chat?.phone || payload.sender?.phone || '') || null;
  if (rawJid && !isGroup && !chatPhone) {
    chatPhone = onlyDigits(String(rawJid).split('@')[0].split(':')[0]) || null;
  }
  const remoteJid = rawJid
    ? (String(rawJid).includes('@') ? String(rawJid) : (isGroup ? `${rawJid}@g.us` : `${chatPhone || rawJid}@s.whatsapp.net`))
    : null;

  // Content extraction covering common Uazapi/Baileys fields.
  // Uazapi text webhooks often arrive as { message: "text", type: "text" },
  // { content: { text } }, { message: { text } } or { text: { message } }.
  let messageType = payload.messageType || payload.type || payload.msgType || null;
  let content = (typeof payload.text === 'string' ? payload.text : null)
    || (typeof payload.content === 'string' ? payload.content : null)
    || (typeof payload.body === 'string' ? payload.body : null)
    || (typeof payload.message === 'string' ? payload.message : null)
    || payload.content?.text || payload.message?.text || payload.text?.message || null;
  let mediaUrl = payload.mediaUrl || payload.file_url || payload.fileUrl || payload.file
    || payload.media || payload.documentUrl || payload.url || null;
  let mediaMimetype = payload.mimetype || payload.mediaMimetype || payload.mimeType || payload.mime_type || null;
  if (typeof content === 'object') content = null;
  if (typeof mediaUrl === 'object') mediaUrl = null;

  if (msg.conversation || msg.extendedTextMessage?.text) {
    messageType = messageType || 'text';
    content = msg.conversation || msg.extendedTextMessage?.text || content;
  } else if (msg.imageMessage) {
    messageType = messageType || 'image';
    content = msg.imageMessage.caption || content;
    mediaUrl = mediaUrl || msg.imageMessage.url;
    mediaMimetype = mediaMimetype || msg.imageMessage.mimetype;
  } else if (msg.videoMessage) {
    messageType = messageType || 'video';
    content = msg.videoMessage.caption || content;
    mediaUrl = mediaUrl || msg.videoMessage.url;
    mediaMimetype = mediaMimetype || msg.videoMessage.mimetype;
  } else if (msg.audioMessage || msg.pttMessage) {
    messageType = messageType || 'audio';
    mediaUrl = mediaUrl || msg.audioMessage?.url || msg.pttMessage?.url;
    mediaMimetype = mediaMimetype || msg.audioMessage?.mimetype || msg.pttMessage?.mimetype;
  } else if (msg.documentMessage) {
    messageType = messageType || 'document';
    content = msg.documentMessage.caption || msg.documentMessage.fileName || content;
    mediaUrl = mediaUrl || msg.documentMessage.url;
    mediaMimetype = mediaMimetype || msg.documentMessage.mimetype;
  } else if (msg.documentWithCaptionMessage?.message?.documentMessage) {
    const doc = msg.documentWithCaptionMessage.message.documentMessage;
    messageType = messageType || 'document';
    content = doc.caption || doc.fileName || content;
    mediaUrl = mediaUrl || doc.url;
    mediaMimetype = mediaMimetype || doc.mimetype;
  } else if (msg.stickerMessage) {
    messageType = messageType || 'sticker';
    mediaUrl = mediaUrl || msg.stickerMessage.url;
    mediaMimetype = mediaMimetype || msg.stickerMessage.mimetype;
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
    messageId: key.id || payload.messageId || payload.messageid || payload.id || null,
    fromMe: fromMe === true,
    pushName: payload.pushName || msg.pushName || payload.sender?.pushName || payload.senderName || null,
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
