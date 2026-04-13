import express from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const META_API_BASE = 'https://graph.facebook.com/v21.0';

async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

async function getMetaConnection(connectionId) {
  const result = await query(
    `SELECT * FROM connections WHERE id = $1 AND provider = 'meta'`, [connectionId]
  );
  return result.rows[0];
}

async function metaFetch(path, token, options = {}) {
  const url = `${META_API_BASE}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok) {
    const errMsg = data?.error?.message || JSON.stringify(data);
    throw new Error(`Meta API Error (${resp.status}): ${errMsg}`);
  }
  return data;
}

// ============================================================
// Meta Webhook - receives incoming messages & status updates
// These endpoints are PUBLIC (no auth) - Meta calls them directly
// ============================================================

// Webhook verification (Meta sends GET to verify)
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || 'blaster_meta_verify';

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Meta Webhook] Verification successful');
    return res.status(200).send(challenge);
  }
  console.log('[Meta Webhook] Verification failed', { mode, token });
  return res.status(403).send('Forbidden');
});

// Webhook event receiver
router.post('/webhook', async (req, res) => {
  // Always respond 200 quickly to Meta
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    for (const entry of (body.entry || [])) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'messages') continue;
        const value = change.value;
        const phoneNumberId = value?.metadata?.phone_number_id;

        if (!phoneNumberId) continue;

        const connResult = await query(
          `SELECT * FROM connections WHERE meta_phone_number_id = $1 AND provider = 'meta' LIMIT 1`,
          [phoneNumberId]
        );
        const conn = connResult.rows[0];
        if (!conn) {
          console.log(`[Meta Webhook] No connection found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        if (conn.meta_app_secret && req.headers['x-hub-signature-256']) {
          const sig = req.headers['x-hub-signature-256'];
          const expectedSig = 'sha256=' + crypto
            .createHmac('sha256', conn.meta_app_secret)
            .update(JSON.stringify(req.body))
            .digest('hex');
          if (sig !== expectedSig) {
            console.log('[Meta Webhook] Invalid signature, skipping');
            continue;
          }
        }

        for (const status of (value.statuses || [])) {
          try {
            await query(
              `UPDATE chat_messages SET status = $1, updated_at = NOW()
               WHERE message_id = $2`,
              [status.status, status.id]
            );
          } catch (e) {
            console.error('[Meta Webhook] Status update error:', e.message);
          }
        }

        for (const msg of (value.messages || [])) {
          try {
            const senderPhone = msg.from;
            const remoteJid = senderPhone.includes('@') ? senderPhone : `${senderPhone}@s.whatsapp.net`;
            const contactName = value.contacts?.[0]?.profile?.name || senderPhone;

            let convResult = await query(
              `SELECT id FROM conversations 
               WHERE connection_id = $1 AND remote_jid = $2 LIMIT 1`,
              [conn.id, remoteJid]
            );

            let conversationId;
            if (convResult.rows.length > 0) {
              conversationId = convResult.rows[0].id;
            } else {
              const newConv = await query(
                `INSERT INTO conversations 
                  (connection_id, remote_jid, contact_name, contact_phone, last_message_at, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
                 RETURNING id`,
                [conn.id, remoteJid, contactName, senderPhone]
              );
              conversationId = newConv.rows[0].id;
            }

            let content = '';
            let messageType = 'text';
            let mediaUrl = null;
            let mediaMime = null;

            if (msg.type === 'text') {
              content = msg.text?.body || '';
            } else if (msg.type === 'image') {
              messageType = 'image';
              content = msg.image?.caption || '';
              mediaUrl = msg.image?.id;
            } else if (msg.type === 'audio') {
              messageType = 'audio';
              mediaUrl = msg.audio?.id;
            } else if (msg.type === 'video') {
              messageType = 'video';
              content = msg.video?.caption || '';
              mediaUrl = msg.video?.id;
            } else if (msg.type === 'document') {
              messageType = 'document';
              content = msg.document?.filename || '';
              mediaUrl = msg.document?.id;
            } else if (msg.type === 'sticker') {
              messageType = 'sticker';
              mediaUrl = msg.sticker?.id;
            } else if (msg.type === 'reaction') {
              continue;
            } else {
              content = `[${msg.type}]`;
            }

            if (mediaUrl && !mediaUrl.startsWith('http')) {
              try {
                const mediaInfo = await metaFetch(`/${mediaUrl}`, conn.meta_access_token);
                if (mediaInfo.url) {
                  mediaUrl = mediaInfo.url;
                  mediaMime = mediaInfo.mime_type || null;
                }
              } catch (mediaErr) {
                console.error('[Meta Webhook] Media download error:', mediaErr.message);
              }
            }

            await query(
              `INSERT INTO chat_messages 
                (conversation_id, message_id, from_me, content, message_type, media_url, media_mimetype, status, timestamp)
               VALUES ($1, $2, false, $3, $4, $5, $6, 'received', to_timestamp($7))
               ON CONFLICT (conversation_id, message_id) DO NOTHING`,
              [
                conversationId,
                msg.id,
                content,
                messageType,
                mediaUrl,
                mediaMime,
                parseInt(msg.timestamp) || Math.floor(Date.now() / 1000),
              ]
            );

            await query(
              `UPDATE conversations 
               SET last_message_at = NOW(), updated_at = NOW(), 
                   contact_name = COALESCE(NULLIF($2, ''), contact_name),
                   unread_count = COALESCE(unread_count, 0) + 1
               WHERE id = $1`,
              [conversationId, contactName]
            );

            console.log(`[Meta Webhook] Saved incoming message ${msg.id} from ${senderPhone}`);
          } catch (msgErr) {
            console.error('[Meta Webhook] Message processing error:', msgErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Meta Webhook] Processing error:', err);
  }
});

// ============================================================
// Authenticated routes below
// ============================================================
router.use(authenticate);

// List templates from Meta
router.get('/templates/:connectionId', async (req, res) => {
  try {
    const conn = await getMetaConnection(req.params.connectionId);
    if (!conn) return res.status(404).json({ error: 'Conexão Meta não encontrada' });

    const wabaId = conn.meta_waba_id;
    const token = conn.meta_access_token;
    if (!wabaId || !token) return res.status(400).json({ error: 'WABA ID ou Token não configurado' });

    const data = await metaFetch(`/${wabaId}/message_templates?limit=100`, token);
    res.json(data.data || []);
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create/submit a template for approval
router.post('/templates/:connectionId', async (req, res) => {
  try {
    const conn = await getMetaConnection(req.params.connectionId);
    if (!conn) return res.status(404).json({ error: 'Conexão Meta não encontrada' });

    const wabaId = conn.meta_waba_id;
    const token = conn.meta_access_token;

    const { name, language, category, components } = req.body;

    if (!name || !language || !category || !components) {
      return res.status(400).json({ error: 'name, language, category e components são obrigatórios' });
    }

    const data = await metaFetch(`/${wabaId}/message_templates`, token, {
      method: 'POST',
      body: JSON.stringify({ name, language, category, components }),
    });

    res.json(data);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a template
router.delete('/templates/:connectionId/:templateName', async (req, res) => {
  try {
    const conn = await getMetaConnection(req.params.connectionId);
    if (!conn) return res.status(404).json({ error: 'Conexão Meta não encontrada' });

    const wabaId = conn.meta_waba_id;
    const token = conn.meta_access_token;

    const data = await metaFetch(
      `/${wabaId}/message_templates?name=${req.params.templateName}`,
      token,
      { method: 'DELETE' }
    );

    res.json(data);
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send a template message
router.post('/send/:connectionId', async (req, res) => {
  try {
    const conn = await getMetaConnection(req.params.connectionId);
    if (!conn) return res.status(404).json({ error: 'Conexão Meta não encontrada' });

    const phoneNumberId = conn.meta_phone_number_id;
    const token = conn.meta_access_token;

    if (!phoneNumberId || !token) {
      return res.status(400).json({ error: 'Phone Number ID ou Token não configurado' });
    }

    const { to, template_name, language_code, components, conversation_id, sender_id } = req.body;

    if (!to || !template_name) {
      return res.status(400).json({ error: 'to e template_name são obrigatórios' });
    }

    const formattedTo = to.replace(/\D/g, '');

    const body = {
      messaging_product: 'whatsapp',
      to: formattedTo,
      type: 'template',
      template: {
        name: template_name,
        language: { code: language_code || 'pt_BR' },
      },
    };

    if (components?.length) {
      body.template.components = components;
    }

    const data = await metaFetch(`/${phoneNumberId}/messages`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    // Save sent message to chat_messages so it appears in the conversation
    let templateText = `[Template: ${template_name}]`;
    if (conversation_id) {
      const messageId = data?.messages?.[0]?.id || `meta_tpl_${Date.now()}`;
      try {
        await query(
          `INSERT INTO chat_messages 
            (conversation_id, message_id, from_me, sender_id, content, message_type, status, timestamp)
           VALUES ($1, $2, true, $3, $4, 'text', 'sent', NOW())
           ON CONFLICT (conversation_id, message_id) DO NOTHING`,
          [conversation_id, messageId, sender_id || req.user?.id || null, templateText]
        );
        await query(
          `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [conversation_id]
        );
      } catch (dbErr) {
        console.error('Failed to save template message to chat:', dbErr.message);
      }
    }

    res.json(data);
  } catch (error) {
    console.error('Send template error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get connection phone number info
router.get('/phone-info/:connectionId', async (req, res) => {
  try {
    const conn = await getMetaConnection(req.params.connectionId);
    if (!conn) return res.status(404).json({ error: 'Conexão Meta não encontrada' });

    const phoneNumberId = conn.meta_phone_number_id;
    const token = conn.meta_access_token;

    const data = await metaFetch(`/${phoneNumberId}`, token);
    res.json(data);
  } catch (error) {
    console.error('Phone info error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
