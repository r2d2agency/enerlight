// Uazapi Provider - Backend implementation
// Docs: POST /instance/connect, GET /instance/status,
// POST /send/text, POST /send/media, POST /send/contact, GET /contacts

import { logError, logInfo, logWarn } from '../logger.js';

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return String(baseUrl).trim().replace(/\/+$/, '');
}

function getHeaders(token) {
  const t = String(token || '').trim();
  return {
    'Content-Type': 'application/json',
    // Uazapi accepts the instance token in different headers depending on version/panel;
    // send all common variants to maximize compatibility.
    'token': t,
    'apikey': t,
    'Authorization': `Bearer ${t}`,
  };
}

async function parseJsonSafe(response) {
  const text = await response.text().catch(() => '');
  if (!text) return { data: null, rawText: '' };
  try {
    return { data: JSON.parse(text), rawText: text };
  } catch {
    return { data: null, rawText: text };
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Check instance status
 * GET {base}/instance/status
 * Returns { status: 'connected'|'disconnected'|'connecting', phoneNumber, raw }
 */
export async function checkStatus(baseUrl, token) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) {
    return { status: 'disconnected', error: 'Base URL ou Token não configurado' };
  }
  try {
    const response = await fetch(`${base}/instance/status`, {
      method: 'GET',
      headers: getHeaders(token),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      logWarn('uazapi.status_check_non_ok', { status_code: response.status, body_preview: String(rawText || '').slice(0, 300) });
      return { status: 'disconnected', error: errMsg };
    }
    const s = data?.status || {};
    const inst = data?.instance || {};
    const connected = s.connected === true || s.loggedIn === true;
    const connecting =
      String(inst.status || '').toLowerCase() === 'connecting' ||
      String(inst.paircode || '').length > 0;
    const phoneNumber =
      (s.jid ? String(s.jid).split('@')[0].split(':')[0] : null) ||
      (inst.profileName ? null : null) ||
      null;
    if (connected) return { status: 'connected', phoneNumber, raw: data };
    if (connecting) return { status: 'connecting', phoneNumber, raw: data };
    return { status: 'disconnected', raw: data };
  } catch (error) {
    logError('uazapi.status_check_exception', error, {});
    return { status: 'disconnected', error: error.message };
  }
}

/**
 * Connect / get QR Code + pairing code
 * POST {base}/instance/connect
 * Returns { qrCode (data URI|null), pairingCode, connected, loggedIn, raw }
 */
export async function connectInstance(baseUrl, token, options = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { qrCode: null, pairingCode: null, error: 'Base URL ou Token não configurado' };
  try {
    const body = {};
    if (options.phone) body.phone = onlyDigits(options.phone);
    if (options.browser) body.browser = options.browser;
    if (options.systemName) body.systemName = options.systemName;
    const response = await fetch(`${base}/instance/connect`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      logWarn('uazapi.connect_failed', { status_code: response.status, body_preview: String(rawText || '').slice(0, 500) });
      return { qrCode: null, pairingCode: null, error: errMsg };
    }
    const inst = data?.instance || data || {};
    let qr = inst.qrcode || inst.qr || inst.qrCode || inst.base64 || null;
    if (typeof qr === 'string' && qr.trim()) {
      qr = qr.trim();
      if (!qr.startsWith('data:image/')) {
        // Uazapi returns data:image/png;base64,... already; fallback if raw base64
        qr = qr.length > 200 ? `data:image/png;base64,${qr}` : qr;
      }
    } else {
      qr = null;
    }
    return {
      qrCode: qr,
      pairingCode: inst.paircode || inst.pairingCode || null,
      connected: data?.connected === true || data?.loggedIn === true,
      loggedIn: data?.loggedIn === true,
      jid: data?.jid || null,
      raw: data,
    };
  } catch (error) {
    logError('uazapi.connect_exception', error, {});
    return { qrCode: null, pairingCode: null, error: error.message };
  }
}

// Backwards-compatible alias used by the unified provider
export async function getQRCode(baseUrl, token, options = {}) {
  const res = await connectInstance(baseUrl, token, options);
  return res.qrCode || null;
}

export async function disconnect(baseUrl, token) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { success: false, error: 'Base URL ou Token não configurado' };
  try {
    // Uazapi has no documented logout endpoint; treat disconnect as local-only
    // but verify the instance is reachable.
    const st = await checkStatus(base, token);
    return { success: true, status: st.status };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function sendText(baseUrl, token, phone, message, options = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { success: false, error: 'Base URL ou Token não configurado' };
  try {
    const body = { number: onlyDigits(phone), text: String(message || '') };
    if (options.linkPreview !== undefined) body.linkPreview = options.linkPreview;
    if (options.delay !== undefined) body.delay = options.delay;
    const response = await fetch(`${base}/send/text`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Failed to send message (HTTP ${response.status})`;
      logWarn('uazapi.send_text_failed', { status_code: response.status, body_preview: String(rawText || '').slice(0, 500) });
      return { success: false, error: errorMsg };
    }
    return { success: true, messageId: data?.messageid || data?.messageId || data?.id || null, raw: data };
  } catch (error) {
    logError('uazapi.send_text_exception', error, {});
    return { success: false, error: error.message };
  }
}

const MEDIA_TYPE_MAP = {
  image: 'image',
  video: 'video',
  videoplay: 'videoplay',
  document: 'document',
  audio: 'audio',
  myaudio: 'myaudio',
  ptt: 'ptt',
  ptv: 'ptv',
  sticker: 'sticker',
};

export async function sendMedia(baseUrl, token, phone, mediaType, mediaUrl, caption = '', options = {}) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { success: false, error: 'Base URL ou Token não configurado' };
  try {
    const type = MEDIA_TYPE_MAP[String(mediaType || '').toLowerCase()] || 'document';
    const body = { number: onlyDigits(phone), type, file: mediaUrl };
    if (caption) { body.text = caption; body.caption = caption; }
    if (options.docName) body.docName = options.docName;
    if (options.thumbnail) body.thumbnail = options.thumbnail;
    if (options.mimetype) body.mimetype = options.mimetype;
    const response = await fetch(`${base}/send/media`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Failed to send media (HTTP ${response.status})`;
      logWarn('uazapi.send_media_failed', { status_code: response.status, body_preview: String(rawText || '').slice(0, 500) });
      return { success: false, error: errorMsg };
    }
    return { success: true, messageId: data?.messageid || data?.messageId || data?.id || null, raw: data };
  } catch (error) {
    logError('uazapi.send_media_exception', error, {});
    return { success: false, error: error.message };
  }
}

export async function sendContact(baseUrl, token, phone, contact) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { success: false, error: 'Base URL ou Token não configurado' };
  try {
    const body = { number: onlyDigits(phone), ...(contact || {}) };
    const response = await fetch(`${base}/send/contact`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      const errorMsg = data?.message || data?.error || `Failed to send contact (HTTP ${response.status})`;
      return { success: false, error: errorMsg };
    }
    return { success: true, messageId: data?.messageid || data?.messageId || data?.id || null, raw: data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function fetchContacts(baseUrl, token) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { success: false, error: 'Base URL ou Token não configurado', contacts: [] };
  try {
    const response = await fetch(`${base}/contacts?contactScope=all`, {
      method: 'GET',
      headers: getHeaders(token),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      return { success: false, error: data?.message || data?.error || `HTTP ${response.status}`, contacts: [] };
    }
    const contacts = Array.isArray(data) ? data : (data?.contacts || data?.data || []);
    return { success: true, contacts, total: contacts.length };
  } catch (error) {
    return { success: false, error: error.message, contacts: [] };
  }
}

/**
 * Configure the webhook URL on the Uazapi instance so incoming messages
 * are delivered to the Enerlight backend.
 * POST {base}/webhook  (best-effort; Uazapi panels vary by version)
 * Returns { success, error?, raw? }
 */
export async function configureWebhook(baseUrl, token, webhookUrl) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base || !token) return { success: false, error: 'Base URL ou Token não configurado' };
  if (!webhookUrl) return { success: false, error: 'URL de webhook não informada' };
  try {
    const response = await fetch(`${base}/webhook`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({
        url: webhookUrl,
        webhook: webhookUrl,
        enabled: true,
        events: ['messages', 'connection', 'status'],
      }),
    });
    const { data, rawText } = await parseJsonSafe(response);
    if (!response.ok) {
      const errMsg = data?.message || data?.error || `HTTP ${response.status}`;
      logWarn('uazapi.configure_webhook_failed', { status_code: response.status, body_preview: String(rawText || '').slice(0, 300) });
      return { success: false, error: errMsg, raw: rawText };
    }
    logInfo('uazapi.configure_webhook_ok', { webhook_url: webhookUrl });
    return { success: true, raw: data };
  } catch (error) {
    logError('uazapi.configure_webhook_exception', error, {});
    return { success: false, error: error.message };
  }
}

/**
 * Generic send used by the unified provider (chat.js, scheduled-messages, notifications)
 * Maps internal messageType -> Uazapi endpoints.
 */
export async function sendMessage(baseUrl, token, phone, content, messageType, mediaUrl) {
  const type = String(messageType || 'text').toLowerCase();
  if (type === 'text') return sendText(baseUrl, token, phone, content);
  if (type === 'audio' || type === 'ptt' || type === 'myaudio') {
    return sendMedia(baseUrl, token, phone, 'ptt', mediaUrl || content, '');
  }
  if (type === 'image' || type === 'video' || type === 'document' || type === 'sticker') {
    return sendMedia(baseUrl, token, phone, type, mediaUrl, content);
  }
  // contact card
  if (type === 'contact') {
    return sendContact(baseUrl, token, phone, typeof content === 'object' ? content : { fullName: String(content || '') });
  }
  return sendText(baseUrl, token, phone, content);
}
