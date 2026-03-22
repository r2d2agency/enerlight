import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Helper: get user org
async function getUserOrg(userId) {
  const r = await query(`SELECT om.organization_id FROM organization_members om WHERE om.user_id = $1 LIMIT 1`, [userId]);
  return r.rows[0]?.organization_id;
}

// ========== DOCUMENTS ==========

// List documents
router.get('/', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(`
      SELECT d.*, u.name as creator_name,
        (SELECT COUNT(*) FROM doc_signature_signers WHERE document_id = d.id) as total_signers,
        (SELECT COUNT(*) FROM doc_signature_signers WHERE document_id = d.id AND status = 'signed') as signed_count
      FROM doc_signature_documents d
      LEFT JOIN users u ON d.created_by = u.id
      WHERE d.org_id = $1
      ORDER BY d.created_at DESC
    `, [orgId]);

    res.json(result.rows);
  } catch (error) {
    console.error('List documents error:', error);
    res.status(500).json({ error: 'Erro ao listar documentos' });
  }
});

// Get single document with signers and audit
router.get('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;

    const docResult = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docResult.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });

    const signers = await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1 ORDER BY sign_order`, [id]);
    const placements = await query(`SELECT * FROM doc_signature_placements WHERE document_id = $1`, [id]);
    const audit = await query(`SELECT * FROM doc_signature_audit_log WHERE document_id = $1 ORDER BY created_at DESC`, [id]);

    res.json({
      ...docResult.rows[0],
      signers: signers.rows,
      placements: placements.rows,
      audit_log: audit.rows
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Erro ao buscar documento' });
  }
});

// Create document
router.post('/', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Sem organização' });

    const { title, description, original_url, original_filename, original_mimetype, signers } = req.body;

    if (!title || !original_url) return res.status(400).json({ error: 'Título e arquivo são obrigatórios' });

    const docResult = await query(`
      INSERT INTO doc_signature_documents (org_id, title, description, original_url, original_filename, original_mimetype, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
      RETURNING *
    `, [orgId, title, description, original_url, original_filename || 'document.pdf', original_mimetype || 'application/pdf', req.userId]);

    const doc = docResult.rows[0];

    // Add signers
    if (signers?.length) {
      for (const signer of signers) {
        await query(`
          INSERT INTO doc_signature_signers (document_id, name, email, cpf, phone, role, sign_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [doc.id, signer.name, signer.email, signer.cpf || null, signer.phone || null, signer.role || 'Signatário', signer.sign_order || 1]);
      }
    }

    // Audit log
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'created', $2, $3)
    `, [doc.id, req.ip, JSON.stringify({ created_by: req.userId })]);

    res.status(201).json(doc);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({ error: 'Erro ao criar documento' });
  }
});

// Update document (add/update signers, placements)
router.patch('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;
    const { title, description, status, signers, placements } = req.body;

    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });

    // Update doc fields
    const sets = [];
    const vals = [];
    let idx = 1;
    if (title) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (status) { sets.push(`status = $${idx++}`); vals.push(status); }
    sets.push(`updated_at = NOW()`);
    vals.push(id);

    await query(`UPDATE doc_signature_documents SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    // Replace signers if provided
    if (signers) {
      await query(`DELETE FROM doc_signature_signers WHERE document_id = $1 AND status = 'pending'`, [id]);
      for (const signer of signers) {
        await query(`
          INSERT INTO doc_signature_signers (document_id, name, email, cpf, phone, role, sign_order)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, signer.name, signer.email, signer.cpf || null, signer.phone || null, signer.role || 'Signatário', signer.sign_order || 1]);
      }
    }

    // Replace placements if provided
    if (placements) {
      await query(`DELETE FROM doc_signature_placements WHERE document_id = $1`, [id]);
      for (const p of placements) {
        await query(`
          INSERT INTO doc_signature_placements (document_id, signer_id, page_number, x_position, y_position, width, height)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [id, p.signer_id, p.page_number || 1, p.x_position, p.y_position, p.width || 200, p.height || 80]);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
});

// Send document for signing (change status to pending)
router.post('/:id/send', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    const { id } = req.params;

    const docCheck = await query(`SELECT * FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [id, orgId]);
    if (!docCheck.rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });

    const signers = await query(`SELECT * FROM doc_signature_signers WHERE document_id = $1`, [id]);
    if (!signers.rows.length) return res.status(400).json({ error: 'Adicione ao menos um signatário' });

    await query(`UPDATE doc_signature_documents SET status = 'pending', updated_at = NOW() WHERE id = $1`, [id]);

    // Audit
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, action, ip_address, details)
      VALUES ($1, 'sent', $2, $3)
    `, [id, req.ip, JSON.stringify({ signer_count: signers.rows.length })]);

    // Return signing links
    const links = signers.rows.map(s => ({
      signer_name: s.name,
      signer_email: s.email,
      signing_url: `/assinar/${s.access_token}`
    }));

    res.json({ success: true, signing_links: links });
  } catch (error) {
    console.error('Send document error:', error);
    res.status(500).json({ error: 'Erro ao enviar documento' });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    const orgId = await getUserOrg(req.userId);
    await query(`DELETE FROM doc_signature_documents WHERE id = $1 AND org_id = $2`, [req.params.id, orgId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Erro ao excluir documento' });
  }
});

// ========== PUBLIC SIGNING ENDPOINT (no auth) ==========

// Get document for signing (public via token)
router.get('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const signerResult = await query(`
      SELECT s.*, d.title, d.original_url, d.original_filename, d.status as doc_status
      FROM doc_signature_signers s
      JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1
    `, [token]);

    if (!signerResult.rows[0]) return res.status(404).json({ error: 'Link inválido' });

    const signer = signerResult.rows[0];
    if (signer.doc_status === 'cancelled') return res.status(400).json({ error: 'Documento cancelado' });
    if (signer.status === 'signed') return res.status(400).json({ error: 'Já assinado' });

    // Get placements for this signer
    const placements = await query(`SELECT * FROM doc_signature_placements WHERE signer_id = $1`, [signer.id]);

    // Audit view
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent)
      VALUES ($1, $2, 'viewed', $3, $4)
    `, [signer.document_id, signer.id, req.ip, req.headers['user-agent']]);

    res.json({
      document_title: signer.title,
      document_url: signer.original_url,
      signer_name: signer.name,
      signer_email: signer.email,
      signer_role: signer.role,
      placements: placements.rows,
      status: signer.status
    });
  } catch (error) {
    console.error('Get signing page error:', error);
    res.status(500).json({ error: 'Erro ao carregar página de assinatura' });
  }
});

// Submit signature (public via token)
router.post('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { signature_data, cpf, geolocation } = req.body;

    if (!signature_data) return res.status(400).json({ error: 'Assinatura é obrigatória' });

    const signerResult = await query(`
      SELECT s.*, d.id as doc_id, d.status as doc_status
      FROM doc_signature_signers s
      JOIN doc_signature_documents d ON s.document_id = d.id
      WHERE s.access_token = $1
    `, [token]);

    if (!signerResult.rows[0]) return res.status(404).json({ error: 'Link inválido' });

    const signer = signerResult.rows[0];
    if (signer.status === 'signed') return res.status(400).json({ error: 'Já assinado' });
    if (signer.doc_status === 'cancelled') return res.status(400).json({ error: 'Documento cancelado' });

    // Update signer with signature
    await query(`
      UPDATE doc_signature_signers SET
        status = 'signed',
        signed_at = NOW(),
        signature_data = $1,
        signature_ip = $2,
        signature_user_agent = $3,
        signature_geolocation = $4,
        cpf = COALESCE($5, cpf)
      WHERE id = $6
    `, [signature_data, req.ip, req.headers['user-agent'], geolocation || null, cpf || null, signer.id]);

    // Audit
    await query(`
      INSERT INTO doc_signature_audit_log (document_id, signer_id, action, ip_address, user_agent, geolocation, details)
      VALUES ($1, $2, 'signed', $3, $4, $5, $6)
    `, [signer.doc_id, signer.id, req.ip, req.headers['user-agent'], geolocation || null,
        JSON.stringify({ cpf: cpf || null, signed_at: new Date().toISOString() })]);

    // Check if all signers have signed
    const remaining = await query(`
      SELECT COUNT(*) as cnt FROM doc_signature_signers WHERE document_id = $1 AND status = 'pending'
    `, [signer.doc_id]);

    if (parseInt(remaining.rows[0].cnt) === 0) {
      await query(`UPDATE doc_signature_documents SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [signer.doc_id]);
      await query(`
        INSERT INTO doc_signature_audit_log (document_id, action, details)
        VALUES ($1, 'completed', '{"all_signed": true}')
      `, [signer.doc_id]);
    } else {
      await query(`UPDATE doc_signature_documents SET status = 'partially_signed', updated_at = NOW() WHERE id = $1`, [signer.doc_id]);
    }

    res.json({ success: true, message: 'Assinatura registrada com sucesso' });
  } catch (error) {
    console.error('Sign document error:', error);
    res.status(500).json({ error: 'Erro ao assinar documento' });
  }
});

export default router;
