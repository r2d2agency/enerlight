import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Idempotent schema bootstrap – garante tabelas/colunas de RH mesmo se a migração inicial não rodou.
let schemaReady = null;
async function ensureRhSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    try {
      await query(`CREATE TABLE IF NOT EXISTS rh_authorized_locations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        radius_meters INTEGER DEFAULT 150,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`);
      const memberCols = [
        ['is_active', 'BOOLEAN DEFAULT true'],
        ['hire_date', 'DATE'],
        ['contract_type', 'VARCHAR(20)'],
        ['base_salary', 'NUMERIC(12,2)'],
        ["salary_composition", "JSONB DEFAULT '[]'::jsonb"],
        ['work_start_time', 'TIME'],
        ['work_end_time', 'TIME'],
        ['lunch_start_time', 'TIME'],
        ['lunch_end_time', 'TIME'],
        ['authorized_radius_meters', 'INTEGER'],
        ['authorized_latitude', 'DECIMAL(10,8)'],
        ['authorized_longitude', 'DECIMAL(11,8)'],
      ];
      for (const [name, type] of memberCols) {
        await query(`ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS ${name} ${type};`);
      }
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf VARCHAR(20);`);
      await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birth_date DATE;`);
      await query(`CREATE TABLE IF NOT EXISTS rh_punches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        punch_type VARCHAR(20) NOT NULL,
        punched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source VARCHAR(20) NOT NULL DEFAULT 'app',
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        location_id UUID REFERENCES rh_authorized_locations(id) ON DELETE SET NULL,
        notes TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );`);
      await query(`CREATE INDEX IF NOT EXISTS idx_rh_punches_org_date ON rh_punches(organization_id, punched_at);`);
      await query(`CREATE INDEX IF NOT EXISTS idx_rh_punches_user_date ON rh_punches(user_id, punched_at);`);
      await query(`CREATE TABLE IF NOT EXISTS rh_punch_audit (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        punch_id UUID REFERENCES rh_punches(id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        action VARCHAR(20) NOT NULL,
        before_data JSONB,
        after_data JSONB,
        reason TEXT,
        actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );`);
      console.log('[rh] schema ensured');
    } catch (err) {
      console.error('[rh] ensureRhSchema failed:', err.message);
      schemaReady = null;
      throw err;
    }
  })();
  return schemaReady;
}

router.use(async (_req, _res, next) => {
  try { await ensureRhSchema(); } catch (_e) { /* segue: endpoint responderá o erro real */ }
  next();
});

router.use(authenticate);

// Helper: check if user is RH manager (owner/admin/manager)
async function isRhManager(userId) {
  const result = await query(
    `SELECT om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 AND om.role IN ('owner', 'admin', 'manager')
     LIMIT 1`,
    [userId]
  );
  return result.rows.length > 0;
}

// Get organization members (employees)
router.get('/employees', async (req, res) => {
  try {
    const orgResult = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    
    if (orgResult.rows.length === 0) {
      return res.status(403).json({ error: 'Usuário sem organização' });
    }
    
    const organizationId = orgResult.rows[0].organization_id;
    
    const result = await query(
      `SELECT om.id, om.user_id, u.name, u.email, om.role, om.is_active,
              u.cpf, u.birth_date,
              om.work_start_time, om.work_end_time, om.lunch_start_time, om.lunch_end_time,
              om.authorized_radius_meters, om.authorized_latitude, om.authorized_longitude
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = $1
       ORDER BY u.name ASC`,
      [organizationId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('List employees error:', error);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});

// Update organization member (vincular, etc)
router.patch('/members/:userId', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { userId } = req.params;
    const { 
      role, is_active, cpf, birth_date,
      work_start_time, work_end_time, lunch_start_time, lunch_end_time,
      authorized_radius_meters, authorized_latitude, authorized_longitude
    } = req.body;

    const orgResult = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const organizationId = orgResult.rows[0].organization_id;

    // Update user info if provided
    if (cpf !== undefined || birth_date !== undefined) {
      await query(
        `UPDATE users SET 
           cpf = COALESCE($1, cpf),
           birth_date = COALESCE($2, birth_date),
           updated_at = NOW()
         WHERE id = $3`,
        [cpf || null, birth_date || null, userId]
      );
    }

    // Check if target is owner (can't change owner's role)
    const targetCheck = await query(
      `SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
      [organizationId, userId]
    );
    
    const isOwner = targetCheck.rows[0]?.role === 'owner';
    const finalRole = isOwner ? 'owner' : (role || targetCheck.rows[0]?.role);

    const result = await query(
      `UPDATE organization_members 
       SET role = $1,
           is_active = COALESCE($2, is_active),
           work_start_time = COALESCE($3, work_start_time),
           work_end_time = COALESCE($4, work_end_time),
           lunch_start_time = COALESCE($5, lunch_start_time),
           lunch_end_time = COALESCE($6, lunch_end_time),
           authorized_radius_meters = COALESCE($7, authorized_radius_meters),
           authorized_latitude = COALESCE($8, authorized_latitude),
           authorized_longitude = COALESCE($9, authorized_longitude),
           updated_at = NOW()
       WHERE user_id = $10 AND organization_id = $11
       RETURNING *`,
      [
        finalRole, is_active, work_start_time, work_end_time, lunch_start_time, lunch_end_time, 
        authorized_radius_meters, authorized_latitude, authorized_longitude,
        userId, organizationId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update member error:', error);
    res.status(500).json({ error: 'Erro ao atualizar membro' });
  }
});

// --- Locations Management ---

// Get all authorized locations for an organization
router.get('/locations', async (req, res) => {
  try {
    const orgResult = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    
    if (orgResult.rows.length === 0) return res.status(403).json({ error: 'Usuário sem organização' });
    const organizationId = orgResult.rows[0].organization_id;

    const result = await query(
      `SELECT * FROM rh_authorized_locations WHERE organization_id = $1 ORDER BY name ASC`,
      [organizationId]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('List locations error:', error);
    res.status(500).json({ error: 'Erro ao listar locais' });
  }
});

// Create a new location
router.post('/locations', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) return res.status(403).json({ error: 'Acesso negado' });

    const { name, latitude, longitude, radius_meters } = req.body;
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const orgResult = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const organizationId = orgResult.rows[0].organization_id;

    const result = await query(
      `INSERT INTO rh_authorized_locations (organization_id, name, latitude, longitude, radius_meters)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [organizationId, name, latitude, longitude, radius_meters || 100]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create location error:', error);
    res.status(500).json({ error: 'Erro ao criar local' });
  }
});

// Delete a location
router.delete('/locations/:id', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) return res.status(403).json({ error: 'Acesso negado' });
    const { id } = req.params;
    
    const orgResult = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const organizationId = orgResult.rows[0].organization_id;

    await query(
      `DELETE FROM rh_authorized_locations WHERE id = $1 AND organization_id = $2`,
      [id, organizationId]
    );

    res.status(204).send();
  } catch (error) {
    console.error('Delete location error:', error);
    res.status(500).json({ error: 'Erro ao excluir local' });
  }
});

// =============================================================
// PUNCHES (registros de ponto reais, com auditoria)
// =============================================================

const PUNCH_TYPES = ['entrada', 'almoco_ini', 'almoco_fim', 'saida', 'extra'];

function normalizePunchType(t) {
  if (!t) return null;
  const key = String(t).toLowerCase().trim();
  const map = {
    'entrada': 'entrada',
    'almoço': 'almoco_ini',
    'almoco': 'almoco_ini',
    'almoco_ini': 'almoco_ini',
    'almoco_inicio': 'almoco_ini',
    'volta': 'almoco_fim',
    'almoco_fim': 'almoco_fim',
    'almoco_volta': 'almoco_fim',
    'saída': 'saida',
    'saida': 'saida',
    'extra': 'extra',
  };
  return map[key] || null;
}

async function getUserOrgId(userId) {
  const r = await query(
    `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.organization_id || null;
}

// Kiosk/App: cria a batida (para si mesmo OU um user_id reconhecido facialmente)
router.post('/punches', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });

    const { user_id, punch_type, latitude, longitude, location_id, notes, source } = req.body || {};
    const punchType = normalizePunchType(punch_type);
    if (!punchType) return res.status(400).json({ error: 'Tipo de batida inválido' });

    const targetUserId = user_id || req.userId;
    // valida que o target pertence a mesma org
    const inOrg = await query(
      `SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2 AND COALESCE(is_active, true) = true`,
      [targetUserId, orgId]
    );
    if (inOrg.rows.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado ou inativo' });
    }

    const src = ['kiosk', 'app', 'manual'].includes(source) ? source : 'app';
    // Se for outro user, exige kiosk (facial) — protege contra spoofing manual disfarçado
    if (targetUserId !== req.userId && src !== 'kiosk') {
      if (!await isRhManager(req.userId)) {
        return res.status(403).json({ error: 'Sem permissão para bater ponto por outro colaborador' });
      }
    }

    const ins = await query(
      `INSERT INTO rh_punches (organization_id, user_id, punch_type, source, latitude, longitude, location_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [orgId, targetUserId, punchType, src, latitude || null, longitude || null, location_id || null, notes || null, req.userId]
    );
    const punch = ins.rows[0];
    await query(
      `INSERT INTO rh_punch_audit (punch_id, organization_id, action, after_data, actor_user_id, reason)
       VALUES ($1,$2,'create',$3,$4,$5)`,
      [punch.id, orgId, JSON.stringify(punch), req.userId, src === 'manual' ? (notes || 'Batida manual') : null]
    );
    res.status(201).json(punch);
  } catch (error) {
    console.error('Create punch error:', error);
    res.status(500).json({ error: 'Erro ao registrar batida' });
  }
});

// Colaborador vê apenas suas próprias batidas
router.get('/punches/me', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });
    const { from, to } = req.query;
    const params = [req.userId, orgId];
    let where = `user_id = $1 AND organization_id = $2`;
    if (from) { params.push(from); where += ` AND punched_at >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND punched_at <= $${params.length}`; }
    const r = await query(
      `SELECT id, user_id, punch_type, punched_at, source, latitude, longitude, notes, created_at
         FROM rh_punches WHERE ${where}
         ORDER BY punched_at DESC LIMIT 500`,
      params
    );
    res.json(r.rows);
  } catch (error) {
    console.error('Get my punches error:', error);
    res.status(500).json({ error: 'Erro ao carregar batidas' });
  }
});

// Admin/RH: lista todas as batidas do dia (ou por período), com filtros
router.get('/punches', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });

    const { date, from, to, user_id } = req.query;
    const params = [orgId];
    let where = `p.organization_id = $1`;
    if (date) {
      params.push(date + ' 00:00:00');
      where += ` AND p.punched_at >= $${params.length}`;
      params.push(date + ' 23:59:59');
      where += ` AND p.punched_at <= $${params.length}`;
    } else {
      if (from) { params.push(from); where += ` AND p.punched_at >= $${params.length}`; }
      if (to)   { params.push(to);   where += ` AND p.punched_at <= $${params.length}`; }
    }
    if (user_id) { params.push(user_id); where += ` AND p.user_id = $${params.length}`; }

    const r = await query(
      `SELECT p.*, u.name as user_name, u.email as user_email
         FROM rh_punches p
         JOIN users u ON u.id = p.user_id
         WHERE ${where}
         ORDER BY p.punched_at DESC LIMIT 2000`,
      params
    );
    res.json(r.rows);
  } catch (error) {
    console.error('Get punches error:', error);
    res.status(500).json({ error: 'Erro ao carregar batidas' });
  }
});

// Admin/RH: quem tem jornada hoje e ainda não bateu entrada
router.get('/punches/dashboard/missing-today', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });

    const r = await query(
      `SELECT om.user_id, u.name, u.email, om.work_start_time,
              (SELECT COUNT(*) FROM rh_punches p
                 WHERE p.user_id = om.user_id
                   AND p.organization_id = om.organization_id
                   AND p.punched_at::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
              ) as punches_today
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = $1
          AND COALESCE(om.is_active, true) = true
        ORDER BY u.name`,
      [orgId]
    );
    const missing = r.rows.filter(row => Number(row.punches_today) === 0);
    res.json({ missing, total: r.rows.length, present: r.rows.length - missing.length });
  } catch (error) {
    console.error('Missing punches error:', error);
    res.status(500).json({ error: 'Erro ao calcular pendências' });
  }
});

// Admin/RH: criar batida manual com motivo obrigatório
router.post('/punches/manual', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });

    const { user_id, punch_type, punched_at, reason, notes } = req.body || {};
    if (!user_id || !punched_at || !reason) {
      return res.status(400).json({ error: 'user_id, punched_at e reason são obrigatórios' });
    }
    const punchType = normalizePunchType(punch_type);
    if (!punchType) return res.status(400).json({ error: 'Tipo de batida inválido' });

    const inOrg = await query(
      `SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
      [user_id, orgId]
    );
    if (inOrg.rows.length === 0) return res.status(404).json({ error: 'Colaborador não encontrado' });

    const ins = await query(
      `INSERT INTO rh_punches (organization_id, user_id, punch_type, punched_at, source, notes, created_by)
       VALUES ($1,$2,$3,$4,'manual',$5,$6) RETURNING *`,
      [orgId, user_id, punchType, punched_at, notes || null, req.userId]
    );
    const punch = ins.rows[0];
    await query(
      `INSERT INTO rh_punch_audit (punch_id, organization_id, action, after_data, actor_user_id, reason)
       VALUES ($1,$2,'create',$3,$4,$5)`,
      [punch.id, orgId, JSON.stringify(punch), req.userId, reason]
    );
    res.status(201).json(punch);
  } catch (error) {
    console.error('Manual punch error:', error);
    res.status(500).json({ error: 'Erro ao registrar batida manual' });
  }
});

// Admin/RH: editar batida (motivo obrigatório)
router.patch('/punches/:id', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) return res.status(403).json({ error: 'Acesso negado' });
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });
    const { id } = req.params;
    const { punch_type, punched_at, notes, reason } = req.body || {};
    if (!reason) return res.status(400).json({ error: 'Motivo (reason) obrigatório' });

    const before = await query(
      `SELECT * FROM rh_punches WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (before.rows.length === 0) return res.status(404).json({ error: 'Batida não encontrada' });

    const newType = punch_type ? normalizePunchType(punch_type) : before.rows[0].punch_type;
    if (!newType) return res.status(400).json({ error: 'Tipo inválido' });

    const upd = await query(
      `UPDATE rh_punches SET
         punch_type = $1,
         punched_at = COALESCE($2, punched_at),
         notes = COALESCE($3, notes),
         updated_at = NOW()
       WHERE id = $4 AND organization_id = $5 RETURNING *`,
      [newType, punched_at || null, notes ?? null, id, orgId]
    );
    await query(
      `INSERT INTO rh_punch_audit (punch_id, organization_id, action, before_data, after_data, actor_user_id, reason)
       VALUES ($1,$2,'update',$3,$4,$5,$6)`,
      [id, orgId, JSON.stringify(before.rows[0]), JSON.stringify(upd.rows[0]), req.userId, reason]
    );
    res.json(upd.rows[0]);
  } catch (error) {
    console.error('Update punch error:', error);
    res.status(500).json({ error: 'Erro ao atualizar batida' });
  }
});

router.delete('/punches/:id', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) return res.status(403).json({ error: 'Acesso negado' });
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });
    const { id } = req.params;
    const reason = req.body?.reason || req.query?.reason;
    if (!reason) return res.status(400).json({ error: 'Motivo (reason) obrigatório' });

    const before = await query(
      `SELECT * FROM rh_punches WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    if (before.rows.length === 0) return res.status(404).json({ error: 'Batida não encontrada' });

    await query(
      `INSERT INTO rh_punch_audit (punch_id, organization_id, action, before_data, actor_user_id, reason)
       VALUES ($1,$2,'delete',$3,$4,$5)`,
      [id, orgId, JSON.stringify(before.rows[0]), req.userId, reason]
    );
    await query(`DELETE FROM rh_punches WHERE id = $1 AND organization_id = $2`, [id, orgId]);
    res.status(204).send();
  } catch (error) {
    console.error('Delete punch error:', error);
    res.status(500).json({ error: 'Erro ao excluir batida' });
  }
});

router.get('/punches/:id/audit', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) return res.status(403).json({ error: 'Acesso negado' });
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });
    const r = await query(
      `SELECT a.*, u.name as actor_name
         FROM rh_punch_audit a
         LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.punch_id = $1 AND a.organization_id = $2
        ORDER BY a.created_at DESC`,
      [req.params.id, orgId]
    );
    res.json(r.rows);
  } catch (error) {
    console.error('Audit punch error:', error);
    res.status(500).json({ error: 'Erro ao carregar auditoria' });
  }
});

// =============================================================
// FICHA DE CONTRATAÇÃO
// =============================================================

router.patch('/employment/:userId', async (req, res) => {
  try {
    if (!await isRhManager(req.userId)) return res.status(403).json({ error: 'Acesso negado' });
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });

    const { userId } = req.params;
    const { hire_date, contract_type, base_salary, salary_composition, is_active } = req.body || {};

    const upd = await query(
      `UPDATE organization_members SET
         hire_date = COALESCE($1, hire_date),
         contract_type = COALESCE($2, contract_type),
         base_salary = COALESCE($3, base_salary),
         salary_composition = COALESCE($4::jsonb, salary_composition),
         is_active = COALESCE($5, is_active),
         updated_at = NOW()
       WHERE user_id = $6 AND organization_id = $7
       RETURNING *`,
      [
        hire_date || null,
        contract_type || null,
        base_salary === undefined ? null : base_salary,
        salary_composition ? JSON.stringify(salary_composition) : null,
        is_active === undefined ? null : is_active,
        userId,
        orgId,
      ]
    );
    if (upd.rows.length === 0) return res.status(404).json({ error: 'Membro não encontrado' });
    res.json(upd.rows[0]);
  } catch (error) {
    console.error('Update employment error:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados de contratação' });
  }
});

// Employee list (extendido) — inclui campos de contratação
router.get('/employees/full', async (req, res) => {
  try {
    const orgId = await getUserOrgId(req.userId);
    if (!orgId) return res.status(403).json({ error: 'Usuário sem organização' });
    const result = await query(
      `SELECT om.user_id, u.name, u.email, om.role, om.is_active,
              om.hire_date, om.contract_type, om.base_salary, om.salary_composition,
              om.work_start_time, om.work_end_time
         FROM organization_members om
         JOIN users u ON u.id = om.user_id
        WHERE om.organization_id = $1
        ORDER BY u.name`,
      [orgId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Full employees error:', error);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});

export default router;

