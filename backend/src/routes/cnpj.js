import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Lookup CNPJ via configured API (gleego or fallback to brasilapi)
router.get('/lookup/:cnpj', authenticate, async (req, res) => {
  try {
    const cnpj = req.params.cnpj.replace(/\D/g, '');
    if (cnpj.length !== 14) {
      return res.status(400).json({ error: 'CNPJ deve ter 14 dígitos' });
    }

    // Get API config from system_settings
    const settingsResult = await query(
      `SELECT key, value FROM system_settings WHERE key IN ('cnpj_api_url', 'cnpj_api_token')`
    );
    const settings = {};
    for (const row of settingsResult.rows) {
      settings[row.key] = row.value;
    }

    const apiUrl = settings.cnpj_api_url || '';
    const apiToken = settings.cnpj_api_token || '';

    // Use gleego API if configured, otherwise fallback to BrasilAPI
    if (apiUrl && apiToken) {
      const url = `${apiUrl.replace(/\/$/, '')}/api/v1/cnpj/${cnpj}`;
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${apiToken}` }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[cnpj] Gleego API error ${response.status}:`, errorText);
        return res.status(response.status).json({ error: 'CNPJ não encontrado na base' });
      }

      const data = await response.json();
      
      // Normalize gleego response
      const normalized = {
        razao_social: data.empresa?.razao_social || '',
        nome_fantasia: data.estabelecimento?.nome_fantasia || '',
        cnpj: cnpj,
        logradouro: data.estabelecimento?.logradouro || '',
        numero: data.estabelecimento?.numero || '',
        bairro: data.estabelecimento?.bairro || '',
        municipio: data.estabelecimento?.municipio_nome || '',
        uf: data.estabelecimento?.uf || '',
        cep: data.estabelecimento?.cep || '',
        telefone: data.estabelecimento?.ddd_telefone_1 || data.estabelecimento?.telefone1 || '',
        email: data.estabelecimento?.email || '',
        capital_social: data.empresa?.capital_social || '',
        natureza: data.empresa?.natureza_descricao || '',
        situacao: data.estabelecimento?.situacao_cadastral || '',
        cnae_principal: data.estabelecimento?.cnae_principal || '',
        data_abertura: data.estabelecimento?.data_inicio_atividade || '',
        socios: (data.socios || []).map(s => ({
          nome: s.nome_socio || s.nome || '',
          qualificacao: s.qualificacao_descricao || s.qualificacao || '',
          data_entrada: s.data_entrada || '',
        })),
      };

      return res.json(normalized);
    } else {
      // Fallback to BrasilAPI (free, no auth)
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!response.ok) {
        return res.status(response.status).json({ error: 'CNPJ não encontrado' });
      }

      const data = await response.json();
      const normalized = {
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || '',
        cnpj: cnpj,
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        bairro: data.bairro || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        cep: data.cep || '',
        telefone: data.ddd_telefone_1 || '',
        email: data.email || '',
        capital_social: data.capital_social || '',
        natureza: data.natureza_juridica || '',
        situacao: data.situacao_cadastral || '',
        cnae_principal: '',
        data_abertura: data.data_inicio_atividade || '',
        socios: (data.qsa || []).map(s => ({
          nome: s.nome_socio || '',
          qualificacao: s.qual_socio || '',
          data_entrada: '',
        })),
      };

      return res.json(normalized);
    }
  } catch (error) {
    console.error('[cnpj] Lookup error:', error);
    res.status(500).json({ error: 'Erro ao consultar CNPJ' });
  }
});

export default router;
