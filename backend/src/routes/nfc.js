import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { checkNumber as wapiCheckNumber } from '../lib/wapi-provider.js';

const router = Router();

const FRONTEND_URL = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://app.enerlight.com.br').replace(/\/$/, '');

// ---------- helpers ----------
async function getUserOrg(userId) {
  const r = await query(
    `SELECT om.organization_id, om.role
     FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

function generateSlug(len = 8) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function buildPublicUrl(slug) {
  return `${FRONTEND_URL}/c/${slug}`;
}

function buildQrUrl(publicUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(publicUrl)}`;
}

// Backfill stored URLs to match current FRONTEND_URL (runs once on boot)
(async () => {
  try {
    await query(
      `UPDATE nfc_cards
         SET public_url = $1 || '/c/' || public_slug,
             qr_code_url = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' || replace($1 || '/c/' || public_slug, ':', '%3A')
       WHERE public_slug IS NOT NULL
         AND (public_url IS NULL OR public_url NOT LIKE $1 || '%')`,
      [FRONTEND_URL]
    );
  } catch (e) {
    // table may not exist yet on first boot - safe to ignore
  }
})();

function parseUA(ua = '') {
  const u = String(ua).toLowerCase();
  let device = 'desktop';
  if (/mobile|android|iphone|ipad/.test(u)) device = /ipad|tablet/.test(u) ? 'tablet' : 'mobile';
  let os = 'unknown';
  if (/windows/.test(u)) os = 'Windows';
  else if (/android/.test(u)) os = 'Android';
  else if (/iphone|ipad|ios/.test(u)) os = 'iOS';
  else if (/mac os x|macintosh/.test(u)) os = 'macOS';
  else if (/linux/.test(u)) os = 'Linux';
  let browser = 'unknown';
  if (/edg\//.test(u)) browser = 'Edge';
  else if (/chrome\//.test(u)) browser = 'Chrome';
  else if (/firefox\//.test(u)) browser = 'Firefox';
  else if (/safari\//.test(u)) browser = 'Safari';
  return { device, os, browser };
}

async function geoFromIP(ip) {
  if (!ip || ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return { city: null, state: null, country: null };
  }
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { city: null, state: null, country: null };
    const d = await r.json();
    return { city: d.city || null, state: d.region || null, country: d.country_name || null };
  } catch {
    return { city: null, state: null, country: null };
  }
}

function buildVCard(p = {}) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  if (p.display_name) lines.push(`FN:${p.display_name}`);
  if (p.display_name) lines.push(`N:${p.display_name};;;;`);
  if (p.company_name) lines.push(`ORG:${p.company_name}`);
  if (p.role_title) lines.push(`TITLE:${p.role_title}`);
  if (p.phone) lines.push(`TEL;TYPE=CELL,VOICE:${p.phone}`);
  if (p.whatsapp) lines.push(`TEL;TYPE=WORK,VOICE:${p.whatsapp}`);
  if (p.email) lines.push(`EMAIL;TYPE=INTERNET:${p.email}`);
  if (p.website) lines.push(`URL:${p.website}`);
  if (p.address) lines.push(`ADR:;;${p.address};;;;`);
  if (p.photo_url) lines.push(`PHOTO;VALUE=URI:${p.photo_url}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// ===========================================
// ADMIN ROUTES (auth)
// ===========================================

// List users in current org (for assignment dropdown)
router.get('/users', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.json([]);
    const r = await query(
      `SELECT u.id, u.name, u.email
       FROM users u
       JOIN organization_members om ON om.user_id = u.id
       WHERE om.organization_id = $1 AND COALESCE(om.is_active, true) = true
       ORDER BY u.name`,
      [org.organization_id]
    );
    res.json(r.rows);
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

// Dashboard summary

router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.json({ stats: {}, top: [], series: [] });

    const stats = await query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active,
        COUNT(*) FILTER (WHERE status <> 'active') AS inactive,
        COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS linked,
        COUNT(*) FILTER (WHERE user_id IS NULL) AS unlinked,
        COUNT(*) AS total
      FROM nfc_cards WHERE organization_id = $1`,
      [org.organization_id]
    );

    const reads = await query(
      `SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE read_at::date = CURRENT_DATE) AS today,
        COUNT(*) FILTER (WHERE read_at >= date_trunc('month', NOW())) AS month
      FROM nfc_reads r
      JOIN nfc_cards c ON c.id = r.card_id
      WHERE c.organization_id = $1`,
      [org.organization_id]
    );

    const top = await query(
      `SELECT u.id AS user_id, u.name, COUNT(r.id) AS reads
       FROM nfc_reads r
       JOIN nfc_cards c ON c.id = r.card_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.organization_id = $1 AND r.read_at >= NOW() - INTERVAL '30 days'
       GROUP BY u.id, u.name
       ORDER BY reads DESC LIMIT 10`,
      [org.organization_id]
    );

    const series = await query(
      `SELECT date_trunc('day', r.read_at)::date AS day, COUNT(*) AS reads
       FROM nfc_reads r
       JOIN nfc_cards c ON c.id = r.card_id
       WHERE c.organization_id = $1 AND r.read_at >= NOW() - INTERVAL '30 days'
       GROUP BY day ORDER BY day`,
      [org.organization_id]
    );

    res.json({
      stats: { ...stats.rows[0], reads: reads.rows[0] },
      top: top.rows,
      series: series.rows,
    });
  } catch (e) {
    console.error('NFC dashboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// List cards
router.get('/cards', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.json([]);
    const { status, user_id, search } = req.query;

    let sql = `
      SELECT c.*, u.name AS user_name, u.email AS user_email,
        p.display_name, p.photo_url, p.role_title,
        (SELECT COUNT(*) FROM nfc_reads r WHERE r.card_id = c.id) AS reads_count
      FROM nfc_cards c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN nfc_card_profiles p ON p.card_id = c.id
      WHERE c.organization_id = $1`;
    const params = [org.organization_id];
    let i = 2;
    if (status) { sql += ` AND c.status = $${i++}`; params.push(status); }
    if (user_id) { sql += ` AND c.user_id = $${i++}`; params.push(user_id); }
    if (search) { sql += ` AND (c.uid ILIKE $${i} OR c.public_slug ILIKE $${i} OR u.name ILIKE $${i})`; params.push(`%${search}%`); i++; }
    sql += ' ORDER BY c.created_at DESC';

    const r = await query(sql, params);
    res.json(r.rows);
  } catch (e) {
    console.error('NFC list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Get card detail
router.get('/cards/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const c = await query(
      `SELECT c.*, u.name AS user_name, u.email AS user_email
       FROM nfc_cards c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 AND c.organization_id = $2`,
      [req.params.id, org.organization_id]
    );
    if (!c.rows[0]) return res.status(404).json({ error: 'Cartão não encontrado' });
    const p = await query(`SELECT * FROM nfc_card_profiles WHERE card_id = $1`, [req.params.id]);
    const m = await query(`SELECT * FROM nfc_materials WHERE card_id = $1 OR (card_id IS NULL AND organization_id = $2) ORDER BY position, created_at`,
      [req.params.id, org.organization_id]);
    res.json({ card: c.rows[0], profile: p.rows[0] || null, materials: m.rows });
  } catch (e) {
    console.error('NFC get error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Create card
router.post('/cards', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.status(403).json({ error: 'Sem organização' });
    const { uid, chip_type, user_id, company_name, plan, profile } = req.body;
    if (!uid) return res.status(400).json({ error: 'UID obrigatório' });

    // ensure slug unique
    let slug;
    for (let i = 0; i < 5; i++) {
      slug = generateSlug(7);
      const ex = await query('SELECT id FROM nfc_cards WHERE public_slug = $1', [slug]);
      if (!ex.rows[0]) break;
    }
    const publicUrl = buildPublicUrl(slug);
    const qrUrl = buildQrUrl(publicUrl);

    const r = await query(
      `INSERT INTO nfc_cards
       (organization_id, uid, chip_type, status, user_id, company_name, public_slug, public_url, qr_code_url, plan, activated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [
        org.organization_id,
        uid,
        chip_type || 'NTAG215',
        user_id ? 'active' : 'inactive',
        user_id || null,
        company_name || null,
        slug,
        publicUrl,
        qrUrl,
        plan || 'card',
      ]
    );
    const card = r.rows[0];

    // Auto-create profile from user data if user_id provided
    let userInfo = {};
    if (user_id) {
      const ui = await query('SELECT name, email FROM users WHERE id = $1', [user_id]);
      userInfo = ui.rows[0] || {};
    }
    const p = profile || {};
    await query(
      `INSERT INTO nfc_card_profiles
        (card_id, display_name, role_title, company_name, photo_url, phone, whatsapp, email, website, address, bio, linkedin, instagram)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        card.id,
        p.display_name || userInfo.name || null,
        p.role_title || null,
        p.company_name || company_name || null,
        p.photo_url || null,
        p.phone || null,
        p.whatsapp || null,
        p.email || userInfo.email || null,
        p.website || null,
        p.address || null,
        p.bio || null,
        p.linkedin || null,
        p.instagram || null,
      ]
    );

    res.json(card);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'UID já cadastrado' });
    console.error('NFC create error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Update card
router.patch('/cards/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const { status, user_id, company_name, chip_type, plan, public_slug } = req.body;
    const fields = []; const params = []; let i = 1;
    if (status !== undefined) { fields.push(`status = $${i++}`); params.push(status); }
    if (user_id !== undefined) { fields.push(`user_id = $${i++}`); params.push(user_id || null); }
    if (company_name !== undefined) { fields.push(`company_name = $${i++}`); params.push(company_name); }
    if (chip_type !== undefined) { fields.push(`chip_type = $${i++}`); params.push(chip_type); }
    if (plan !== undefined) { fields.push(`plan = $${i++}`); params.push(plan); }

    if (public_slug !== undefined) {
      const clean = String(public_slug).toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '').slice(0, 40);
      if (clean.length < 3) return res.status(400).json({ error: 'Slug muito curto (mín. 3 caracteres)' });
      const dup = await query('SELECT id FROM nfc_cards WHERE public_slug = $1 AND id <> $2', [clean, req.params.id]);
      if (dup.rows[0]) return res.status(409).json({ error: 'Slug já em uso' });
      const publicUrl = buildPublicUrl(clean);
      fields.push(`public_slug = $${i++}`); params.push(clean);
      fields.push(`public_url = $${i++}`); params.push(publicUrl);
      fields.push(`qr_code_url = $${i++}`); params.push(buildQrUrl(publicUrl));
    }

    fields.push(`updated_at = NOW()`);
    params.push(req.params.id, org.organization_id);
    const r = await query(
      `UPDATE nfc_cards SET ${fields.join(', ')} WHERE id = $${i++} AND organization_id = $${i} RETURNING *`,
      params
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});


// Update profile
router.put('/cards/:id/profile', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const own = await query('SELECT id FROM nfc_cards WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    if (!own.rows[0]) return res.status(404).json({ error: 'Cartão não encontrado' });

    const p = req.body || {};
    const cols = ['display_name','role_title','company_name','company_logo_url','company_description','photo_url','bio','phone','whatsapp','email','website','address','linkedin','instagram','facebook','youtube','meta_pixel_id','ga_id','showcase_title','showcase_description','showcase_image_url','catalog_cta_enabled','catalog_cta_title','catalog_cta_subtitle','selected_categories'];
    const vals = cols.map(c => {
      if (c === 'selected_categories') return JSON.stringify(Array.isArray(p[c]) ? p[c] : []);
      return p[c] ?? null;
    });

    const upsert = await query(
      `INSERT INTO nfc_card_profiles (card_id, ${cols.join(', ')})
       VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')})
       ON CONFLICT (card_id) DO UPDATE SET
        ${cols.map(c => `${c} = EXCLUDED.${c}`).join(', ')},
        updated_at = NOW()
       RETURNING *`,
      [req.params.id, ...vals]
    );
    res.json(upsert.rows[0]);
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

// Delete
router.delete('/cards/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    await query('DELETE FROM nfc_cards WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Reads & leads
router.get('/cards/:id/reads', authenticate, async (req, res) => {
  const org = await getUserOrg(req.userId);
  const r = await query(
    `SELECT r.* FROM nfc_reads r
     JOIN nfc_cards c ON c.id = r.card_id
     WHERE c.id = $1 AND c.organization_id = $2
     ORDER BY r.read_at DESC LIMIT 500`,
    [req.params.id, org.organization_id]
  );
  res.json(r.rows);
});

router.get('/cards/:id/leads', authenticate, async (req, res) => {
  const org = await getUserOrg(req.userId);
  const r = await query(
    `SELECT l.* FROM nfc_leads l
     WHERE l.card_id = $1 AND l.organization_id = $2
     ORDER BY l.created_at DESC LIMIT 500`,
    [req.params.id, org.organization_id]
  );
  res.json(r.rows);
});

// NFC visual branding (org-level settings stored in system_settings)
const NFC_BRANDING_KEYS = [
  'nfc_default_logo',
  'nfc_primary_color',
  'nfc_accent_color',
  'nfc_bg_color',
  'nfc_bg_gradient',
  'nfc_brand_name',
  'nfc_footer_text',
];

router.get('/branding', authenticate, async (req, res) => {
  try {
    const r = await query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
      [NFC_BRANDING_KEYS]
    );
    const out = {};
    NFC_BRANDING_KEYS.forEach(k => out[k] = null);
    r.rows.forEach(row => out[row.key] = row.value);
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/branding', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    for (const key of NFC_BRANDING_KEYS) {
      if (!(key in body)) continue;
      const value = body[key];
      await query(
        `INSERT INTO system_settings (key, value, updated_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [key, value, req.userId]
      );
    }
    res.json({ ok: true });
  } catch (e) { console.error('nfc branding put', e); res.status(500).json({ error: e.message }); }
});

// Material categories (distinct list for the org)
router.get('/material-categories', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const r = await query(
      `SELECT DISTINCT category FROM nfc_materials
        WHERE organization_id = $1 AND category IS NOT NULL AND category <> ''
        ORDER BY category`,
      [org.organization_id]
    );
    res.json(r.rows.map(x => x.category));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Materials CRUD
router.get('/materials', authenticate, async (req, res) => {
  const org = await getUserOrg(req.userId);
  const { card_id } = req.query;
  const params = [org.organization_id];
  let sql = `SELECT * FROM nfc_materials WHERE organization_id = $1`;
  if (card_id) { sql += ` AND (card_id = $2 OR card_id IS NULL)`; params.push(card_id); }
  sql += ` ORDER BY category NULLS LAST, position, created_at`;
  const r = await query(sql, params);
  res.json(r.rows);
});

router.post('/materials', authenticate, async (req, res) => {
  const org = await getUserOrg(req.userId);
  const { card_id, title, description, material_type, file_url, thumbnail_url, requires_lead, position, category } = req.body;
  const r = await query(
    `INSERT INTO nfc_materials (organization_id, card_id, title, description, material_type, file_url, thumbnail_url, requires_lead, position, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [org.organization_id, card_id || null, title, description || null, material_type || 'pdf', file_url, thumbnail_url || null, requires_lead !== false, position || 0, (category || '').trim() || null]
  );
  res.json(r.rows[0]);
});

router.patch('/materials/:id', authenticate, async (req, res) => {
  const org = await getUserOrg(req.userId);
  const allowed = ['title','description','material_type','file_url','thumbnail_url','requires_lead','position','category','card_id'];
  const fields = []; const params = []; let i = 1;
  for (const k of allowed) {
    if (k in req.body) {
      fields.push(`${k} = $${i++}`);
      params.push(k === 'category' ? ((req.body[k] || '').toString().trim() || null) : req.body[k]);
    }
  }
  if (!fields.length) return res.json({ ok: true });
  fields.push(`updated_at = NOW()`);
  params.push(req.params.id, org.organization_id);
  const r = await query(
    `UPDATE nfc_materials SET ${fields.join(', ')} WHERE id = $${i++} AND organization_id = $${i} RETURNING *`,
    params
  );
  if (!r.rows[0]) return res.status(404).json({ error: 'Material não encontrado' });
  res.json(r.rows[0]);
});

router.delete('/materials/:id', authenticate, async (req, res) => {
  const org = await getUserOrg(req.userId);
  await query('DELETE FROM nfc_materials WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
  res.json({ ok: true });
});

// ===========================================
// VISUAL CATEGORIES (org-level)
// ===========================================
router.get('/categories', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    if (!org) return res.json([]);
    const r = await query(
      `SELECT * FROM nfc_categories WHERE organization_id = $1 ORDER BY position, created_at`,
      [org.organization_id]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/categories', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const { name, image_url, position } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const r = await query(
      `INSERT INTO nfc_categories (organization_id, name, image_url, position)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organization_id, name) DO UPDATE SET
         image_url = EXCLUDED.image_url, position = EXCLUDED.position, updated_at = NOW()
       RETURNING *`,
      [org.organization_id, String(name).trim(), image_url || null, position || 0]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: e.message }); }
});

router.patch('/categories/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    const { name, image_url, position } = req.body || {};
    const fields = []; const params = []; let i = 1;
    if (name !== undefined) { fields.push(`name = $${i++}`); params.push(String(name).trim()); }
    if (image_url !== undefined) { fields.push(`image_url = $${i++}`); params.push(image_url); }
    if (position !== undefined) { fields.push(`position = $${i++}`); params.push(position); }
    if (!fields.length) return res.json({ ok: true });
    fields.push(`updated_at = NOW()`);
    params.push(req.params.id, org.organization_id);
    const r = await query(
      `UPDATE nfc_categories SET ${fields.join(', ')} WHERE id = $${i++} AND organization_id = $${i} RETURNING *`,
      params
    );
    res.json(r.rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/categories/:id', authenticate, async (req, res) => {
  try {
    const org = await getUserOrg(req.userId);
    await query('DELETE FROM nfc_categories WHERE id = $1 AND organization_id = $2', [req.params.id, org.organization_id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ===========================================
// PUBLIC ROUTES (no auth)
// ===========================================

router.get('/public/:slug', async (req, res) => {
  try {
    const c = await query(
      `SELECT c.id, c.public_slug, c.public_url, c.qr_code_url, c.plan, c.status,
              u.name AS user_name
       FROM nfc_cards c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.public_slug = $1`,
      [req.params.slug]
    );
    if (!c.rows[0]) return res.status(404).json({ error: 'Cartão não encontrado' });
    const card = c.rows[0];
    const p = await query('SELECT * FROM nfc_card_profiles WHERE card_id = $1', [card.id]);
    const m = await query(
      `SELECT id, title, description, material_type, file_url, thumbnail_url, requires_lead, category, position
       FROM nfc_materials WHERE card_id = $1 OR (card_id IS NULL AND organization_id = (SELECT organization_id FROM nfc_cards WHERE id = $1))
       ORDER BY category NULLS LAST, position, created_at`,
      [card.id]
    );

    // Org-level NFC branding (logo + colors) from system_settings
    const brandRows = await query(
      `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
      [['nfc_default_logo','nfc_primary_color','nfc_accent_color','nfc_bg_color','nfc_bg_gradient','nfc_brand_name','nfc_footer_text']]
    );
    const branding = {};
    brandRows.rows.forEach(r => branding[r.key] = r.value);
    const orgLogo = branding.nfc_default_logo || null;

    // Register read (async, do not block response)
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
    const ua = req.headers['user-agent'] || '';
    const { device, browser, os } = parseUA(ua);
    const utm = req.query || {};
    (async () => {
      try {
        const geo = await geoFromIP(ip);
        await query(
          `INSERT INTO nfc_reads
            (card_id, ip, city, state, country, device, browser, os,
             utm_source, utm_medium, utm_campaign, utm_term, utm_content, referrer, user_agent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            card.id, ip, geo.city, geo.state, geo.country, device, browser, os,
            utm.utm_source || null, utm.utm_medium || null, utm.utm_campaign || null,
            utm.utm_term || null, utm.utm_content || null,
            req.headers.referer || null, ua,
          ]
        );
      } catch (err) { console.error('Read log error', err.message); }
    })();

    res.json({ card, profile: p.rows[0] || null, materials: m.rows, org_logo: orgLogo, branding });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

router.get('/public/:slug/vcard', async (req, res) => {
  try {
    const c = await query(
      `SELECT c.id FROM nfc_cards c WHERE c.public_slug = $1`, [req.params.slug]
    );
    if (!c.rows[0]) return res.status(404).send('Not found');
    const p = await query('SELECT * FROM nfc_card_profiles WHERE card_id = $1', [c.rows[0].id]);
    const profile = p.rows[0] || {};
    const vcf = buildVCard(profile);
    const filename = (profile.display_name || 'contato').replace(/[^a-z0-9]+/gi, '_') + '.vcf';
    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(vcf);
  } catch (e) {
    console.error(e); res.status(500).send('error');
  }
});

router.post('/public/:slug/lead', async (req, res) => {
  try {
    const c = await query(
      `SELECT id, organization_id, user_id FROM nfc_cards WHERE public_slug = $1`,
      [req.params.slug]
    );
    if (!c.rows[0]) return res.status(404).json({ error: 'not found' });
    const card = c.rows[0];
    const { material_id, name, whatsapp, email, company, role_title, utm_source, utm_medium, utm_campaign } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });

    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();
    await query(
      `INSERT INTO nfc_leads
       (card_id, material_id, organization_id, user_id, name, whatsapp, email, company, role_title,
        utm_source, utm_medium, utm_campaign, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [card.id, material_id || null, card.organization_id, card.user_id, name,
        whatsapp || null, email || null, company || null, role_title || null,
        utm_source || null, utm_medium || null, utm_campaign || null, ip]
    );

    let file_url = null;
    if (material_id) {
      const m = await query('SELECT file_url FROM nfc_materials WHERE id = $1', [material_id]);
      file_url = m.rows[0]?.file_url || null;
    }
    res.json({ ok: true, file_url });
  } catch (e) {
    console.error(e); res.status(500).json({ error: e.message });
  }
});

// Normalize Brazilian phone to E.164 digits (5511987654321)
function normalizeBR(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d;
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

// Find a connected WAPI instance for an org (for number validation)
async function getOrgWapi(organizationId) {
  const r = await query(
    `SELECT instance_id, wapi_token FROM connections
     WHERE organization_id = $1 AND provider = 'wapi'
       AND instance_id IS NOT NULL AND wapi_token IS NOT NULL
       AND status = 'connected'
     ORDER BY updated_at DESC LIMIT 1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

// Validate WhatsApp number (no auth)
router.post('/public/:slug/verify-whatsapp', async (req, res) => {
  try {
    const phone = normalizeBR(req.body?.whatsapp);
    if (!phone) return res.status(400).json({ valid: false, error: 'Número inválido' });

    const c = await query(
      'SELECT organization_id FROM nfc_cards WHERE public_slug = $1',
      [req.params.slug]
    );
    if (!c.rows[0]) return res.status(404).json({ valid: false, error: 'Cartão não encontrado' });

    const wapi = await getOrgWapi(c.rows[0].organization_id);
    if (!wapi) {
      // Fallback: accept format-valid numbers if no W-API connected
      return res.json({ valid: true, fallback: true });
    }

    const ok = await wapiCheckNumber(wapi.instance_id, wapi.wapi_token, phone);
    if (!ok) return res.status(400).json({ valid: false, error: 'Esse número não está no WhatsApp' });
    res.json({ valid: true, phone });
  } catch (e) {
    console.error('verify-whatsapp error', e);
    res.status(500).json({ valid: false, error: e.message });
  }
});

// Catalog lead: stores in nfc_leads AND crm_prospects, then returns materials
router.post('/public/:slug/catalog-lead', async (req, res) => {
  try {
    const c = await query(
      `SELECT id, organization_id, user_id, public_slug
         FROM nfc_cards WHERE public_slug = $1`,
      [req.params.slug]
    );
    if (!c.rows[0]) return res.status(404).json({ error: 'Cartão não encontrado' });
    const card = c.rows[0];

    const { name, whatsapp, email, company } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const phone = normalizeBR(whatsapp);
    if (!phone) return res.status(400).json({ error: 'WhatsApp inválido' });

    // Re-validate phone (defense in depth)
    const wapi = await getOrgWapi(card.organization_id);
    if (wapi) {
      const ok = await wapiCheckNumber(wapi.instance_id, wapi.wapi_token, phone);
      if (!ok) return res.status(400).json({ error: 'WhatsApp não verificado' });
    }

    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '').trim();

    // Save NFC lead
    await query(
      `INSERT INTO nfc_leads
       (card_id, organization_id, user_id, name, whatsapp, email, company, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [card.id, card.organization_id, card.user_id, name, phone, email || null, company || null, ip]
    );

    // Upsert as CRM prospect (source identifies origin + seller)
    const sellerSuffix = card.user_id ? '' : '';
    const source = `NFC: ${card.public_slug}`;
    try {
      await query(
        `INSERT INTO crm_prospects
           (organization_id, name, phone, email, source, assigned_to, created_by, custom_fields)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7)
         ON CONFLICT (organization_id, phone) DO UPDATE SET
           name = COALESCE(NULLIF(EXCLUDED.name,''), crm_prospects.name),
           email = COALESCE(EXCLUDED.email, crm_prospects.email),
           source = EXCLUDED.source,
           assigned_to = COALESCE(crm_prospects.assigned_to, EXCLUDED.assigned_to),
           updated_at = NOW()`,
        [
          card.organization_id, name, phone, email || null, source,
          card.user_id || null,
          JSON.stringify({ nfc_card_id: card.id, nfc_slug: card.public_slug, company: company || null }),
        ]
      );
    } catch (err) {
      console.error('NFC->prospect insert failed:', err.message);
    }

    // Return all materials available for this card
    const m = await query(
      `SELECT id, title, description, material_type, file_url, thumbnail_url, category
         FROM nfc_materials
        WHERE card_id = $1
           OR (card_id IS NULL AND organization_id = $2)
        ORDER BY category NULLS LAST, position, created_at`,
      [card.id, card.organization_id]
    );

    res.json({ ok: true, materials: m.rows });
  } catch (e) {
    console.error('catalog-lead error', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
