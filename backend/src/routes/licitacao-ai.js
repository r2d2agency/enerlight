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

    // Get edital text from manual input or uploaded file
    let editalText = '';
    const editalUrl = req.body.edital_url || lic.edital_url;

    try {
      editalText = await resolveEditalText({ editalText: req.body.edital_text, editalUrl });
    } catch (fetchErr) {
      logError('licitacao_ai.fetch_edital', fetchErr);
      return res.status(400).json({ error: `Não foi possível ler o edital enviado: ${fetchErr.message}` });
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

REGRAS DE CONFORMIDADE:
- Você DEVE preencher product_matches, compliance_score e compliance_analysis usando o catálogo acima.
- product_matches deve listar os produtos relacionados por item do edital quando houver atendimento total, parcial ou ausência de atendimento.
- Não retorne compliance_score zerado se houver itens atendidos parcialmente ou totalmente.
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
      analysis = normalizeParsedEditalData(extractJsonFromResponse(result.content));
    } catch (parseErr) {
      logError('licitacao_ai.analyze_json_error', { error: parseErr.message, contentPreview: result.content?.substring(0, 500) });
      throw new Error('Resposta da IA não é um JSON válido. Tente novamente.');
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
        JSON.stringify(analysis.dates_extracted || analysis.dates || []),
        JSON.stringify(analysis.required_documents || []),
        JSON.stringify(analysis.edital_items || []),
        JSON.stringify(analysis.product_matches || []),
        analysis.compliance_analysis || '',
        analysis.compliance_score ?? null,
        analysis.risk_assessment || '',
        analysis.recommendations || '',
        result.tokensUsed || 0,
        result.model || '',
      ]
    );

    await syncChecklistItems(req.params.licitacaoId, analysis.required_documents);

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
    let textContent = '';

    try {
      textContent = await resolveEditalText({ editalText: edital_text, editalUrl: edital_url });
    } catch (fetchErr) {
      logError('licitacao_ai.parse_fetch', fetchErr);
      return res.status(400).json({ error: `Não foi possível ler o arquivo: ${fetchErr.message}` });
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

    const responseTemplate = {
      title: 'Pregão Eletrônico nº 001/2025 - Aquisição de materiais',
      edital_number: '001/2025',
      modality: 'Pregão Eletrônico',
      opening_date: '2025-01-15',
      deadline_date: '2025-01-14',
      result_date: null,
      estimated_value: 0,
      entity_name: 'Prefeitura Municipal de Exemplo',
      entity_cnpj: '00.000.000/0000-00',
      entity_contact: 'Nome do responsável',
      entity_phone: '(00) 0000-0000',
      entity_email: 'email@orgao.gov.br',
      description: 'Objeto completo e detalhado da licitação',
      notes: 'Informações adicionais relevantes extraídas do edital',
      dates: [
        { label: 'Publicação do Edital', date: '2025-01-01', description: 'Data da publicação oficial' },
        { label: 'Sessão Pública', date: '2025-01-15', description: 'Data e hora de abertura das propostas' },
        { label: 'Prazo para Impugnação', date: '2025-01-10', description: 'Último dia para impugnar o edital' },
        { label: 'Prazo para Esclarecimentos', date: '2025-01-08', description: 'Último dia para pedidos de esclarecimento' },
      ],
      required_documents: [
        'Certidão Negativa de Débitos Federais',
        'Certidão de Regularidade FGTS',
        'Certidão Negativa de Débitos Trabalhistas (CNDT)',
        'Balanço Patrimonial do último exercício social',
        'Contrato Social ou Estatuto atualizado',
      ],
      checklist_items: [
        'Verificar habilitação jurídica (contrato social, procuração)',
        'Obter Certidão Negativa de Débitos Federais (RFB/PGFN)',
        'Obter Certidão de Regularidade FGTS (CRF)',
        'Obter Certidão Negativa de Débitos Trabalhistas (CNDT/TST)',
        'Obter Certidão Negativa de Débitos Estaduais',
        'Obter Certidão Negativa de Débitos Municipais',
        'Verificar regularidade no SICAF',
        'Preparar Balanço Patrimonial e demonstrações contábeis',
        'Verificar Índices de Liquidez exigidos',
        'Preparar atestados de capacidade técnica',
        'Elaborar proposta comercial conforme modelo do edital',
        'Verificar exigências de amostras/demonstrações',
        'Preparar declarações obrigatórias (ME/EPP, menor aprendiz, etc.)',
        'Verificar necessidade de visita técnica',
        'Cadastrar no sistema de licitação eletrônica',
        'Preparar garantia de proposta (se exigida)',
        'Revisar planilha de formação de preços',
        'Verificar prazos de entrega/execução exigidos',
      ],
      tasks: [
        { title: 'Reunir documentação de habilitação jurídica', description: 'Contrato social, alterações, procurações e declarações legais exigidas no edital', priority: 'high', due_date: '2025-01-10' },
        { title: 'Obter certidões de regularidade fiscal', description: 'Federal, Estadual, Municipal, FGTS e Trabalhista - verificar validade de todas as certidões', priority: 'high', due_date: '2025-01-12' },
        { title: 'Elaborar proposta comercial', description: 'Preparar proposta conforme modelo do edital com planilha de preços detalhada', priority: 'high', due_date: '2025-01-13' },
        { title: 'Preparar documentação técnica', description: 'Atestados de capacidade técnica, certificações e declarações técnicas exigidas', priority: 'high', due_date: '2025-01-12' },
        { title: 'Revisar qualificação econômico-financeira', description: 'Balanço patrimonial, índices de liquidez e capital social mínimo exigido', priority: 'medium', due_date: '2025-01-10' },
        { title: 'Verificar necessidade de impugnação do edital', description: 'Analisar cláusulas restritivas e avaliar necessidade de pedido de esclarecimento ou impugnação', priority: 'medium', due_date: '2025-01-08' },
        { title: 'Cadastrar credenciais no sistema eletrônico', description: 'Garantir acesso e credenciamento no portal de licitações', priority: 'medium', due_date: '2025-01-13' },
      ],
      summary: `## Resumo Executivo\nDescrição detalhada do objeto da licitação.\n\n## Órgão Licitante\nNome, endereço e informações do órgão.\n\n## Regras e Condições\n- Condição 1\n- Condição 2\n\n## Pontos de Atenção\n- ⚠️ Ponto crítico 1\n- ⚠️ Ponto crítico 2\n\n## Requisitos de Habilitação\n- Habilitação Jurídica: ...\n- Regularidade Fiscal: ...\n- Qualificação Técnica: ...\n- Qualificação Econômico-Financeira: ...\n\n## Critério de Julgamento\nMenor preço / Técnica e preço / etc.\n\n## Prazos e Vigência\n- Vigência do contrato: ...\n- Prazo de entrega: ...\n\n## Penalidades\n- Multas e sanções previstas`,
      edital_items: [
        { item_number: '1', description: 'Descrição completa do item', quantity: '10', unit: 'UN', estimated_value: '1000.00' },
      ],
      risk_assessment: '## Riscos Identificados\n- 🔴 **Alto**: ...\n- 🟡 **Médio**: ...\n- 🟢 **Baixo**: ...\n\n## Cláusulas Restritivas\n- ...\n\n## Pontos que Exigem Atenção Imediata\n- ...',
      recommendations: '## Próximos Passos\n1. ...\n2. ...\n\n## Estratégia Sugerida\n- ...\n\n## Documentos Prioritários\n- ...',
    };

    if (productsContext) {
      responseTemplate.product_matches = [
        { edital_item: 'Item 1', product_name: 'Produto Exemplo', match_level: 'parcial', notes: 'Detalhes da compatibilidade' },
      ];
      responseTemplate.compliance_score = 65;
      responseTemplate.compliance_analysis = '## Análise de Conformidade\n- Itens compatíveis: ...\n- Itens parcialmente compatíveis: ...\n- Itens sem correspondência: ...\n\n## Recomendações de Adequação\n- ...';
    }

    const systemPrompt = `Você é um ESPECIALISTA SÊNIOR em licitações públicas brasileiras com 20 anos de experiência. Faça uma ANÁLISE MINUCIOSA e COMPLETA do edital. Não deixe NENHUMA informação relevante de fora.

MODELO JSON VÁLIDO:
${JSON.stringify(responseTemplate, null, 2)}

${productsContext ? `PRODUTOS E SERVIÇOS DA EMPRESA (CATÁLOGO RAG):\n${productsContext}\n\nIMPORTANTE: Compare TODOS os itens do edital com o catálogo acima e preencha product_matches, compliance_score e compliance_analysis obrigatoriamente.\n` : ''}

INSTRUÇÕES DETALHADAS:

### SUMMARY (campo summary) - OBRIGATÓRIO E DETALHADO
Gere um resumo COMPLETO e ESTRUTURADO usando Markdown com as seguintes seções:
- **## Resumo Executivo**: Objeto completo, valor estimado, modalidade, finalidade
- **## Órgão Licitante**: Nome completo, endereço, CNPJ, setor responsável
- **## Regras e Condições**: Todas as regras de participação, vedações, condições especiais
- **## Pontos de Atenção**: Cláusulas críticas, exigências especiais, armadilhas comuns (usar ⚠️)
- **## Requisitos de Habilitação**: Habilitação Jurídica, Regularidade Fiscal, Qualificação Técnica, Qualificação Econômico-Financeira - DETALHAR CADA UM
- **## Critério de Julgamento**: Tipo de julgamento e critérios de desempate
- **## Prazos e Vigência**: Vigência contratual, prazos de entrega, garantias
- **## Penalidades**: Multas, sanções, advertências previstas
- **## Condições de Pagamento**: Forma e prazo de pagamento, reajustes

### CHECKLIST_ITEMS - Gere uma lista COMPLETA e ABRANGENTE
Inclua TODOS os itens necessários para participar, como:
- Cada certidão e documento de habilitação exigido
- Cada declaração obrigatória
- Verificações de sistema (SICAF, portal)
- Preparação de proposta e planilha
- Amostras, visita técnica, garantias
- Qualquer requisito específico do edital
Mínimo: 12 itens. Máximo: 30 itens.

### TASKS - Gere tarefas ACTIONÁVEIS com prazos
Cada tarefa deve ter:
- Título claro e objetivo
- Descrição detalhada do que precisa ser feito
- Prioridade (high/medium/low) baseada na urgência
- due_date calculada a partir das datas do edital (antes da abertura)
Mínimo: 5 tarefas. Máximo: 15 tarefas. Ordene por prioridade.

### RISK_ASSESSMENT - Análise detalhada com Markdown
Use ícones e seções: Riscos Altos 🔴, Médios 🟡, Baixos 🟢, Cláusulas Restritivas, Pontos de Atenção Imediata.

### RECOMMENDATIONS - Recomendações estratégicas com Markdown
Próximos passos numerados, estratégia sugerida, documentos prioritários.

REGRAS OBRIGATÓRIAS:
- Retorne APENAS um objeto JSON válido, sem markdown wrapping.
- Use aspas duplas. Use null quando não disponível.
- estimated_value: número. Em edital_items: string numérica. Nunca use R$ ou pontos de milhar.
- Datas em YYYY-MM-DD ou null.
- priority: high, medium ou low.
- match_level: total, parcial ou não atende.
- Arrays vazios quando sem dados.
- Extraia o MÁXIMO de informações possível do edital.
- Preencha TODOS os campos de entidade (entity_*) que encontrar.
- Gere resumo, risk_assessment e recommendations usando Markdown para formatação rica.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Analise o seguinte edital:\n\n${textContent.substring(0, 100000)}` },
    ];

    const result = await callAI(aiConfig, messages, {
      temperature: 0.2,
      maxTokens: Math.max(parseInt(configRow?.max_tokens) || 12000, 12000),
      responseFormat: { type: 'json_object' },
    });

    let parsed;
    try {
      parsed = normalizeParsedEditalData(extractJsonFromResponse(result.content));
    } catch (parseErr) {
      logError('licitacao_ai.parse_json_error', {
        error: parseErr.message,
        contentPreview: result.content?.substring(0, 500),
      });
      throw new Error('Resposta da IA não é JSON válido. Tente novamente ou reduza o tamanho do edital.');
    }

    res.json(parsed);
  } catch (e) {
    logError('licitacao_ai.parse_edital_error', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== SAVE PRE-PARSED ANALYSIS =====================

router.post('/save-analysis/:licitacaoId', requireAuth, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });

    const { licitacaoId } = req.params;
    const data = normalizeParsedEditalData(req.body);

    // Delete any existing analysis for this licitacao
    await query('DELETE FROM licitacao_ai_analyses WHERE licitacao_id=$1', [licitacaoId]);

    // Insert the pre-parsed analysis as completed
    const analysisRes = await query(
      `INSERT INTO licitacao_ai_analyses (
        licitacao_id, organization_id, status, 
        summary, dates_extracted, required_documents, edital_items,
        product_matches, compliance_analysis, compliance_score,
        risk_assessment, recommendations, tokens_used, model_used,
        analyzed_by
      ) VALUES ($1,$2,'completed',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        licitacaoId,
        org.organization_id,
        data.summary || '',
        JSON.stringify(data.dates_extracted || data.dates || []),
        JSON.stringify(data.required_documents || data.checklist_items || []),
        JSON.stringify(data.edital_items || []),
        JSON.stringify(data.product_matches || []),
        data.compliance_analysis || '',
        data.compliance_score ?? null,
        data.risk_assessment || '',
        data.recommendations || '',
        0,
        'parse-edital',
        req.userId,
      ]
    );

    await syncChecklistItems(licitacaoId, data.required_documents || data.checklist_items);

    // Add history
    const u = await query('SELECT name FROM users WHERE id=$1', [req.userId]);
    await query(
      'INSERT INTO licitacao_history (licitacao_id, user_id, user_name, action, details) VALUES ($1,$2,$3,$4,$5)',
      [licitacaoId, req.userId, u.rows[0]?.name || 'Sistema', 'ai_analysis', 'Análise de edital por IA (criação automática)']
    );

    res.json(analysisRes.rows[0]);
  } catch (e) {
    logError('licitacao_ai.save_analysis_error', e);
    res.status(500).json({ error: e.message });
  }
});

// ===================== HELPERS =====================

async function extractTextFromUrl(editalUrl) {
  const response = await fetch(editalUrl);
  if (!response.ok) throw new Error('Falha ao baixar arquivo');

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/pdf') || String(editalUrl).toLowerCase().endsWith('.pdf')) {
    const buffer = await response.arrayBuffer();
    const pdfData = await pdf(Buffer.from(buffer));
    return pdfData.text || '';
  }

  return await response.text();
}

async function resolveEditalText({ editalText, editalUrl }) {
  if (typeof editalText === 'string' && editalText.trim()) return editalText.trim();
  if (editalUrl) return (await extractTextFromUrl(editalUrl)).trim();
  return '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRequiredDocuments(data) {
  const source = [...asArray(data?.required_documents), ...asArray(data?.checklist_items)];

  return Array.from(new Set(source.map((entry) => {
    if (typeof entry === 'string') return entry.trim();
    if (!entry || typeof entry !== 'object') return '';
    return normalizeText(entry.name || entry.title || entry.label || entry.description);
  }).filter(Boolean)));
}

function normalizeDateEntries(entries) {
  return asArray(entries).map((entry) => {
    if (typeof entry === 'string' && entry.trim()) {
      return { label: 'Data importante', date: entry.trim() };
    }

    if (!entry || typeof entry !== 'object') return null;

    const date = normalizeText(entry.date || entry.value);
    if (!date) return null;

    const normalized = {
      label: normalizeText(entry.label) || 'Data importante',
      date,
    };

    const description = normalizeText(entry.description);
    if (description) normalized.description = description;

    return normalized;
  }).filter(Boolean);
}

function buildFallbackDateEntries(data) {
  return [
    data?.opening_date ? { label: 'Abertura', date: String(data.opening_date).trim() } : null,
    data?.deadline_date ? { label: 'Prazo', date: String(data.deadline_date).trim() } : null,
    data?.result_date ? { label: 'Resultado', date: String(data.result_date).trim() } : null,
  ].filter(Boolean);
}

function normalizeEditalItems(items) {
  return asArray(items).map((item, index) => {
    if (typeof item === 'string' && item.trim()) {
      return {
        item_number: String(index + 1),
        description: item.trim(),
      };
    }

    if (!item || typeof item !== 'object') return null;

    const description = normalizeText(item.description || item.name || item.item || item.title);
    if (!description) return null;

    const normalized = {
      item_number: normalizeText(item.item_number || item.number || item.code),
      description,
    };

    const quantity = normalizeText(item.quantity);
    const unit = normalizeText(item.unit);
    const estimatedValue = normalizeText(item.estimated_value);

    if (quantity) normalized.quantity = quantity;
    if (unit) normalized.unit = unit;
    if (estimatedValue) normalized.estimated_value = estimatedValue;

    return normalized;
  }).filter(Boolean);
}

function normalizeTasks(tasks) {
  return asArray(tasks).map((task) => {
    if (!task || typeof task !== 'object') return null;

    const title = normalizeText(task.title || task.name);
    if (!title) return null;

    const normalized = {
      title,
      priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium',
    };

    const description = normalizeText(task.description);
    const dueDate = normalizeText(task.due_date);

    if (description) normalized.description = description;
    if (dueDate) normalized.due_date = dueDate;

    return normalized;
  }).filter(Boolean);
}

function normalizeMatchLevel(matchLevel) {
  const level = normalizeText(matchLevel).toLowerCase();
  if (!level) return 'parcial';
  if (['total', 'atende', 'completo', 'completa'].includes(level)) return 'total';
  if (['parcial', 'partial', 'parcialmente'].includes(level)) return 'parcial';
  if (['não atende', 'nao atende', 'nao_atende', 'não_atende', 'sem aderência', 'incompatível', 'incompativel'].includes(level)) return 'não atende';
  return 'parcial';
}

function normalizeProductMatches(matches) {
  return asArray(matches).map((match) => {
    if (!match || typeof match !== 'object') return null;

    const editalItem = normalizeText(match.edital_item || match.item || match.item_number || match.description);
    const productName = normalizeText(match.product_name || match.product || match.name);
    if (!editalItem && !productName) return null;

    const normalized = {
      edital_item: editalItem || 'Item sem identificação',
      product_name: productName || 'Sem produto correspondente',
      match_level: normalizeMatchLevel(match.match_level || match.status),
    };

    const notes = normalizeText(match.notes || match.observations || match.reason);
    if (notes) normalized.notes = notes;

    return normalized;
  }).filter(Boolean);
}

function inferComplianceScore(rawScore, productMatches) {
  const numericScore = Number(rawScore);
  if (Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100 && (numericScore !== 0 || productMatches.length === 0)) {
    return Math.round(numericScore);
  }

  if (!productMatches.length) {
    return Number.isFinite(numericScore) && numericScore >= 0 && numericScore <= 100 ? Math.round(numericScore) : null;
  }

  const weightByLevel = {
    total: 100,
    parcial: 50,
    'não atende': 0,
  };

  const total = productMatches.reduce((sum, match) => sum + (weightByLevel[match.match_level] ?? 0), 0);
  return Math.round(total / productMatches.length);
}

function buildComplianceAnalysisFallback(productMatches) {
  if (!productMatches.length) return '';

  const total = productMatches.filter((match) => match.match_level === 'total').length;
  const partial = productMatches.filter((match) => match.match_level === 'parcial').length;
  const noMatch = productMatches.filter((match) => match.match_level === 'não atende').length;
  return `Produtos relacionados analisados: ${total} item(ns) atendem totalmente, ${partial} parcialmente e ${noMatch} não atendem ao catálogo atual.`;
}

function normalizeParsedEditalData(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const requiredDocuments = normalizeRequiredDocuments(data);
  const parsedDates = normalizeDateEntries(data.dates || data.dates_extracted);
  const finalDates = parsedDates.length ? parsedDates : buildFallbackDateEntries(data);
  const productMatches = normalizeProductMatches(data.product_matches);

  return {
    ...data,
    title: normalizeText(data.title),
    edital_number: normalizeText(data.edital_number),
    modality: normalizeText(data.modality),
    opening_date: normalizeText(data.opening_date) || null,
    deadline_date: normalizeText(data.deadline_date) || null,
    result_date: normalizeText(data.result_date) || null,
    estimated_value: normalizeNumber(data.estimated_value),
    entity_name: normalizeText(data.entity_name),
    entity_cnpj: normalizeText(data.entity_cnpj),
    entity_contact: normalizeText(data.entity_contact),
    entity_phone: normalizeText(data.entity_phone),
    entity_email: normalizeText(data.entity_email),
    description: normalizeText(data.description),
    notes: normalizeText(data.notes),
    checklist_items: requiredDocuments,
    required_documents: requiredDocuments,
    tasks: normalizeTasks(data.tasks),
    summary: normalizeText(data.summary) || normalizeText(data.description) || normalizeText(data.title),
    dates: finalDates,
    dates_extracted: finalDates,
    edital_items: normalizeEditalItems(data.edital_items),
    product_matches: productMatches,
    compliance_score: inferComplianceScore(data.compliance_score, productMatches),
    compliance_analysis: normalizeText(data.compliance_analysis) || buildComplianceAnalysisFallback(productMatches),
    risk_assessment: normalizeText(data.risk_assessment),
    recommendations: normalizeText(data.recommendations),
  };
}

async function syncChecklistItems(licitacaoId, requiredDocuments) {
  if (!requiredDocuments?.length) return;

  for (const doc of requiredDocuments) {
    const docTitle = normalizeText(doc);
    if (!docTitle) continue;

    const existing = await query(
      'SELECT 1 FROM licitacao_checklist WHERE licitacao_id=$1 AND title=$2 LIMIT 1',
      [licitacaoId, docTitle]
    );

    if (existing.rows.length > 0) continue;

    const maxOrder = await query('SELECT COALESCE(MAX(sort_order),0)+1 as next FROM licitacao_checklist WHERE licitacao_id=$1', [licitacaoId]);
    await query(
      'INSERT INTO licitacao_checklist (licitacao_id, title, sort_order) VALUES ($1,$2,$3)',
      [licitacaoId, docTitle, maxOrder.rows[0].next]
    );
  }
}

function extractJsonFromResponse(response) {
  if (response == null) throw new Error('Empty AI response');

  const normalized = String(response)
    .replace(/^\uFEFF/, '')
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  if (!normalized) throw new Error('Empty AI response after cleanup');

  const candidates = [normalized];

  try {
    const balanced = extractBalancedJson(normalized);
    if (balanced && balanced !== normalized) candidates.push(balanced);
    candidates.push(repairJsonCandidate(balanced || normalized));
  } catch (error) {
    candidates.push(repairJsonCandidate(normalized));
    logInfo('licitacao_ai.json_extract_fallback', { error: error.message });
  }

  let lastError = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Failed to parse AI response as JSON: ${lastError?.message || 'unknown error'}`);
}

function extractBalancedJson(text) {
  const start = text.search(/[\{\[]/);
  if (start === -1) throw new Error('No JSON found in response');

  const stack = [];
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack[stack.length - 1];
      if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
        stack.pop();
        if (stack.length === 0) {
          end = i;
          break;
        }
      }
    }
  }

  return end === -1 ? text.slice(start) : text.slice(start, end + 1);
}

function repairJsonCandidate(candidate) {
  let repaired = escapeJsonStringControlChars(candidate)
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  const stack = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < repaired.length; i++) {
    const char = repaired[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{' || char === '[') {
      stack.push(char);
      continue;
    }

    if (char === '}' || char === ']') {
      const last = stack[stack.length - 1];
      if ((char === '}' && last === '{') || (char === ']' && last === '[')) {
        stack.pop();
      }
    }
  }

  if (escaped) {
    repaired = repaired.slice(0, -1);
  }
  if (inString) {
    repaired += '"';
  }

  repaired = repaired.replace(/,\s*$/, '');

  while (stack.length) {
    const opener = stack.pop();
    repaired += opener === '{' ? '}' : ']';
  }

  return repaired;
}

function escapeJsonStringControlChars(text) {
  let output = '';
  let inString = false;
  let escaped = false;

  for (const char of text) {
    if (inString) {
      if (escaped) {
        output += char;
        escaped = false;
        continue;
      }
      if (char === '\\') {
        output += char;
        escaped = true;
        continue;
      }
      if (char === '"') {
        output += char;
        inString = false;
        continue;
      }
      if (char === '\n') {
        output += '\\n';
        continue;
      }
      if (char === '\r') {
        output += '\\r';
        continue;
      }
      if (char === '\t') {
        output += '\\t';
        continue;
      }
      output += char;
      continue;
    }

    if (char === '"') {
      inString = true;
    }
    output += char;
  }

  return output;
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
