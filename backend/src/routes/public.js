import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Public endpoint to get branding settings (no auth required)
router.get('/branding', async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM system_settings 
       WHERE key IN ('logo_login', 'logo_sidebar', 'logo_topbar', 'logo_login_light', 'logo_sidebar_light', 'logo_topbar_light', 'favicon', 'company_name')`
    );

    const branding = {
      logo_login: null,
      logo_sidebar: null,
      logo_topbar: null,
      logo_login_light: null,
      logo_sidebar_light: null,
      logo_topbar_light: null,
      favicon: null,
      company_name: null,
    };
    for (const row of result.rows) {
      branding[row.key] = row.value;
    }

    // Fallback: use logo_sidebar as logo_topbar if not set
    if (!branding.logo_topbar && branding.logo_sidebar) {
      branding.logo_topbar = branding.logo_sidebar;
    }
    if (!branding.logo_topbar_light && branding.logo_sidebar_light) {
      branding.logo_topbar_light = branding.logo_sidebar_light;
    }

    res.json(branding);
  } catch (error) {
    console.error('Get branding error:', error);
    res.status(500).json({ error: 'Erro ao buscar branding' });
  }
});

// Public endpoint for pre-registration (creates a prospect in the main organization)
router.post('/pre-register', async (req, res) => {
  try {
    const { name, email, whatsapp, company, city, state, source } = req.body;

    // Validate inputs
    if (!name || !whatsapp) {
      return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios' });
    }

    // Sanitize phone - keep only digits
    const phone = whatsapp.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return res.status(400).json({ error: 'WhatsApp inválido' });
    }

    // Normalize phone for prospect consistency (add 55 if needed)
    let normalizedPhone = phone.replace(/^0+/, '');
    if (normalizedPhone.length <= 11) {
      normalizedPhone = '55' + normalizedPhone;
    }

    const sanitizedName = name.trim().slice(0, 100);
    const sanitizedEmail = email?.trim().toLowerCase().slice(0, 255) || null;

    // Find superadmin user to get the main organization
    const superadminResult = await query(
      `SELECT u.id, om.organization_id 
       FROM users u 
       JOIN organization_members om ON om.user_id = u.id 
       WHERE u.is_superadmin = true 
       LIMIT 1`
    );

    if (superadminResult.rows.length === 0) {
      console.error('Pre-register: No superadmin found');
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }

    const superadmin = superadminResult.rows[0];
    const organizationId = superadmin.organization_id;

    // Check if prospect already exists in this organization
    const existingProspect = await query(
      `SELECT id FROM crm_prospects 
       WHERE organization_id = $1 AND phone = $2`,
      [organizationId, normalizedPhone]
    );

    if (existingProspect.rows.length > 0) {
      // Update existing prospect
      await query(
        `UPDATE crm_prospects SET 
           name = $3,
           email = COALESCE($4, email),
           company = COALESCE($5, company),
           city = COALESCE($6, city),
           state = COALESCE($7, state),
           updated_at = NOW()
         WHERE id = $1 AND organization_id = $2`,
        [existingProspect.rows[0].id, organizationId, sanitizedName, sanitizedEmail, company?.trim(), city?.trim(), state?.trim()]
      );
      
      return res.json({ success: true, message: 'Prospect atualizado' });
    }

    // Create the prospect
    const prospectResult = await query(
      `INSERT INTO crm_prospects (
         organization_id, name, phone, email, company, city, state, source, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        organizationId,
        sanitizedName,
        normalizedPhone,
        sanitizedEmail,
        company?.trim() || null,
        city?.trim() || null,
        state?.trim() || null,
        source || 'Calculadora Luminotécnica',
        superadmin.id
      ]
    );

    console.log(`Pre-register: Created prospect ${prospectResult.rows[0].id} for ${normalizedPhone}`);
    res.json({ success: true, message: 'Cadastro recebido com sucesso' });

  } catch (error) {
    console.error('Pre-register error:', error);
    res.status(500).json({ error: 'Erro ao processar cadastro' });
  }
});

// Public endpoint to save project history
router.post('/save-project', async (req, res) => {
  try {
    const { whatsapp, project_data } = req.body;

    if (!whatsapp || !project_data) {
      return res.status(400).json({ error: 'WhatsApp e dados do projeto são obrigatórios' });
    }

    const phone = whatsapp.replace(/\D/g, '');
    let normalizedPhone = phone.replace(/^0+/, '');
    if (normalizedPhone.length <= 11) {
      normalizedPhone = '55' + normalizedPhone;
    }

    // Find the prospect first to get organization_id
    const prospectResult = await query(
      `SELECT p.id, p.organization_id, p.custom_fields 
       FROM crm_prospects p
       WHERE p.phone = $1
       ORDER BY p.created_at DESC LIMIT 1`,
      [normalizedPhone]
    );

    if (prospectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prospect não encontrado' });
    }

    const prospect = prospectResult.rows[0];
    
    // Update custom_fields with project history
    const customFields = prospect.custom_fields || {};
    if (!customFields.lighting_projects) {
      customFields.lighting_projects = [];
    }
    
    // Add new project with timestamp
    customFields.lighting_projects.unshift({
      ...project_data,
      saved_at: new Date().toISOString()
    });
    
    // Limit to last 10 projects
    customFields.lighting_projects = customFields.lighting_projects.slice(0, 10);

    await query(
      `UPDATE crm_prospects SET custom_fields = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(customFields), prospect.id]
    );

    res.json({ success: true, message: 'Projeto salvo com sucesso' });
  } catch (error) {
    console.error('Save project error:', error);
    res.status(500).json({ error: 'Erro ao salvar projeto' });
  }
});

export default router;
