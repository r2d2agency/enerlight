import { Router } from 'express';
import { query } from '../db.js';
import { authenticate as requireAuth } from '../middleware/auth.js';
import { callAI } from '../lib/ai-caller.js';
import { logInfo, logError } from '../logger.js';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const router = Router();

async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

function getAIConfig(config, orgConfig) {
  if (config.use_org_ai_config && orgConfig) {
    return {
      provider: orgConfig.ai_provider || 'openai',
      model: orgConfig.ai_model || 'gpt-4o-mini',
      apiKey: orgConfig.ai_api_key,
    };
  }
  return {
    provider: config.ai_provider || 'openai',
    model: config.ai_model || 'gpt-4o-mini',
    apiKey: config.ai_api_key,
  };
}

// ===================== AI CONFIG =====================

router.get('/config', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    let result = await query(
      `SELECT c.*, o.ai_provider as org_ai_provider, o.ai_model as org_ai_model,
              CASE WHEN o.ai_api_key IS NOT NULL AND o.ai_api_key != '' THEN true ELSE false END as org_has_ai_key
       FROM licitacao_ai_config c
       RIGHT JOIN organizations o ON o.id = c.organization_id
       WHERE o.id = $1`,
      [org.organization_id]
    );

    if (result.rows.length === 0) return res.json({ is_enabled: false, use_org_ai_config: true });

    const row = result.rows[0];
    res.json({
      ...row,
      ai_api_key: row.ai_api_key ? '••••••••' : null,
    });
  } catch (e) {
    console.error('Get licitacao AI config error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/config', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    if (org.role !== 'owner' && org.role !== 'admin') return res.status(403).json({ error: 'Sem permissão' });

    const { is_enabled, use_org_ai_config, ai_provider, ai_model, ai_api_key, analysis_prompt, compliance_prompt, max_tokens, temperature } = req.body;

    const existing = await query('SELECT id, ai_api_key FROM licitacao_ai_config WHERE organization_id = $1', [org.organization_id]);

    // Don't overwrite key if masked
    const finalApiKey = ai_api_key === '••••••••' ? (existing.rows[0]?.ai_api_key || null) : (ai_api_key || null);

    if (existing.rows.length > 0) {
      await query(
        `UPDATE licitacao_ai_config SET is_enabled=$1, use_org_ai_config=$2, ai_provider=$3, ai_model=$4, ai_api_key=$5,
         analysis_prompt=$6, compliance_prompt=$7, max_tokens=$8, temperature=$9, updated_at=NOW()
         WHERE organization_id=$10`,
        [is_enabled, use_org_ai_config, ai_provider, ai_model, finalApiKey, analysis_prompt, compliance_prompt, max_tokens || 4000, temperature || 0.3, org.organization_id]
      );
    } else {
      await query(
        `INSERT INTO licitacao_ai_config (organization_id, is_enabled, use_org_ai_config, ai_provider, ai_model, ai_api_key, analysis_prompt, compliance_prompt, max_tokens, temperature)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [org.organization_id, is_enabled, use_org_ai_config, ai_provider, ai_model, finalApiKey, analysis_prompt, compliance_prompt, max_tokens || 4000, temperature || 0.3]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Save licitacao AI config error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== PRODUCTS =====================

router.get('/products', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const result = await query(
      `SELECT p.*, u.name as created_by_name FROM licitacao_ai_products p
       LEFT JOIN users u ON u.id = p.created_by
       WHERE p.organization_id = $1 AND p.is_active = true
       ORDER BY p.category, p.name`,
      [org.organization_id]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/products', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { code, name, description, category, specifications, unit, unit_price, brand } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });

    const result = await query(
      `INSERT INTO licitacao_ai_products (organization_id, code, name, description, category, specifications, unit, unit_price, brand, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [org.organization_id, code || null, name, description || null, category || null, specifications || null, unit || null, unit_price || null, brand || null, req.userId]
    );

    // Create chunk for RAG
    const product = result.rows[0];
    const chunkContent = buildProductChunk(product);
    await query(
      `INSERT INTO licitacao_ai_product_chunks (product_id, organization_id, content) VALUES ($1,$2,$3)`,
      [product.id, org.organization_id, chunkContent]
    );

    res.json(product);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/products/:id', requireAuth, async (req, res) => {
  try {
    const fields = ['code', 'name', 'description', 'category', 'specifications', 'unit', 'unit_price', 'brand', 'is_active'];
    const sets = []; const vals = []; let i = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) { sets.push(`${f}=$${i++}`); vals.push(req.body[f]); }
    }
    if (sets.length === 0) return res.json({ ok: true });
    sets.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    await query(`UPDATE licitacao_ai_products SET ${sets.join(',')} WHERE id=$${i}`, vals);

    // Update chunk
    const product = await query('SELECT * FROM licitacao_ai_products WHERE id=$1', [req.params.id]);
    if (product.rows[0]) {
      const chunkContent = buildProductChunk(product.rows[0]);
      await query('DELETE FROM licitacao_ai_product_chunks WHERE product_id=$1', [req.params.id]);
      await query(
        'INSERT INTO licitacao_ai_product_chunks (product_id, organization_id, content) VALUES ($1,$2,$3)',
        [req.params.id, product.rows[0].organization_id, chunkContent]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/products/:id', requireAuth, async (req, res) => {
  try {
    await query('UPDATE licitacao_ai_products SET is_active=false WHERE id=$1', [req.params.id]);
    await query('DELETE FROM licitacao_ai_product_chunks WHERE product_id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/products/import', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) return res.status(400).json({ error: 'Lista de produtos vazia' });

    let count = 0;
    for (const p of products) {
      if (!p.name) continue;
      const result = await query(
        `INSERT INTO licitacao_ai_products (organization_id, code, name, description, category, specifications, unit, unit_price, brand, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [org.organization_id, p.code || null, p.name, p.description || null, p.category || null, p.specifications || null, p.unit || null, p.unit_price || null, p.brand || null, req.userId]
      );
      const product = result.rows[0];
      await query(
        'INSERT INTO licitacao_ai_product_chunks (product_id, organization_id, content) VALUES ($1,$2,$3)',
        [product.id, org.organization_id, buildProductChunk(product)]
      );
      count++;
    }

    res.json({ imported: count });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===================== AI ANALYSIS =====================

router.get('/analyses/:licitacaoId', requireAuth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM licitacao_ai_analyses WHERE licitacao_id=$1 ORDER BY created_at DESC LIMIT 1',
      [req.params.licitacaoId]
    );
    res.json(result.rows[0] || null);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/analyze/:licitacaoId', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    // Get AI config
    const configRes = await query(
      `SELECT c.*, o.ai_provider as org_ai_provider, o.ai_model as org_ai_model, o.ai_api_key as org_ai_api_key
       FROM licitacao_ai_config c
       RIGHT JOIN organizations o ON o.id = $1
       LEFT JOIN licitacao_ai_config lc ON lc.organization_id = o.id
       WHERE o.id = $1`,
      [org.organization_id]
    );

    const configRow = configRes.rows[0];
    let aiConfig;

    // Check for org-level AI or dedicated config
    if (configRow?.use_org_ai_config !== false && configRow?.org_ai_api_key) {
      aiConfig = { provider: configRow.org_ai_provider || 'openai', model: configRow.org_ai_model || 'gpt-4o-mini', apiKey: configRow.org_ai_api_key };
    } else if (configRow?.ai_api_key) {
      aiConfig = { provider: configRow.ai_provider || 'openai', model: configRow.ai_model || 'gpt-4o-mini', apiKey: configRow.ai_api_key };
    } else {
      return res.status(400).json({ error: 'IA não configurada. Configure a chave de API nas configurações do módulo ou nas configurações gerais da organização.' });
    }

    // Get licitação
    const licRes = await query('SELECT * FROM licitacoes WHERE id=$1', [req.params.licitacaoId]);
    const lic = licRes.rows[0];
    if (!lic) return res.status(404).json({ error: 'Licitação não encontrada' });

    // Get edital text from documents or description
    let editalText = req.body.edital_text || '';

    // If edital URL exists, try to fetch text from uploaded documents
    if (!editalText && lic.edital_url) {
      try {
        const response = await fetch(lic.edital_url);
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text') || contentType.includes('html')) {
            editalText = await response.text();
          }
        }
      } catch (fetchErr) {
        logError('licitacao_ai.fetch_edital', fetchErr);
      }
    }

    // Also include description and notes
    if (!editalText) {
      editalText = [lic.title, lic.description, lic.notes, lic.entity_name].filter(Boolean).join('\n');
    }

    if (!editalText || editalText.trim().length < 50) {
      return res.status(400).json({ error: 'Texto do edital muito curto ou não encontrado. Cole o texto do edital ou envie o arquivo.' });
    }

    // Create analysis record
    const analysisRes = await query(
      `INSERT INTO licitacao_ai_analyses (licitacao_id, organization_id, status, edital_text, analyzed_by) VALUES ($1,$2,'processing',$3,$4) RETURNING *`,
      [req.params.licitacaoId, org.organization_id, editalText.substring(0, 500000), req.userId]
    );
    const analysisId = analysisRes.rows[0].id;

    // Get products for RAG context
    const productsRes = await query(
      `SELECT content FROM licitacao_ai_product_chunks WHERE organization_id=$1 LIMIT 100`,
      [org.organization_id]
    );
    const productsContext = productsRes.rows.map(r => r.content).join('\n---\n');

    // Custom prompts
    const analysisPrompt = configRow?.analysis_prompt || 'Você é um especialista em licitações públicas brasileiras.';
    const compliancePrompt = configRow?.compliance_prompt || '';

    // Build AI messages
    const systemPrompt = `${analysisPrompt}

Você deve analisar editais de licitação e retornar um JSON estruturado com os seguintes campos:
- summary: resumo executivo do edital (máx 500 palavras)
- dates: array de objetos { label, date, description } com todas as datas importantes (abertura, prazo, resultado, etc)
- required_documents: array de strings com todos os documentos obrigatórios mencionados no edital
- edital_items: array de objetos { item_number, description, quantity, unit, estimated_value } com os itens licitados
- compliance_score: nota de 0 a 100 indicando conformidade da empresa com o edital
- compliance_analysis: análise detalhada de conformidade
- risk_assessment: avaliação de riscos e pontos de atenção
- recommendations: recomendações para participação

${productsContext ? `
PRODUTOS E SERVIÇOS DA EMPRESA:
${productsContext}

${compliancePrompt || 'Compare cada item do edital com os produtos da empresa. Identifique quais itens atendemos, parcialmente atendemos, ou não atendemos.'}

Adicione o campo:
- product_matches: array de objetos { edital_item, product_name, match_level ("total", "parcial", "não atende"), notes }
` : ''}

IMPORTANTE: Retorne APENAS o JSON, sem markdown, sem \`\`\`json, sem texto extra.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analise o seguinte edital de licitação:\n\n${editalText.substring(0, 100000)}` },
    ];

    // Call AI
    const result = await callAI(aiConfig, messages, {
      temperature: parseFloat(configRow?.temperature) || 0.3,
      maxTokens: parseInt(configRow?.max_tokens) || 4000,
      responseFormat: { type: 'json_object' },
    });

    // Parse result
    let analysis;
    try {
      analysis = JSON.parse(result.content);
    } catch (parseErr) {
      // Try to extract JSON from response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Resposta da IA não é um JSON válido');
      }
    }

    // Update analysis record
    await query(
      `UPDATE licitacao_ai_analyses SET 
        status='completed',
        summary=$2,
        dates_extracted=$3,
        required_documents=$4,
        edital_items=$5,
        product_matches=$6,
        compliance_analysis=$7,
        compliance_score=$8,
        risk_assessment=$9,
        recommendations=$10,
        tokens_used=$11,
        model_used=$12,
        updated_at=NOW()
       WHERE id=$1`,
      [
        analysisId,
        analysis.summary || '',
        JSON.stringify(analysis.dates || []),
        JSON.stringify(analysis.required_documents || []),
        JSON.stringify(analysis.edital_items || []),
        JSON.stringify(analysis.product_matches || []),
        analysis.compliance_analysis || '',
        analysis.compliance_score || 0,
        analysis.risk_assessment || '',
        analysis.recommendations || '',
        result.tokensUsed || 0,
        result.model || '',
      ]
    );

    // Auto-generate checklist items from required documents
    if (analysis.required_documents && analysis.required_documents.length > 0) {
      for (const doc of analysis.required_documents) {
        const docTitle = typeof doc === 'string' ? doc : doc.name || doc.title || String(doc);
        if (!docTitle) continue;
        // Check if already exists
        const existing = await query(
          'SELECT 1 FROM licitacao_checklist WHERE licitacao_id=$1 AND title=$2 LIMIT 1',
          [req.params.licitacaoId, docTitle]
        );
        if (existing.rows.length === 0) {
          const maxOrder = await query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM licitacao_checklist WHERE licitacao_id=$1', [req.params.licitacaoId]);
          await query(
            'INSERT INTO licitacao_checklist (licitacao_id, title, sort_order) VALUES ($1,$2,$3)',
            [req.params.licitacaoId, docTitle, maxOrder.rows[0].next]
          );
        }
      }
    }

    // Add history
    const u = await query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await query(
      'INSERT INTO licitacao_history (licitacao_id, user_id, user_name, action, details) VALUES ($1,$2,$3,$4,$5)',
      [req.params.licitacaoId, req.userId, u.rows[0]?.name || 'Sistema', 'ai_analysis', 'Análise de edital por IA realizada']
    );

    // Return full analysis
    const finalRes = await query('SELECT * FROM licitacao_ai_analyses WHERE id=$1', [analysisId]);
    res.json(finalRes.rows[0]);

  } catch (e) {
    logError('licitacao_ai.analyze_error', e);
    // Update analysis with error
    try {
      await query(
        `UPDATE licitacao_ai_analyses SET status='failed', error_message=$2, updated_at=NOW() WHERE licitacao_id=$1 AND status='processing'`,
        [req.params.licitacaoId, e.message?.substring(0, 500)]
      );
    } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

// ===================== PARSE EDITAL PDF =====================

router.post('/parse-edital', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { edital_url, edital_text } = req.body;
    let textContent = edital_text || '';

    // If URL provided, try to fetch content
    if (edital_url && !textContent) {
      try {
        const response = await fetch(edital_url);
        if (!response.ok) throw new Error('Falha ao baixar arquivo');
        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/pdf') || edital_url.endsWith('.pdf')) {
          const buffer = await response.arrayBuffer();
          const pdfData = await pdf(Buffer.from(buffer));
          textContent = pdfData.text;
          textContent = pdfData.text;
        } else if (contentType.includes('text') || contentType.includes('html')) {
          textContent = await response.text();
        } else {
          // Try as text anyway
          textContent = await response.text();
        }
      } catch (fetchErr) {
        logError('licitacao_ai.parse_fetch', fetchErr);
        return res.status(400).json({ error: `Não foi possível ler o arquivo: ${fetchErr.message}` });
      }
    }

    if (!textContent || textContent.trim().length < 30) {
      return res.status(400).json({ error: 'Não foi possível extrair texto do edital. Tente enviar o texto manualmente.' });
    }

    // Get AI config
    const configRes = await query(
      `SELECT c.*, o.ai_provider as org_ai_provider, o.ai_model as org_ai_model, o.ai_api_key as org_ai_api_key
       FROM organizations o
       LEFT JOIN licitacao_ai_config c ON c.organization_id = o.id
       WHERE o.id = $1`,
      [org.organization_id]
    );
    const configRow = configRes.rows[0];
    let aiConfig;

    if (configRow?.use_org_ai_config !== false && configRow?.org_ai_api_key) {
      aiConfig = { provider: configRow.org_ai_provider || 'openai', model: configRow.org_ai_model || 'gpt-4o-mini', apiKey: configRow.org_ai_api_key };
    } else if (configRow?.ai_api_key) {
      aiConfig = { provider: configRow.ai_provider || 'openai', model: configRow.ai_model || 'gpt-4o-mini', apiKey: configRow.ai_api_key };
    } else {
      return res.status(400).json({ error: 'IA não configurada. Configure a chave de API nas configurações do módulo ou nas configurações gerais da organização.' });
    }

    // Get products for compliance matching
    const productsRes = await query(
      `SELECT content FROM licitacao_ai_product_chunks WHERE organization_id=$1 LIMIT 100`,
      [org.organization_id]
    );
    const productsContext = productsRes.rows.map(r => r.content).join('\n---\n');

    const systemPrompt = `Você é um especialista em licitações públicas brasileiras. Analise o texto do edital e extraia as informações estruturadas em JSON.

Retorne EXATAMENTE este formato JSON:
{
  "title": "título descritivo da licitação (ex: Pregão Eletrônico nº 001/2025 - Aquisição de...)",
  "edital_number": "número do edital (ex: 001/2025)",
  "modality": "modalidade (deve ser uma destas: Pregão Eletrônico, Pregão Presencial, Concorrência, Tomada de Preços, Convite, Leilão, Concurso, Dispensa, Inexigibilidade, RDC, Outro)",
  "opening_date": "data de abertura no formato YYYY-MM-DD ou null",
  "deadline_date": "data limite/prazo no formato YYYY-MM-DD ou null",
  "result_date": "data do resultado no formato YYYY-MM-DD ou null",
  "estimated_value": número do valor estimado ou 0,
  "entity_name": "nome do órgão/entidade/prefeitura",
  "entity_cnpj": "CNPJ do órgão se disponível ou null",
  "entity_contact": "nome do contato/pregoeiro se disponível ou null",
  "entity_phone": "telefone do órgão se disponível ou null",
  "entity_email": "email do órgão se disponível ou null",
  "description": "descrição/objeto da licitação",
  "notes": "informações importantes extraídas (local de entrega, condições, etc)",
  "checklist_items": ["documento obrigatório 1", "documento obrigatório 2", ...],
  "tasks": [
    { "title": "tarefa sugerida", "description": "detalhes", "priority": "high/medium/low", "due_date": "YYYY-MM-DD ou null" }
  ],
  "summary": "resumo executivo do edital",
  "edital_items": [
    { "item_number": "1", "description": "descrição do item", "quantity": "10", "unit": "UN", "estimated_value": "1000.00" }
  ]${productsContext ? `,
  "product_matches": [
    { "edital_item": "item do edital", "product_name": "produto da empresa", "match_level": "total/parcial/não atende", "notes": "observações" }
  ],
  "compliance_score": 0-100,
  "compliance_analysis": "análise de conformidade detalhada"` : ''}
}

${productsContext ? `\nPRODUTOS E SERVIÇOS DA EMPRESA:\n${productsContext}` : ''}

IMPORTANTE: Retorne APENAS o JSON, sem markdown, sem \`\`\`json, sem texto extra.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analise o seguinte edital:\n\n${textContent.substring(0, 100000)}` },
    ];

    const result = await callAI(aiConfig, messages, {
      temperature: 0.2,
      maxTokens: parseInt(configRow?.max_tokens) || 8000,
      responseFormat: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = extractJsonFromResponse(result.content);
    } catch (parseErr) {
      logError('licitacao_ai.parse_json_error', { error: parseErr.message, contentPreview: result.content?.substring(0, 500) });
      throw new Error('Resposta da IA não é JSON válido. Tente novamente ou reduza o tamanho do edital.');
    }

    res.json(parsed);
  } catch (e) {
    logError('licitacao_ai.parse_edital_error', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== HELPERS =====================

function extractJsonFromResponse(response) {
  if (!response || typeof response !== 'string') throw new Error('Empty AI response');
  
  // Remove markdown code blocks
  let cleaned = response
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find JSON boundaries
  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error('No JSON found in response');
  
  const startChar = cleaned[jsonStart];
  const endChar = startChar === '[' ? ']' : '}';
  const jsonEnd = cleaned.lastIndexOf(endChar);
  if (jsonEnd === -1) throw new Error('No closing JSON bracket found');

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Fix common issues
    cleaned = cleaned
      .replace(/,\s*}/g, '}')
      .replace(/,\s*]/g, ']')
      .replace(/[\x00-\x1F\x7F]/g, ' ')  // control characters
      .replace(/\n/g, '\\n')  // unescaped newlines in strings
      .replace(/\r/g, '\\r');

    try {
      return JSON.parse(cleaned);
    } catch (_) {
      // Try to repair truncated JSON by closing open braces/brackets
      let repaired = cleaned;
      const openBraces = (repaired.match(/{/g) || []).length;
      const closeBraces = (repaired.match(/}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length;
      const closeBrackets = (repaired.match(/]/g) || []).length;

      // Remove trailing comma if present
      repaired = repaired.replace(/,\s*$/, '');

      // Close unclosed brackets/braces
      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

      try {
        return JSON.parse(repaired);
      } catch (finalErr) {
        throw new Error(`Failed to parse AI response as JSON: ${finalErr.message}`);
      }
    }
  }
}

function buildProductChunk(product) {
  const parts = [];
  if (product.code) parts.push(`Código: ${product.code}`);
  parts.push(`Produto: ${product.name}`);
  if (product.description) parts.push(`Descrição: ${product.description}`);
  if (product.category) parts.push(`Categoria: ${product.category}`);
  if (product.specifications) parts.push(`Especificações: ${product.specifications}`);
  if (product.unit) parts.push(`Unidade: ${product.unit}`);
  if (product.unit_price) parts.push(`Preço unitário: R$ ${Number(product.unit_price).toFixed(2)}`);
  if (product.brand) parts.push(`Marca: ${product.brand}`);
  return parts.join('\n');
}

export default router;
