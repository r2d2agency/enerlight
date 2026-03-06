import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import * as wapiProvider from '../lib/wapi-provider.js';

const router = Router();
router.use(authenticate);

// Helper to get user's organization
async function getUserOrganization(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// List connections (respects connection_members restrictions)
router.get('/', async (req, res) => {
  try {
    const org = await getUserOrganization(req.userId);
    const isHighRole = org && ['owner', 'admin'].includes(org.role);

    // Check if user has specific connection assignments
    const specificResult = await query(
      `SELECT DISTINCT cm.connection_id FROM connection_members cm WHERE cm.user_id = $1`,
      [req.userId]
    );
    
    // Owner/Admin sees ALL connections in the organization (for admin/management pages)
    if (isHighRole && org) {
      const result = await query(
        `SELECT c.*, u.name as created_by_name,
         CASE 
           WHEN c.provider IS NOT NULL THEN c.provider 
           WHEN c.instance_id IS NOT NULL AND c.wapi_token IS NOT NULL THEN 'wapi'
           ELSE 'evolution'
         END as provider
         FROM connections c
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.organization_id = $1
         ORDER BY c.created_at DESC`,
        [org.organization_id]
      );
      return res.json(result.rows);
    }

    if (specificResult.rows.length > 0) {
      // User has specific connections assigned - return only those
      const connIds = specificResult.rows.map(r => r.connection_id);
      const result = await query(
        `SELECT c.*, u.name as created_by_name,
         CASE 
           WHEN c.provider IS NOT NULL THEN c.provider 
           WHEN c.instance_id IS NOT NULL AND c.wapi_token IS NOT NULL THEN 'wapi'
           ELSE 'evolution'
         END as provider
         FROM connections c
         LEFT JOIN users u ON c.user_id = u.id
         WHERE c.id = ANY($1)
         ORDER BY c.created_at DESC`,
        [connIds]
      );
      return res.json(result.rows);
    }

    // No connection assignments at all: empty list
    res.json([]);
  } catch (error) {
    console.error('List connections error:', error);
    res.status(500).json({ error: 'Erro ao listar conexões' });
  }
});

// Create connection
router.post('/', async (req, res) => {
  try {
    const { 
      provider = 'evolution', 
      api_url, 
      api_key, 
      instance_name, 
      instance_id,
      wapi_token,
      name 
    } = req.body;

    // Validate based on provider
    if (provider === 'wapi') {
      if (!instance_id || !wapi_token) {
        return res.status(400).json({ error: 'Instance ID e Token são obrigatórios para W-API' });
      }
    } else {
      if (!api_url || !api_key || !instance_name) {
        return res.status(400).json({ error: 'URL, API Key e nome da instância são obrigatórios' });
      }
    }

    const org = await getUserOrganization(req.userId);

    const result = await query(
      `INSERT INTO connections (user_id, organization_id, provider, api_url, api_key, instance_name, instance_id, wapi_token, name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        req.userId, 
        org?.organization_id || null, 
        provider,
        api_url || null, 
        api_key || null, 
        instance_name || null,
        instance_id || null,
        wapi_token || null,
        name || instance_name || instance_id
      ]
    );

    const connection = result.rows[0];

    // Auto-configure webhooks for W-API connections
    if (provider === 'wapi') {
      try {
        const webhookResult = await wapiProvider.configureWebhooks(instance_id, wapi_token, query);
        console.log('[W-API] Webhook configuration result:', webhookResult);
        connection.webhooks_configured = webhookResult.success;
        connection.webhooks_count = webhookResult.configured;
      } catch (webhookError) {
        console.error('[W-API] Failed to configure webhooks:', webhookError);
        connection.webhooks_configured = false;
      }
    }

    res.status(201).json(connection);
  } catch (error) {
    console.error('Create connection error:', error);
    res.status(500).json({ error: 'Erro ao criar conexão' });
  }
});

// Update connection
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      provider,
      api_url, 
      api_key, 
      instance_name, 
      instance_id,
      wapi_token,
      name, 
      status,
      show_groups
    } = req.body;

    const org = await getUserOrganization(req.userId);

    // Allow update if user owns the connection OR belongs to same organization
    let whereClause = 'id = $10 AND user_id = $11';
    let params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, show_groups, id, req.userId];

    if (org) {
      whereClause = 'id = $10 AND organization_id = $11';
      params = [provider, api_url, api_key, instance_name, instance_id, wapi_token, name, status, show_groups, id, org.organization_id];
    }

    const result = await query(
      `UPDATE connections 
       SET provider = COALESCE($1, provider),
           api_url = COALESCE($2, api_url),
           api_key = COALESCE($3, api_key),
           instance_name = COALESCE($4, instance_name),
           instance_id = COALESCE($5, instance_id),
           wapi_token = COALESCE($6, wapi_token),
           name = COALESCE($7, name),
           status = COALESCE($8, status),
           show_groups = COALESCE($9, show_groups),
           updated_at = NOW()
       WHERE ${whereClause}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update connection error:', error);
    res.status(500).json({ error: 'Erro ao atualizar conexão' });
  }
});

// Delete connection
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const org = await getUserOrganization(req.userId);

    // Allow delete if user owns the connection OR belongs to same organization (with permission)
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org && ['owner', 'admin', 'manager'].includes(org.role)) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const result = await query(
      `DELETE FROM connections WHERE ${whereClause} RETURNING id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({ error: 'Erro ao deletar conexão' });
  }
});

// Reconfigure webhooks for W-API connection
router.post('/:id/configure-webhooks', async (req, res) => {
  try {
    const { id } = req.params;
    const org = await getUserOrganization(req.userId);

    // Get connection
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];

    if (org) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const connResult = await query(
      `SELECT * FROM connections WHERE ${whereClause}`,
      params
    );

    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    const provider =
      connection.provider ||
      (connection.instance_id && connection.wapi_token ? 'wapi' : 'evolution');

    if (provider !== 'wapi') {
      return res.status(400).json({ error: 'Esta funcionalidade é apenas para conexões W-API' });
    }

    if (!connection.instance_id || !connection.wapi_token) {
      return res.status(400).json({ error: 'Instance ID e Token não configurados' });
    }

    // Configure webhooks
    const result = await wapiProvider.configureWebhooks(connection.instance_id, connection.wapi_token, query);

    // Backfill provider for older rows
    if (connection.provider !== 'wapi') {
      await query('UPDATE connections SET provider = $1, updated_at = NOW() WHERE id = $2', ['wapi', id]);
    }

    res.json({
      success: result.success,
      message: result.success 
        ? `${result.configured}/${result.total} webhooks configurados com sucesso` 
        : 'Falha ao configurar webhooks',
      details: result.results,
    });
  } catch (error) {
    console.error('Configure webhooks error:', error);
    res.status(500).json({ error: 'Erro ao configurar webhooks' });
  }
});

// Auto-create W-API instance using integrator token
router.post('/wapi/auto-create', async (req, res) => {
  try {
    const { name, rejectCalls = true, callMessage = 'Não estamos disponíveis no momento.' } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da conexão é obrigatório' });
    }

    // Get integrator token from system_settings
    const tokenResult = await query(
      `SELECT value FROM system_settings WHERE key = 'wapi_integrator_token'`
    );
    const integratorToken = tokenResult.rows[0]?.value;

    if (!integratorToken) {
      return res.status(400).json({ error: 'Token de integrador W-API não configurado. Configure em Admin > Integrações.' });
    }

    // Call W-API create-instance endpoint
    const response = await fetch('https://api.w-api.app/v1/integrator/create-instance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${integratorToken}`,
      },
      body: JSON.stringify({
        instanceName: name.trim(),
        rejectCalls: !!rejectCalls,
        callMessage: callMessage || '',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[W-API] Create instance failed:', response.status, errorData);
      return res.status(400).json({ 
        error: errorData.message || errorData.error || `Erro ao criar instância W-API (HTTP ${response.status})` 
      });
    }

    const instanceData = await response.json();
    console.log('[W-API] Instance created:', JSON.stringify(instanceData));

    // Extract instance_id and token from response
    const instanceId = instanceData.id || instanceData.instanceId || instanceData.instance_id;
    const wapiToken = instanceData.token || instanceData.apiToken || instanceData.api_token;

    if (!instanceId || !wapiToken) {
      console.error('[W-API] Missing data in response:', instanceData);
      return res.status(400).json({ error: 'Resposta da W-API não contém instanceId ou token' });
    }

    // Save connection in our database
    const org = await getUserOrganization(req.userId);

    const result = await query(
      `INSERT INTO connections (user_id, organization_id, provider, instance_id, wapi_token, name)
       VALUES ($1, $2, 'wapi', $3, $4, $5) RETURNING *`,
      [req.userId, org?.organization_id || null, instanceId, wapiToken, name.trim()]
    );

    const connection = result.rows[0];

    // Auto-configure webhooks
    try {
      const webhookResult = await wapiProvider.configureWebhooks(instanceId, wapiToken, query);
      console.log('[W-API] Auto webhook config result:', webhookResult);
      connection.webhooks_configured = webhookResult.success;
    } catch (webhookError) {
      console.error('[W-API] Auto webhook config failed:', webhookError);
    }

    res.status(201).json({
      ...connection,
      provider: 'wapi',
      wapi_instance_created: true,
    });
  } catch (error) {
    console.error('Auto-create W-API instance error:', error);
    res.status(500).json({ error: 'Erro ao criar instância W-API automaticamente' });
  }
});

// Sync W-API conversations (import chats into our system)
router.post('/:id/wapi/sync-conversations', async (req, res) => {
  try {
    const { id } = req.params;
    const org = await getUserOrganization(req.userId);

    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];
    if (org) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const connResult = await query(`SELECT * FROM connections WHERE ${whereClause}`, params);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];
    const provider = connection.provider || (connection.instance_id && connection.wapi_token ? 'wapi' : 'evolution');

    if (provider !== 'wapi') {
      return res.status(400).json({ error: 'Sincronização disponível apenas para conexões W-API' });
    }

    if (!connection.instance_id || !connection.wapi_token) {
      return res.status(400).json({ error: 'Instance ID e Token não configurados' });
    }

    // 1. Get all chats from W-API
    const chatsResult = await wapiProvider.getAllChatsForSync(connection.instance_id, connection.wapi_token);
    if (!chatsResult.success) {
      return res.status(502).json({ error: `Erro ao buscar chats: ${chatsResult.error}` });
    }

    const chats = chatsResult.chats;
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const chat of chats) {
      try {
        const jid = chat.jid || chat.id || chat.remoteJid || chat.from || chat.chatId || '';
        if (!jid) { skipped++; continue; }

        const isGroup = jid.includes('@g.us');
        let phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@g.us', '').replace(/\D/g, '');
        if (!phone && !isGroup) { skipped++; continue; }

        const name = chat.name || chat.pushName || chat.notify || chat.verifiedName || 
                     chat.formattedName || chat.displayName || chat.contact?.name || 
                     chat.contact?.pushName || phone || jid;

        const profilePicture = chat.profilePicture || chat.profilePictureUrl || 
                               chat.imgUrl || chat.picture || chat.contact?.profilePictureUrl || null;

        // Check if conversation already exists
        const existingConv = await query(
          `SELECT id, contact_name, profile_picture_url FROM conversations 
           WHERE connection_id = $1 AND (remote_jid = $2 OR contact_phone = $3)
           LIMIT 1`,
          [connection.id, jid, phone]
        );

        if (existingConv.rows.length > 0) {
          // Update name/picture if changed
          const existing = existingConv.rows[0];
          const needsUpdate = (name && name !== phone && existing.contact_name !== name) || 
                              (profilePicture && existing.profile_picture_url !== profilePicture);
          
          if (needsUpdate) {
            const updates = [];
            const updateParams = [];
            let pi = 1;

            if (name && name !== phone && existing.contact_name !== name) {
              updates.push(`contact_name = $${pi++}`);
              updateParams.push(name);
            }
            if (profilePicture && existing.profile_picture_url !== profilePicture) {
              updates.push(`profile_picture_url = $${pi++}`);
              updateParams.push(profilePicture);
            }
            updates.push(`updated_at = NOW()`);
            updateParams.push(existing.id);

            if (updates.length > 1) {
              await query(
                `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${pi}`,
                updateParams
              );
              updated++;
            }
          } else {
            skipped++;
          }
        } else {
          // Create new conversation
          await query(
            `INSERT INTO conversations 
              (connection_id, remote_jid, contact_phone, contact_name, profile_picture_url, is_group, is_archived, unread_count, attendance_status, created_at, updated_at, last_message_at)
             VALUES ($1, $2, $3, $4, $5, $6, false, 0, 'waiting', NOW(), NOW(), NOW())`,
            [connection.id, jid, phone, name, profilePicture, isGroup]
          );
          imported++;
        }
      } catch (chatErr) {
        console.error('[W-API Sync] Error processing chat:', chatErr.message);
        skipped++;
      }
    }

    res.json({
      success: true,
      imported,
      updated,
      skipped,
      total: chats.length,
      message: `Sincronização concluída: ${imported} novas conversas, ${updated} atualizadas, ${skipped} ignoradas`,
    });
  } catch (error) {
    console.error('Sync W-API conversations error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar conversas' });
  }
});

// Sync messages for a specific W-API conversation
router.post('/:id/wapi/sync-messages', async (req, res) => {
  try {
    const { id } = req.params;
    const { conversationId } = req.body;
    
    if (!conversationId) {
      return res.status(400).json({ error: 'conversationId é obrigatório' });
    }

    const org = await getUserOrganization(req.userId);
    let whereClause = 'id = $1 AND user_id = $2';
    let params = [id, req.userId];
    if (org) {
      whereClause = 'id = $1 AND organization_id = $2';
      params = [id, org.organization_id];
    }

    const connResult = await query(`SELECT * FROM connections WHERE ${whereClause}`, params);
    if (connResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conexão não encontrada' });
    }

    const connection = connResult.rows[0];

    // Get conversation
    const convResult = await query(
      `SELECT * FROM conversations WHERE id = $1 AND connection_id = $2`,
      [conversationId, connection.id]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const conversation = convResult.rows[0];
    const chatId = conversation.remote_jid;

    if (!chatId) {
      return res.status(400).json({ error: 'Conversa sem remote_jid' });
    }

    // Fetch messages from W-API
    const messagesResult = await wapiProvider.getChatMessages(
      connection.instance_id, connection.wapi_token, chatId, 500
    );

    if (!messagesResult.success) {
      return res.status(502).json({ error: `Erro ao buscar mensagens: ${messagesResult.error}` });
    }

    let imported = 0;
    let skippedMsgs = 0;

    for (const msg of messagesResult.messages) {
      try {
        const messageId = msg.id || msg.key?.id || msg.messageId || msg._id;
        if (!messageId) { skippedMsgs++; continue; }

        // Check if already exists
        const existing = await query(`SELECT id FROM chat_messages WHERE message_id = $1`, [messageId]);
        if (existing.rows.length > 0) { skippedMsgs++; continue; }

        // Extract content
        const msgBody = msg.message || msg.body || msg;
        let content = '';
        let messageType = 'text';
        let mediaUrl = null;
        let mediaMimetype = null;
        const fromMe = msg.fromMe ?? msg.key?.fromMe ?? false;

        // Text
        if (typeof msgBody === 'string') {
          content = msgBody;
        } else if (msgBody.conversation) {
          content = msgBody.conversation;
        } else if (msgBody.extendedTextMessage?.text) {
          content = msgBody.extendedTextMessage.text;
        } else if (msg.body && typeof msg.body === 'string') {
          content = msg.body;
        } else if (msg.text) {
          content = msg.text;
        } else if (msg.caption) {
          content = msg.caption;
        }

        // Media
        if (msgBody.imageMessage || msg.type === 'image') {
          messageType = 'image';
          content = content || msgBody.imageMessage?.caption || '[Imagem]';
          mediaMimetype = msgBody.imageMessage?.mimetype || null;
          mediaUrl = msgBody.imageMessage?.url || msg.mediaUrl || null;
        } else if (msgBody.videoMessage || msg.type === 'video') {
          messageType = 'video';
          content = content || msgBody.videoMessage?.caption || '[Vídeo]';
          mediaMimetype = msgBody.videoMessage?.mimetype || null;
          mediaUrl = msgBody.videoMessage?.url || msg.mediaUrl || null;
        } else if (msgBody.audioMessage || msg.type === 'audio' || msg.type === 'ptt') {
          messageType = 'audio';
          content = content || '[Áudio]';
          mediaMimetype = msgBody.audioMessage?.mimetype || null;
          mediaUrl = msgBody.audioMessage?.url || msg.mediaUrl || null;
        } else if (msgBody.documentMessage || msg.type === 'document') {
          messageType = 'document';
          content = content || msgBody.documentMessage?.fileName || '[Documento]';
          mediaMimetype = msgBody.documentMessage?.mimetype || null;
          mediaUrl = msgBody.documentMessage?.url || msg.mediaUrl || null;
        } else if (msgBody.stickerMessage || msg.type === 'sticker') {
          messageType = 'sticker';
          content = content || '[Figurinha]';
          mediaUrl = msgBody.stickerMessage?.url || msg.mediaUrl || null;
        }

        if (!content && messageType === 'text') {
          content = '[Mensagem não suportada]';
        }

        // Timestamp
        const timestamp = msg.messageTimestamp || msg.timestamp || msg.t;
        const msgDate = timestamp
          ? new Date(typeof timestamp === 'number' && timestamp < 9999999999 ? timestamp * 1000 : timestamp)
          : new Date();

        await query(
          `INSERT INTO chat_messages 
            (conversation_id, message_id, from_me, content, message_type, media_url, media_mimetype, status, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [conversationId, messageId, fromMe, content, messageType, mediaUrl, mediaMimetype, 'received', msgDate]
        );
        imported++;
      } catch (msgErr) {
        console.error('[W-API Sync] Error importing message:', msgErr.message);
        skippedMsgs++;
      }
    }

    // Update conversation timestamps
    await query(
      `UPDATE conversations SET 
        last_message_at = COALESCE((SELECT MAX(timestamp) FROM chat_messages WHERE conversation_id = $1), NOW()),
        updated_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );

    res.json({
      success: true,
      imported,
      skipped: skippedMsgs,
      total: messagesResult.messages.length,
      message: `${imported} mensagens importadas`,
    });
  } catch (error) {
    console.error('Sync W-API messages error:', error);
    res.status(500).json({ error: 'Erro ao sincronizar mensagens' });
  }
});

export default router;

