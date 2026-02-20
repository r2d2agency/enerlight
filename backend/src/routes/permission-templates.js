import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get all templates
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM permission_templates ORDER BY sort_order ASC, created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get permission templates error:', error);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

// Create template (superadmin only)
router.post('/', authenticate, async (req, res) => {
  try {
    const userResult = await query(`SELECT is_superadmin FROM users WHERE id = $1`, [req.userId]);
    if (!userResult.rows[0]?.is_superadmin) {
      return res.status(403).json({ error: 'Apenas superadmins podem criar templates' });
    }

    const { name, description, icon, permissions } = req.body;
    if (!name || !permissions) {
      return res.status(400).json({ error: 'Nome e permissões são obrigatórios' });
    }

    const maxSort = await query(`SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM permission_templates`);
    
    const result = await query(
      `INSERT INTO permission_templates (name, description, icon, permissions, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description || null, icon || 'Users', JSON.stringify(permissions), maxSort.rows[0].next]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create permission template error:', error);
    res.status(500).json({ error: 'Erro ao criar template' });
  }
});

// Update template (superadmin only)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const userResult = await query(`SELECT is_superadmin FROM users WHERE id = $1`, [req.userId]);
    if (!userResult.rows[0]?.is_superadmin) {
      return res.status(403).json({ error: 'Apenas superadmins podem editar templates' });
    }

    const { name, description, icon, permissions } = req.body;
    const result = await query(
      `UPDATE permission_templates SET name = COALESCE($1, name), description = $2, icon = COALESCE($3, icon), 
       permissions = COALESCE($4, permissions) WHERE id = $5 RETURNING *`,
      [name, description || null, icon, permissions ? JSON.stringify(permissions) : null, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update permission template error:', error);
    res.status(500).json({ error: 'Erro ao atualizar template' });
  }
});

// Delete template (superadmin only)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const userResult = await query(`SELECT is_superadmin FROM users WHERE id = $1`, [req.userId]);
    if (!userResult.rows[0]?.is_superadmin) {
      return res.status(403).json({ error: 'Apenas superadmins podem excluir templates' });
    }

    await query(`DELETE FROM permission_templates WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete permission template error:', error);
    res.status(500).json({ error: 'Erro ao excluir template' });
  }
});

export default router;
