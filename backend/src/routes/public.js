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

// Public endpoint for pre-registration (creates a deal in superadmin's CRM)
router.post('/pre-register', async (req, res) => {
  try {
    const { name, email, whatsapp, source } = req.body;

    // Validate inputs
    if (!name || !email || !whatsapp) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Sanitize phone - keep only digits
    const phone = whatsapp.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      return res.status(400).json({ error: 'WhatsApp inválido' });
    }

    // Sanitize name - limit length
    const sanitizedName = name.trim().slice(0, 100);
    const sanitizedEmail = email.trim().toLowerCase().slice(0, 255);

    // Find superadmin user
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

    // Find or create a funnel for leads
    let funnelResult = await query(
      `SELECT id FROM crm_funnels 
       WHERE organization_id = $1 AND is_active = true 
       ORDER BY created_at ASC LIMIT 1`,
      [organizationId]
    );

    let funnelId;
    let stageId;

    if (funnelResult.rows.length === 0) {
      // Create a default leads funnel
      const newFunnel = await query(
        `INSERT INTO crm_funnels (organization_id, name, description, color)
         VALUES ($1, 'Leads Landing Page', 'Leads capturados pela landing page', '#6366f1')
         RETURNING id`,
        [organizationId]
      );
      funnelId = newFunnel.rows[0].id;

      // Create stages
      await query(
        `INSERT INTO crm_stages (funnel_id, name, color, position, inactivity_hours, inactivity_color, is_final)
         VALUES 
           ($1, 'Novo Lead', '#3b82f6', 0, 24, '#ef4444', false),
           ($1, 'Contato Inicial', '#8b5cf6', 1, 48, '#ef4444', false),
           ($1, 'Demonstração', '#f59e0b', 2, 72, '#ef4444', false),
           ($1, 'Proposta', '#22c55e', 3, 96, '#ef4444', false),
           ($1, 'Fechado', '#10b981', 4, 0, '#22c55e', true)`,
        [funnelId]
      );

      // Get first stage
      const stageResult = await query(
        `SELECT id FROM crm_stages WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
        [funnelId]
      );
      stageId = stageResult.rows[0].id;
    } else {
      funnelId = funnelResult.rows[0].id;
      
      // Get first stage of existing funnel
      const stageResult = await query(
        `SELECT id FROM crm_stages WHERE funnel_id = $1 ORDER BY position ASC LIMIT 1`,
        [funnelId]
      );
      
      if (stageResult.rows.length === 0) {
        // Create a default stage if none exists
        const newStage = await query(
          `INSERT INTO crm_stages (funnel_id, name, color, position, inactivity_hours, inactivity_color, is_final)
           VALUES ($1, 'Novo Lead', '#3b82f6', 0, 24, '#ef4444', false)
           RETURNING id`,
          [funnelId]
        );
        stageId = newStage.rows[0].id;
      } else {
        stageId = stageResult.rows[0].id;
      }
    }

    // Get or create default company
    let companyResult = await query(
      `SELECT id FROM crm_companies 
       WHERE organization_id = $1 AND name = 'Leads Landing Page' 
       LIMIT 1`,
      [organizationId]
    );

    let companyId;
    if (companyResult.rows.length === 0) {
      const newCompany = await query(
        `INSERT INTO crm_companies (organization_id, name, created_by)
         VALUES ($1, 'Leads Landing Page', $2)
         RETURNING id`,
        [organizationId, superadmin.id]
      );
      companyId = newCompany.rows[0].id;
    } else {
      companyId = companyResult.rows[0].id;
    }

    // Check if lead with same email or phone already exists
    const existingDeal = await query(
      `SELECT d.id FROM crm_deals d
       WHERE d.organization_id = $1 
         AND (d.description ILIKE $2 OR d.description ILIKE $3)
       LIMIT 1`,
      [organizationId, `%${sanitizedEmail}%`, `%${phone}%`]
    );

    if (existingDeal.rows.length > 0) {
      // Update existing deal to move back to first stage
      await query(
        `UPDATE crm_deals SET 
           last_activity_at = NOW(), 
           updated_at = NOW(),
           description = $2
         WHERE id = $1`,
        [existingDeal.rows[0].id, `Email: ${sanitizedEmail}\nWhatsApp: ${phone}\nOrigem: ${source || 'Landing Page'}\n\nAtualizado em: ${new Date().toLocaleString('pt-BR')}`]
      );
      
      return res.json({ success: true, message: 'Lead atualizado' });
    }

    // Create the deal
    const dealResult = await query(
      `INSERT INTO crm_deals (
         organization_id, funnel_id, stage_id, company_id, 
         title, value, probability, status, 
         description, owner_id, created_by
       ) VALUES ($1, $2, $3, $4, $5, 0, 10, 'open', $6, $7, $7)
       RETURNING id`,
      [
        organizationId,
        funnelId,
        stageId,
        companyId,
        `Lead: ${sanitizedName}`,
        `Nome: ${sanitizedName}\nEmail: ${sanitizedEmail}\nWhatsApp: ${phone}\nOrigem: ${source || 'Landing Page'}\n\nCadastrado em: ${new Date().toLocaleString('pt-BR')}`,
        superadmin.id
      ]
    );

    // Log history
    await query(
      `INSERT INTO crm_deal_history (deal_id, user_id, action, to_value)
       VALUES ($1, $2, 'created', 'Lead via Landing Page')`,
      [dealResult.rows[0].id, superadmin.id]
    );

    console.log(`Pre-register: Created deal ${dealResult.rows[0].id} for ${sanitizedEmail}`);
    res.json({ success: true, message: 'Cadastro recebido com sucesso' });

  } catch (error) {
    console.error('Pre-register error:', error);
    res.status(500).json({ error: 'Erro ao processar cadastro' });
  }
});

export default router;
