import { Router } from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public list — used by the calculator (no auth needed)
router.get('/public', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, parent_id, name, slug, lux, icon, scope,
              pole_height_min, pole_height_max, pole_uniformity,
              position, is_active
         FROM calc_categories
        WHERE is_active = true
        ORDER BY scope, COALESCE(parent_id::text,''), position, name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[calc-categories] public list error:', error);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
});

async function requireAdmin(req, res) {
  const r = await query(
    `SELECT u.is_superadmin, om.role
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
      WHERE u.id = $1`,
    [req.userId]
  );
  const isSuper = r.rows[0]?.is_superadmin;
  const isOwner = r.rows.some(x => x.role === 'owner' || x.role === 'admin');
  if (!isSuper && !isOwner) {
    res.status(403).json({ error: 'Apenas administradores podem gerenciar categorias' });
    return false;
  }
  return true;
}

router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM calc_categories ORDER BY scope, COALESCE(parent_id::text,''), position, name`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[calc-categories] list error:', error);
    res.status(500).json({ error: 'Erro ao listar categorias' });
  }
});

router.post('/', authenticate, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const {
      parent_id = null,
      name,
      slug,
      lux = 300,
      icon = 'Building2',
      scope = 'indoor',
      pole_height_min = null,
      pole_height_max = null,
      pole_uniformity = null,
      position = 0,
      is_active = true,
    } = req.body || {};
    if (!name || !slug) return res.status(400).json({ error: 'Nome e slug são obrigatórios' });
    const result = await query(
      `INSERT INTO calc_categories (parent_id, name, slug, lux, icon, scope,
            pole_height_min, pole_height_max, pole_uniformity, position, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [parent_id, name, slug, lux, icon, scope, pole_height_min, pole_height_max, pole_uniformity, position, is_active]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[calc-categories] create error:', error);
    if (String(error.message).includes('duplicate')) {
      return res.status(409).json({ error: 'Slug já cadastrado' });
    }
    res.status(500).json({ error: 'Erro ao criar categoria' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { id } = req.params;
    const fields = [
      'parent_id','name','slug','lux','icon','scope',
      'pole_height_min','pole_height_max','pole_uniformity','position','is_active'
    ];
    const sets = [];
    const values = [];
    let i = 1;
    for (const f of fields) {
      if (f in (req.body || {})) {
        sets.push(`${f} = $${i++}`);
        values.push(req.body[f]);
      }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nada para atualizar' });
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const result = await query(
      `UPDATE calc_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[calc-categories] update error:', error);
    res.status(500).json({ error: 'Erro ao atualizar categoria' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    await query(`DELETE FROM calc_categories WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('[calc-categories] delete error:', error);
    res.status(500).json({ error: 'Erro ao excluir categoria' });
  }
});

export default router;
