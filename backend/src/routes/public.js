import { Router } from 'express';
import { query } from '../db.js';
import { logError } from '../logger.js';

const router = Router();

// Public endpoint to get branding settings (no auth required)
router.get('/branding', async (req, res) => {
  try {
    const result = await query(
      `SELECT key, value FROM system_settings 
       WHERE key IN ('logo_login', 'logo_sidebar', 'logo_topbar', 'logo_login_light', 'logo_sidebar_light', 'logo_topbar_light', 'favicon', 'company_name', 'nfc_default_logo')`
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
      nfc_default_logo: null,
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

    // Use provided organization_id or find the best candidate organization
    let organizationId = req.body.organization_id;
    let superadminId = null;

    // Logic to resolve organizationId and a default user to attribute the prospect to
    const resolveOrgAndUser = async (id) => {
      let orgId = id;
      let userId = null;

      if (orgId) {
        // Verify if this specific org exists
        const orgCheck = await query('SELECT id FROM organizations WHERE id = $1', [orgId]);
        if (orgCheck.rows.length === 0) {
          console.warn(`Pre-register: Provided org_id ${orgId} not found, falling back.`);
          orgId = null;
        }
      }

      if (!orgId) {
        // Fallback 1: Try to find Enerlight by name
        const enerlightOrg = await query("SELECT id FROM organizations WHERE name ILIKE '%enerlight%' LIMIT 1");
        if (enerlightOrg.rows.length > 0) {
          orgId = enerlightOrg.rows[0].id;
        } else {
          // Fallback 2: Any organization
          const anyOrg = await query("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1");
          if (anyOrg.rows.length > 0) {
            orgId = anyOrg.rows[0].id;
          }
        }
      }

      if (!orgId) return { orgId: null, userId: null };

      // Find a user for this org (prefer owner/admin)
      const userResult = await query(
        `SELECT user_id FROM organization_members 
         WHERE organization_id = $1 
         ORDER BY (CASE WHEN role = 'owner' THEN 1 WHEN role = 'admin' THEN 2 ELSE 3 END) ASC 
         LIMIT 1`,
        [orgId]
      );
      userId = userResult.rows[0]?.user_id;

      return { orgId, userId };
    };

    const resolved = await resolveOrgAndUser(organizationId);
    organizationId = resolved.orgId;
    superadminId = resolved.userId;

    if (!organizationId) {
      console.error('Pre-register: No organization found in the system');
      return res.status(500).json({ error: 'Nenhuma organização configurada no sistema' });
    }

    // Check if prospect already exists in this organization
    let existingProspect;
    try {
      // Use a more robust check that doesn't fail if the table is missing or columns are weird
      const checkResult = await query(
        `SELECT id FROM crm_prospects 
         WHERE organization_id = $1 AND phone = $2 
         LIMIT 1`,
        [organizationId, normalizedPhone]
      );
      existingProspect = checkResult.rows[0];
    } catch (err) {
      console.error('Pre-register check error:', err.message);
      // If table doesn't exist, we might need to handle it or at least log it better
      return res.status(500).json({ error: 'Erro ao verificar prospect: ' + err.message });
    }

    if (existingProspect) {
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
        [existingProspect.id, organizationId, sanitizedName, sanitizedEmail, company?.trim(), city?.trim(), state?.trim()]
      );
      
      return res.json({ success: true, message: 'Prospect atualizado' });
    }

    // Create the prospect
    try {
      // First, get valid columns for crm_prospects to avoid 500 if email or other columns don't exist yet
      const columnsResult = await query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'crm_prospects'"
      );
      const validColumns = columnsResult.rows.map(r => r.column_name);
      
      const insertData = {
        organization_id: organizationId,
        name: sanitizedName,
        phone: normalizedPhone,
        source: source || 'Calculadora Luminotécnica',
        created_by: superadminId
      };
      
      // Optional columns that might not exist in all versions of the DB
      if (validColumns.includes('email')) insertData.email = sanitizedEmail;
      if (validColumns.includes('company')) insertData.company = company?.trim() || null;
      if (validColumns.includes('city')) insertData.city = city?.trim() || null;
      if (validColumns.includes('state')) insertData.state = state?.trim() || null;
      
      const cols = Object.keys(insertData);
      const vals = Object.values(insertData);
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
      
      const prospectResult = await query(
        `INSERT INTO crm_prospects (${cols.join(', ')}) 
         VALUES (${placeholders})
         RETURNING id`,
        vals
      );

      console.log(`Pre-register: Created prospect ${prospectResult.rows[0].id} for ${normalizedPhone}`);
      return res.json({ success: true, message: 'Cadastro recebido com sucesso' });
    } catch (insertErr) {
      console.error('Pre-register insert error:', insertErr.message);
      // Check for race condition (unique violation)
      if (insertErr.code === '23505') {
        return res.json({ success: true, message: 'Prospect já cadastrado' });
      }
      return res.status(500).json({ error: 'Erro ao criar prospect: ' + insertErr.message });
    }

  } catch (error) {
    logError('pre_register_failed', error, { body: req.body });
    res.status(500).json({ error: 'Erro interno ao processar cadastro: ' + error.message });
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
