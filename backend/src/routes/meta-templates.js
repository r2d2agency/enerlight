import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

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

    const { to, template_name, language_code, components } = req.body;

    if (!to || !template_name) {
      return res.status(400).json({ error: 'to e template_name são obrigatórios' });
    }

    // Format number
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
