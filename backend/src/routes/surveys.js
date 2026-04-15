import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

async function getUserOrg(userId) {
  const result = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return result.rows[0];
}

function generateSlug() {
  return crypto.randomBytes(6).toString('hex');
}

// ============================================
// TEMPLATES
// ============================================
const SURVEY_TEMPLATES = [
  {
    id: 'nps',
    name: 'NPS - Net Promoter Score',
    description: 'Pesquisa clássica de recomendação com escala 0-10',
    introduction: 'Gostaríamos de saber sua opinião sobre nossos serviços. Sua resposta é muito importante para nós!',
    fields: [
      { field_type: 'nps', label: 'Em uma escala de 0 a 10, qual a probabilidade de você nos recomendar a um amigo ou colega?', required: true },
      { field_type: 'textarea', label: 'O que motivou sua nota?', required: false },
      { field_type: 'textarea', label: 'O que podemos melhorar?', required: false },
    ]
  },
  {
    id: 'satisfaction',
    name: 'Pesquisa de Satisfação',
    description: 'Avaliação geral de satisfação com estrelas e aspectos específicos',
    introduction: 'Sua opinião é fundamental para melhorarmos nossos serviços. Responda nossa pesquisa de satisfação!',
    fields: [
      { field_type: 'rating', label: 'Como você avalia nosso atendimento?', required: true },
      { field_type: 'rating', label: 'Como você avalia a qualidade do produto/serviço?', required: true },
      { field_type: 'rating', label: 'Como você avalia o custo-benefício?', required: true },
      { field_type: 'select', label: 'Qual canal você mais utiliza para falar conosco?', required: false, options: ['WhatsApp', 'Telefone', 'E-mail', 'Presencial', 'Outro'] },
      { field_type: 'textarea', label: 'Deixe seu comentário ou sugestão', required: false },
    ]
  },
  {
    id: 'post_purchase',
    name: 'Pós-Compra',
    description: 'Avaliação da experiência de compra e satisfação pós-venda',
    introduction: 'Obrigado pela sua compra! Gostaríamos de saber como foi sua experiência.',
    fields: [
      { field_type: 'rating', label: 'Como foi sua experiência de compra?', required: true },
      { field_type: 'yes_no', label: 'O produto/serviço atendeu suas expectativas?', required: true },
      { field_type: 'rating', label: 'Como você avalia o processo de entrega?', required: false },
      { field_type: 'select', label: 'Você compraria conosco novamente?', required: true, options: ['Sim, com certeza', 'Provavelmente sim', 'Talvez', 'Provavelmente não', 'Não'] },
      { field_type: 'textarea', label: 'Tem algo que gostaria de nos dizer?', required: false },
    ]
  },
  {
    id: 'csat',
    name: 'CSAT - Satisfação do Cliente',
    description: 'Medição rápida de satisfação com escala simplificada',
    introduction: 'Queremos saber como foi sua experiência! Responda rapidamente.',
    fields: [
      { field_type: 'scale', label: 'Qual seu nível de satisfação com nosso serviço?', required: true, min_value: 1, max_value: 5 },
      { field_type: 'select', label: 'Qual aspecto foi mais relevante?', required: false, options: ['Atendimento', 'Qualidade', 'Preço', 'Agilidade', 'Outro'] },
      { field_type: 'textarea', label: 'Comentários adicionais', required: false },
    ]
  }
];

router.get('/templates', authenticate, (req, res) => {
  res.json(SURVEY_TEMPLATES);
});

// ============================================
// CRUD SURVEYS
// ============================================

// List surveys
router.get('/', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const result = await query(
      `SELECT s.*, u.name as created_by_name,
        (SELECT COUNT(*) FROM survey_fields WHERE survey_id = s.id) as field_count,
        (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) as response_count
       FROM surveys s
       LEFT JOIN users u ON u.id = s.created_by
       WHERE s.organization_id = $1
       ORDER BY s.created_at DESC`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing surveys:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single survey with fields
router.get('/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const survey = await query(
      `SELECT s.*, u.name as created_by_name FROM surveys s LEFT JOIN users u ON u.id = s.created_by WHERE s.id = $1 AND s.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!survey.rows[0]) return res.status(404).json({ error: 'Survey not found' });

    const fields = await query(
      `SELECT * FROM survey_fields WHERE survey_id = $1 ORDER BY sort_order, created_at`,
      [req.params.id]
    );

    res.json({ ...survey.rows[0], fields: fields.rows });
  } catch (err) {
    console.error('Error getting survey:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create survey (optionally from template)
router.post('/', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { title, description, introduction, thumbnail_url, template_id, require_name, require_whatsapp, require_email, allow_anonymous, thank_you_message, fields, display_mode } = req.body;

    const slug = generateSlug();
    
    const result = await query(
      `INSERT INTO surveys (organization_id, title, description, introduction, thumbnail_url, template_type, share_slug, require_name, require_whatsapp, require_email, allow_anonymous, thank_you_message, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [org.organization_id, title, description || null, introduction || null, thumbnail_url || null, template_id || 'custom', slug, require_name !== false, require_whatsapp || false, require_email || false, allow_anonymous || false, thank_you_message || 'Obrigado por responder nossa pesquisa!', req.userId]
    );

    // Set display_mode (column might not exist yet on older DBs)
    try {
      await query(`UPDATE surveys SET display_mode = $1 WHERE id = $2`, [display_mode || 'typeform', result.rows[0].id]);
    } catch (e) { /* column may not exist */ }

    const surveyId = result.rows[0].id;

    // If from template, insert template fields
    let templateFields = fields || [];
    if (template_id && !fields?.length) {
      const tpl = SURVEY_TEMPLATES.find(t => t.id === template_id);
      if (tpl) templateFields = tpl.fields;
    }

    for (let i = 0; i < templateFields.length; i++) {
      const f = templateFields[i];
      await query(
        `INSERT INTO survey_fields (survey_id, field_type, label, description, required, options, min_value, max_value, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [surveyId, f.field_type, f.label, f.description || null, f.required || false, f.options ? JSON.stringify(f.options) : null, f.min_value || null, f.max_value || null, i]
      );
    }

    const fullSurvey = await query(`SELECT * FROM surveys WHERE id = $1`, [surveyId]);
    const allFields = await query(`SELECT * FROM survey_fields WHERE survey_id = $1 ORDER BY sort_order`, [surveyId]);

    res.json({ ...fullSurvey.rows[0], fields: allFields.rows });
  } catch (err) {
    console.error('Error creating survey:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update survey
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const { title, description, introduction, thumbnail_url, status, require_name, require_whatsapp, require_email, allow_anonymous, thank_you_message, display_mode } = req.body;

    const sets = [];
    const vals = [];
    let idx = 1;

    if (title !== undefined) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (introduction !== undefined) { sets.push(`introduction = $${idx++}`); vals.push(introduction); }
    if (thumbnail_url !== undefined) { sets.push(`thumbnail_url = $${idx++}`); vals.push(thumbnail_url); }
    if (status !== undefined) {
      sets.push(`status = $${idx++}`); vals.push(status);
      if (status === 'closed') { sets.push(`closed_at = NOW()`); }
    }
    if (require_name !== undefined) { sets.push(`require_name = $${idx++}`); vals.push(require_name); }
    if (require_whatsapp !== undefined) { sets.push(`require_whatsapp = $${idx++}`); vals.push(require_whatsapp); }
    if (require_email !== undefined) { sets.push(`require_email = $${idx++}`); vals.push(require_email); }
    if (allow_anonymous !== undefined) { sets.push(`allow_anonymous = $${idx++}`); vals.push(allow_anonymous); }
    if (thank_you_message !== undefined) { sets.push(`thank_you_message = $${idx++}`); vals.push(thank_you_message); }
    if (display_mode !== undefined) { sets.push(`display_mode = $${idx++}`); vals.push(display_mode); }

    sets.push(`updated_at = NOW()`);
    vals.push(req.params.id, org.organization_id);

    await query(
      `UPDATE surveys SET ${sets.join(', ')} WHERE id = $${idx++} AND organization_id = $${idx}`,
      vals
    );

    const updated = await query(`SELECT * FROM surveys WHERE id = $1`, [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error updating survey:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete survey
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    await query(`DELETE FROM surveys WHERE id = $1 AND organization_id = $2`, [req.params.id, org.organization_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting survey:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SURVEY FIELDS CRUD
// ============================================

router.post('/:id/fields', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const survey = await query(`SELECT id FROM surveys WHERE id = $1 AND organization_id = $2`, [req.params.id, org.organization_id]);
    if (!survey.rows[0]) return res.status(404).json({ error: 'Survey not found' });

    const { field_type, label, description, required, options, min_value, max_value, sort_order } = req.body;

    const result = await query(
      `INSERT INTO survey_fields (survey_id, field_type, label, description, required, options, min_value, max_value, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.params.id, field_type, label, description || null, required || false, options ? JSON.stringify(options) : null, min_value || null, max_value || null, sort_order || 0]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error adding field:', err);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/fields/:fieldId', authenticate, async (req, res) => {
  try {
    const { label, description, required, options, min_value, max_value, sort_order, field_type } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;

    if (label !== undefined) { sets.push(`label = $${idx++}`); vals.push(label); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description); }
    if (required !== undefined) { sets.push(`required = $${idx++}`); vals.push(required); }
    if (options !== undefined) { sets.push(`options = $${idx++}`); vals.push(JSON.stringify(options)); }
    if (min_value !== undefined) { sets.push(`min_value = $${idx++}`); vals.push(min_value); }
    if (max_value !== undefined) { sets.push(`max_value = $${idx++}`); vals.push(max_value); }
    if (sort_order !== undefined) { sets.push(`sort_order = $${idx++}`); vals.push(sort_order); }
    if (field_type !== undefined) { sets.push(`field_type = $${idx++}`); vals.push(field_type); }

    if (sets.length === 0) return res.json({ message: 'Nothing to update' });

    vals.push(req.params.fieldId);
    await query(`UPDATE survey_fields SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    const updated = await query(`SELECT * FROM survey_fields WHERE id = $1`, [req.params.fieldId]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Error updating field:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/fields/:fieldId', authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM survey_fields WHERE id = $1 AND survey_id = $2`, [req.params.fieldId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting field:', err);
    res.status(500).json({ error: err.message });
  }
});

// Bulk reorder fields
router.post('/:id/fields/reorder', authenticate, async (req, res) => {
  try {
    const { field_ids } = req.body; // ordered array of field IDs
    for (let i = 0; i < field_ids.length; i++) {
      await query(`UPDATE survey_fields SET sort_order = $1 WHERE id = $2 AND survey_id = $3`, [i, field_ids[i], req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering fields:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// PUBLIC ROUTES (No auth - for respondents)
// ============================================

// Get survey by slug (public)
router.get('/public/:slug', async (req, res) => {
  try {
    let surveyRow = null;
    try {
      const enhanced = await query(
        `SELECT s.id, s.title, s.description, s.introduction, s.thumbnail_url, s.status,
                COALESCE(s.display_mode, 'typeform') as display_mode,
                s.require_name, s.require_whatsapp, s.require_email, s.allow_anonymous, s.thank_you_message,
                o.logo_url as organization_logo
         FROM surveys s
         LEFT JOIN organizations o ON o.id = s.organization_id
         WHERE s.share_slug = $1`,
        [req.params.slug]
      );
      surveyRow = enhanced.rows[0];
    } catch (e) {
      // display_mode column might not exist yet — fallback
      const fallback = await query(
        `SELECT s.id, s.title, s.description, s.introduction, s.thumbnail_url, s.status, s.require_name, s.require_whatsapp, s.require_email, s.allow_anonymous, s.thank_you_message
         FROM surveys s WHERE s.share_slug = $1`,
        [req.params.slug]
      );
      surveyRow = fallback.rows[0];
    }

    if (!surveyRow) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (surveyRow.status !== 'active') return res.status(410).json({ error: 'Esta pesquisa não está mais ativa' });

    const fields = await query(
      `SELECT id, field_type, label, description, required, options, min_value, max_value, sort_order
       FROM survey_fields WHERE survey_id = $1 ORDER BY sort_order`,
      [surveyRow.id]
    );

    res.json({ ...surveyRow, fields: fields.rows });
  } catch (err) {
    console.error('Error getting public survey:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submit response (public)
router.post('/public/:slug/respond', async (req, res) => {
  try {
    const survey = await query(
      `SELECT id, status, require_name, require_whatsapp, require_email FROM surveys WHERE share_slug = $1`,
      [req.params.slug]
    );
    if (!survey.rows[0]) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (survey.rows[0].status !== 'active') return res.status(410).json({ error: 'Esta pesquisa não está mais ativa' });

    const { respondent_name, respondent_whatsapp, respondent_email, answers } = req.body;
    const s = survey.rows[0];

    // Validate required respondent info
    if (s.require_name && !respondent_name?.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    if (s.require_whatsapp) {
      if (!respondent_whatsapp?.trim()) return res.status(400).json({ error: 'WhatsApp é obrigatório' });
      // Validate BR WhatsApp number
      const cleaned = respondent_whatsapp.replace(/\D/g, '');
      if (cleaned.length < 10 || cleaned.length > 13) {
        return res.status(400).json({ error: 'Número de WhatsApp inválido' });
      }
    }
    if (s.require_email && !respondent_email?.trim()) {
      return res.status(400).json({ error: 'E-mail é obrigatório' });
    }
    if (s.require_email && respondent_email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(respondent_email)) {
        return res.status(400).json({ error: 'E-mail inválido' });
      }
    }

    // Validate required fields answered
    const fields = await query(`SELECT id, required FROM survey_fields WHERE survey_id = $1 AND required = true`, [s.id]);
    for (const f of fields.rows) {
      if (answers[f.id] === undefined || answers[f.id] === null || answers[f.id] === '') {
        return res.status(400).json({ error: 'Responda todas as perguntas obrigatórias' });
      }
    }

    const whatsClean = respondent_whatsapp ? respondent_whatsapp.replace(/\D/g, '') : null;

    const result = await query(
      `INSERT INTO survey_responses (survey_id, respondent_name, respondent_whatsapp, respondent_email, answers, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [s.id, respondent_name || null, whatsClean, respondent_email || null, JSON.stringify(answers), JSON.stringify({ user_agent: req.headers['user-agent'], ip: req.ip })]
    );

    res.json({ success: true, response_id: result.rows[0].id });
  } catch (err) {
    console.error('Error submitting response:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// RESULTS / ANALYTICS
// ============================================

// Get responses for a survey
router.get('/:id/responses', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const survey = await query(`SELECT id FROM surveys WHERE id = $1 AND organization_id = $2`, [req.params.id, org.organization_id]);
    if (!survey.rows[0]) return res.status(404).json({ error: 'Survey not found' });

    const responses = await query(
      `SELECT * FROM survey_responses WHERE survey_id = $1 ORDER BY submitted_at DESC`,
      [req.params.id]
    );

    const fields = await query(
      `SELECT * FROM survey_fields WHERE survey_id = $1 ORDER BY sort_order`,
      [req.params.id]
    );

    // Calculate stats
    const stats = { total_responses: responses.rows.length, field_stats: {} };

    for (const field of fields.rows) {
      const fieldAnswers = responses.rows.map(r => {
        const ans = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers;
        return ans[field.id];
      }).filter(a => a !== undefined && a !== null && a !== '');

      if (field.field_type === 'nps') {
        const scores = fieldAnswers.map(Number).filter(n => !isNaN(n));
        const promoters = scores.filter(s => s >= 9).length;
        const detractors = scores.filter(s => s <= 6).length;
        const total = scores.length || 1;
        stats.field_stats[field.id] = {
          type: 'nps',
          nps_score: Math.round(((promoters - detractors) / total) * 100),
          promoters, passives: scores.filter(s => s >= 7 && s <= 8).length, detractors,
          total: scores.length,
          average: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
        };
      } else if (field.field_type === 'rating' || field.field_type === 'scale') {
        const scores = fieldAnswers.map(Number).filter(n => !isNaN(n));
        const distribution = {};
        scores.forEach(s => { distribution[s] = (distribution[s] || 0) + 1; });
        stats.field_stats[field.id] = {
          type: field.field_type,
          average: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0,
          total: scores.length,
          distribution,
        };
      } else if (field.field_type === 'select' || field.field_type === 'yes_no') {
        const distribution = {};
        fieldAnswers.forEach(a => { distribution[a] = (distribution[a] || 0) + 1; });
        stats.field_stats[field.id] = { type: 'choice', total: fieldAnswers.length, distribution };
      } else if (field.field_type === 'multi_select') {
        const distribution = {};
        fieldAnswers.forEach(a => {
          const items = Array.isArray(a) ? a : [a];
          items.forEach(item => { distribution[item] = (distribution[item] || 0) + 1; });
        });
        stats.field_stats[field.id] = { type: 'multi_choice', total: fieldAnswers.length, distribution };
      } else {
        stats.field_stats[field.id] = { type: 'text', total: fieldAnswers.length, sample: fieldAnswers.slice(0, 5) };
      }
    }

    res.json({ responses: responses.rows, fields: fields.rows, stats });
  } catch (err) {
    console.error('Error getting responses:', err);
    res.status(500).json({ error: err.message });
  }
});

// Global stats across all surveys
router.get('/stats/overview', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'No organization' });

    const surveys = await query(
      `SELECT s.id, s.title, s.status, s.template_type, s.created_at,
        (SELECT COUNT(*) FROM survey_responses WHERE survey_id = s.id) as response_count
       FROM surveys s WHERE s.organization_id = $1 ORDER BY s.created_at DESC`,
      [org.organization_id]
    );

    const totalResponses = await query(
      `SELECT COUNT(*) as total FROM survey_responses sr JOIN surveys s ON s.id = sr.survey_id WHERE s.organization_id = $1`,
      [org.organization_id]
    );

    res.json({
      total_surveys: surveys.rows.length,
      active_surveys: surveys.rows.filter(s => s.status === 'active').length,
      total_responses: parseInt(totalResponses.rows[0]?.total || '0'),
      surveys: surveys.rows,
    });
  } catch (err) {
    console.error('Error getting overview:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
