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

    const result = await query(
      `UPDATE organization_members 
       SET role = COALESCE($1, role),
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
        role, is_active, work_start_time, work_end_time, lunch_start_time, lunch_end_time, 
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

export default router;
