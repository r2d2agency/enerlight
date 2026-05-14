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
      `SELECT om.id, om.user_id, u.name, u.email, om.role, om.is_active
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
    const { role, is_active } = req.body;
    
    const orgResult = await query(
      `SELECT organization_id FROM organization_members WHERE user_id = $1 LIMIT 1`,
      [req.userId]
    );
    const organizationId = orgResult.rows[0].organization_id;

    const result = await query(
      `UPDATE organization_members 
       SET role = COALESCE($1, role),
           is_active = COALESCE($2, is_active),
           updated_at = NOW()
       WHERE user_id = $3 AND organization_id = $4
       RETURNING *`,
      [role, is_active, userId, organizationId]
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
