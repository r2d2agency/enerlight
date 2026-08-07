import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logError } from '../logger.js';

const router = express.Router();
router.use(authenticate);

async function getUserContext(userId) {
  const orgResult = await query(
    `SELECT om.organization_id, om.role 
     FROM organization_members om 
     WHERE om.user_id = $1 
     LIMIT 1`,
    [userId]
  );
  if (orgResult.rows.length === 0) return null;
  return {
    organizationId: orgResult.rows[0].organization_id,
    role: orgResult.rows[0].role
  };
}

// Get categories and subcategories
router.get('/', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });

    const result = await query(
      `SELECT * FROM price_list_categories 
       WHERE organization_id = $1 
       ORDER BY category ASC, subcategory ASC`,
      [ctx.organizationId]
    );
    res.json(result.rows);
  } catch (err) {
    logError('online-quotes.categories.get', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Create/Update category mapping
router.post('/', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    
    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { id, category, subcategory } = req.body;
    
    if (id) {
      const result = await query(
        `UPDATE price_list_categories 
         SET category = $1, subcategory = $2, updated_at = NOW()
         WHERE id = $3 AND organization_id = $4 RETURNING *`,
        [category.toUpperCase(), subcategory?.toUpperCase(), id, ctx.organizationId]
      );
      res.json(result.rows[0]);
    } else {
      const result = await query(
        `INSERT INTO price_list_categories (organization_id, category, subcategory) 
         VALUES ($1, $2, $3) RETURNING *`,
        [ctx.organizationId, category.toUpperCase(), subcategory?.toUpperCase()]
      );
      res.json(result.rows[0]);
    }
  } catch (err) {
    logError('online-quotes.categories.post', err);
    res.status(500).json({ error: 'Failed to save category' });
  }
});

// Delete category mapping
router.delete('/:id', async (req, res) => {
  try {
    const ctx = await getUserContext(req.userId);
    if (!ctx) return res.status(403).json({ error: 'User not associated with any organization' });
    
    if (ctx.role !== 'admin' && ctx.role !== 'manager' && ctx.role !== 'owner') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await query(
      `DELETE FROM price_list_categories WHERE id = $1 AND organization_id = $2`,
      [req.params.id, ctx.organizationId]
    );
    res.json({ success: true });
  } catch (err) {
    logError('online-quotes.categories.delete', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
