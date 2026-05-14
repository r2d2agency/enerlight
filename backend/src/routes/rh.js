import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
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

export default router;
