import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sendMessage as sendWhatsapp } from '../lib/whatsapp-provider.js';

const router = Router();

const SECRET = () => process.env.JWT_SECRET || 'dev-secret';

// =========================================================================
// STUDENT AUTH (separate from internal users)
// =========================================================================
function signStudent(student) {
  return jwt.sign(
    { studentId: student.id, email: student.email, type: 'ead_student' },
    SECRET(),
    { expiresIn: '30d' }
  );
}

function studentAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const d = jwt.verify(h.slice(7), SECRET());
    if (d.type !== 'ead_student') return res.status(401).json({ error: 'Token inválido' });
    req.studentId = d.studentId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// CPF validator
function isValidCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}

router.post('/auth/register', async (req, res) => {
  try {
    let { cpf, name, email, password, company, city, state } = req.body || {};
    cpf = String(cpf || '').replace(/\D/g, '');
    email = String(email || '').trim().toLowerCase();
    name = String(name || '').trim();
    if (!cpf || !name || !email || !password) return res.status(400).json({ error: 'Preencha CPF, nome, email e senha' });
    if (!isValidCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });

    const dup = await query('SELECT id FROM ead_students WHERE cpf = $1 OR lower(email) = $2 LIMIT 1', [cpf, email]);
    if (dup.rows.length) return res.status(400).json({ error: 'CPF ou email já cadastrados' });

    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `INSERT INTO ead_students (cpf, name, email, password_hash, company, city, state)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, cpf, name, email, company, city, state, created_at`,
      [cpf, name, email, hash, company || null, city || null, state || null]
    );
    const student = r.rows[0];
    res.status(201).json({ student, token: signStudent(student) });
  } catch (e) {
    console.error('ead register error', e);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = String(email || '').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ error: 'Email e senha obrigatórios' });
    const r = await query('SELECT * FROM ead_students WHERE lower(email) = $1 LIMIT 1', [email]);
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });
    const s = r.rows[0];
    const ok = await bcrypt.compare(password, s.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (s.status === 'pending') return res.status(403).json({ error: 'Seu cadastro está em análise. Você receberá um aviso por WhatsApp/e-mail quando for liberado.', status: 'pending' });
    if (s.status === 'rejected') return res.status(403).json({ error: 'Cadastro não aprovado. Entre em contato com o administrador.', status: 'rejected' });
    const { password_hash, ...student } = s;
    res.json({ student, token: signStudent(s) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.get('/auth/me', studentAuth, async (req, res) => {
  const r = await query(
    `SELECT s.id, s.cpf, s.name, s.email, s.company, s.city, s.state, s.phone, s.status, s.created_at,
            b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name, b.logo_url AS brand_logo, b.primary_color AS brand_primary, b.accent_color AS brand_accent
     FROM ead_students s LEFT JOIN ead_brands b ON b.id = s.brand_id WHERE s.id = $1`, [req.studentId]);
  if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ student: r.rows[0] });
});

// =========================================================================
// PUBLIC BRAND ENDPOINTS (per-brand signup link)
// =========================================================================
router.get('/brand/:slug', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, slug, name, logo_url, cover_url, primary_color, accent_color,
              welcome_title, welcome_text, signup_fields, active
       FROM ead_brands WHERE slug = $1 LIMIT 1`, [req.params.slug]);
    if (!r.rows.length || !r.rows[0].active) return res.status(404).json({ error: 'Marca não encontrada' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/brand/:slug/signup', async (req, res) => {
  try {
    const b = await query('SELECT * FROM ead_brands WHERE slug = $1 AND active = true LIMIT 1', [req.params.slug]);
    if (!b.rows.length) return res.status(404).json({ error: 'Marca não encontrada' });
    const brand = b.rows[0];
    const fields = Array.isArray(brand.signup_fields) ? brand.signup_fields : [];
    const body = req.body || {};

    // collect standard + extra
    let cpf = String(body.cpf || '').replace(/\D/g, '');
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const phone = String(body.phone || '').replace(/\D/g, '') || null;
    const company = body.company || null;
    const city = body.city || null;
    const state = body.state || null;

    // basic validation against brand-declared required fields
    const known = new Set(['name','cpf','email','password','phone','company','city','state']);
    const extra = {};
    for (const f of fields) {
      const val = body[f.key];
      if (f.required && (val === undefined || val === null || String(val).trim() === '')) {
        return res.status(400).json({ error: `Campo obrigatório: ${f.label || f.key}` });
      }
      if (!known.has(f.key) && val !== undefined) extra[f.key] = val;
    }

    if (!cpf || !name || !email || !password) return res.status(400).json({ error: 'Preencha nome, CPF, e-mail e senha' });
    if (!isValidCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });

    const dup = await query('SELECT id, status FROM ead_students WHERE cpf = $1 OR lower(email) = $2 LIMIT 1', [cpf, email]);
    if (dup.rows.length) {
      const s = dup.rows[0];
      if (s.status === 'pending') return res.status(400).json({ error: 'Já existe um cadastro pendente com este CPF/e-mail.' });
      return res.status(400).json({ error: 'CPF ou e-mail já cadastrados' });
    }

    const hash = await bcrypt.hash(password, 10);
    const r = await query(
      `INSERT INTO ead_students (cpf, name, email, password_hash, company, city, state, phone, brand_id, status, extra_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10)
       RETURNING id, name, email`,
      [cpf, name, email, hash, company, city, state, phone, brand.id, JSON.stringify(extra)]
    );
    res.status(201).json({ ok: true, student: r.rows[0], message: 'Cadastro enviado! Você receberá um aviso por WhatsApp/e-mail assim que for aprovado.' });
  } catch (e) {
    console.error('brand signup error', e);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

// =========================================================================
// PUBLIC / STUDENT: courses, lessons, quiz
// =========================================================================
router.get('/courses', async (req, res) => {
  try {
    const r = await query(
      `SELECT c.id, c.title, c.description, c.cover_url, c.created_at,
              (SELECT COUNT(*)::int FROM ead_lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM ead_quiz_questions q WHERE q.course_id = c.id) AS question_count
       FROM ead_courses c WHERE c.published = true ORDER BY c.created_at DESC`
    );
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

router.get('/courses/:id', studentAuth, async (req, res) => {
  try {
    const c = await query('SELECT * FROM ead_courses WHERE id = $1', [req.params.id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Curso não encontrado' });
    const modules = await query('SELECT id, title, description, order_index FROM ead_modules WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    const lessons = await query('SELECT id, module_id, title, youtube_url, description, order_index FROM ead_lessons WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    const manuals = await query('SELECT id, title, description, cover_url, file_url, order_index FROM ead_manuals WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    const enr = await query('SELECT status, approved_at FROM ead_enrollments WHERE student_id = $1 AND course_id = $2', [req.studentId, req.params.id]);
    const cert = await query('SELECT id, pdf_url, issued_at FROM ead_certificates WHERE student_id = $1 AND course_id = $2', [req.studentId, req.params.id]);
    res.json({ course: c.rows[0], modules: modules.rows, lessons: lessons.rows, manuals: manuals.rows, enrollment: enr.rows[0] || null, certificate: cert.rows[0] || null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

router.get('/courses/:id/quiz', studentAuth, async (req, res) => {
  try {
    // ensure not yet approved
    const cert = await query('SELECT id FROM ead_certificates WHERE student_id = $1 AND course_id = $2', [req.studentId, req.params.id]);
    if (cert.rows.length) return res.status(403).json({ error: 'Você já foi aprovado neste curso' });

    const qs = await query('SELECT id, question, order_index FROM ead_quiz_questions WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    if (!qs.rows.length) return res.json({ questions: [] });
    const opts = await query(
      `SELECT id, question_id, text FROM ead_quiz_options WHERE question_id = ANY($1::uuid[]) ORDER BY created_at`,
      [qs.rows.map(q => q.id)]
    );
    const byQ = {};
    for (const o of opts.rows) (byQ[o.question_id] ||= []).push({ id: o.id, text: o.text });
    res.json({ questions: qs.rows.map(q => ({ ...q, options: byQ[q.id] || [] })) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

router.post('/courses/:id/attempt', studentAuth, async (req, res) => {
  try {
    const courseId = req.params.id;
    const { answers } = req.body || {}; // { questionId: optionId }
    if (!answers || typeof answers !== 'object') return res.status(400).json({ error: 'Respostas inválidas' });

    const certDup = await query('SELECT id FROM ead_certificates WHERE student_id = $1 AND course_id = $2', [req.studentId, courseId]);
    if (certDup.rows.length) return res.status(403).json({ error: 'Já aprovado' });

    const qs = await query('SELECT id FROM ead_quiz_questions WHERE course_id = $1', [courseId]);
    if (!qs.rows.length) return res.status(400).json({ error: 'Curso sem perguntas' });
    const correctOpts = await query(
      `SELECT question_id, id FROM ead_quiz_options WHERE question_id = ANY($1::uuid[]) AND is_correct = true`,
      [qs.rows.map(q => q.id)]
    );
    const correctMap = {};
    for (const r of correctOpts.rows) correctMap[r.question_id] = r.id;

    let correct = 0;
    const review = [];
    for (const q of qs.rows) {
      const picked = answers[q.id];
      const ok = picked && picked === correctMap[q.id];
      if (ok) correct++;
      review.push({ question_id: q.id, picked, correct_option: correctMap[q.id], ok: !!ok });
    }
    const total = qs.rows.length;
    const score = total ? (correct / total) * 100 : 0;
    // load passing threshold and certificate toggle
    const cfg = await query('SELECT COALESCE(passing_score,100) AS passing_score, COALESCE(has_certificate,true) AS has_certificate FROM ead_courses WHERE id=$1', [courseId]);
    const passingScore = Number(cfg.rows[0]?.passing_score ?? 100);
    const hasCert = !!cfg.rows[0]?.has_certificate;
    const passed = score >= passingScore;

    await query(
      `INSERT INTO ead_attempts (student_id, course_id, score, total, correct, passed, answers)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.studentId, courseId, score, total, correct, passed, JSON.stringify(answers)]
    );

    // upsert enrollment
    await query(
      `INSERT INTO ead_enrollments (student_id, course_id, status, approved_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (student_id, course_id) DO UPDATE SET
         status = EXCLUDED.status,
         approved_at = COALESCE(ead_enrollments.approved_at, EXCLUDED.approved_at)`,
      [req.studentId, courseId, passed ? 'approved' : 'in_progress', passed ? new Date() : null]
    );

    let certificate = null;
    if (passed && hasCert) {
      certificate = await generateCertificate(req.studentId, courseId);
    }

    res.json({ score, correct, total, passed, passing_score: passingScore, has_certificate: hasCert, review, certificate });
  } catch (e) {
    console.error('attempt error', e);
    res.status(500).json({ error: 'Erro ao corrigir prova' });
  }
});

router.get('/my/certificates', studentAuth, async (req, res) => {
  const r = await query(
    `SELECT c.id, c.pdf_url, c.issued_at, co.title as course_title
     FROM ead_certificates c JOIN ead_courses co ON co.id = c.course_id
     WHERE c.student_id = $1 ORDER BY c.issued_at DESC`,
    [req.studentId]
  );
  res.json(r.rows);
});

// =========================================================================
// CERTIFICATE GENERATION (PDF from PNG template + fields)
// =========================================================================
async function generateCertificate(studentId, courseId) {
  const s = await query('SELECT name, cpf, company, city, state FROM ead_students WHERE id = $1', [studentId]);
  const c = await query('SELECT title FROM ead_courses WHERE id = $1', [courseId]);
  const t = await query('SELECT image_url, width, height, fields FROM ead_certificate_templates WHERE course_id = $1', [courseId]);
  if (!s.rows.length || !c.rows.length) throw new Error('Dados ausentes');

  const student = s.rows[0];
  const course = c.rows[0];
  const tpl = t.rows[0];

  const data = {
    nome: student.name,
    cpf: student.cpf,
    empresa: student.company || '',
    curso: course.title,
    cidade_estado: [student.city, student.state].filter(Boolean).join(' / '),
    data_conclusao: new Date().toLocaleDateString('pt-BR'),
  };

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page;
  let pageW = 842, pageH = 595; // A4 landscape

  if (tpl?.image_url) {
    try {
      const imgPath = tpl.image_url.startsWith('http')
        ? null
        : path.join(process.cwd(), tpl.image_url.replace(/^\/uploads\//, 'uploads/'));
      let bytes;
      if (imgPath && fs.existsSync(imgPath)) {
        bytes = fs.readFileSync(imgPath);
      } else {
        // try fetch
        const r = await fetch(tpl.image_url);
        bytes = Buffer.from(await r.arrayBuffer());
      }
      let img;
      try { img = await pdfDoc.embedPng(bytes); } catch { img = await pdfDoc.embedJpg(bytes); }
      pageW = img.width; pageH = img.height;
      page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(img, { x: 0, y: 0, width: pageW, height: pageH });
    } catch (e) {
      console.error('template image error', e);
      page = pdfDoc.addPage([pageW, pageH]);
    }
  } else {
    page = pdfDoc.addPage([pageW, pageH]);
    page.drawText('CERTIFICADO', { x: pageW / 2 - 100, y: pageH - 100, size: 32, font });
  }

  const fields = Array.isArray(tpl?.fields) ? tpl.fields : [];
  for (const f of fields) {
    const text = String(data[f.key] ?? '');
    if (!text) continue;
    const size = f.fontSize || 24;
    const color = hexToRgb(f.color || '#111111');
    // f.x, f.y are in image pixel coords from top-left; pdf-lib uses bottom-left
    const x = Number(f.x) || 0;
    const yFromTop = Number(f.y) || 0;
    const y = pageH - yFromTop - size;
    page.drawText(text, { x, y, size, font, color: rgb(color.r, color.g, color.b) });
  }

  const pdfBytes = await pdfDoc.save();

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `cert-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
  fs.writeFileSync(path.join(uploadsDir, filename), pdfBytes);
  const baseUrl = process.env.API_BASE_URL || '';
  const pdfUrl = `${baseUrl}/uploads/${filename}`;

  const ins = await query(
    `INSERT INTO ead_certificates (student_id, course_id, pdf_url)
     VALUES ($1,$2,$3)
     ON CONFLICT (student_id, course_id) DO UPDATE SET pdf_url = EXCLUDED.pdf_url, issued_at = NOW()
     RETURNING id, pdf_url, issued_at`,
    [studentId, courseId, pdfUrl]
  );
  return ins.rows[0];
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

// =========================================================================
// ADMIN ENDPOINTS (internal users)
// =========================================================================
const admin = Router();
admin.use(authenticate);

async function hasPerm(userId, key) {
  const u = await query('SELECT is_superadmin FROM users WHERE id = $1', [userId]);
  if (u.rows[0]?.is_superadmin) return true;
  const m = await query(
    `SELECT om.role FROM organization_members om WHERE om.user_id = $1 LIMIT 1`,
    [userId]
  );
  const role = m.rows[0]?.role;
  if (['owner', 'admin'].includes(role)) return true;
  try {
    const p = await query(`SELECT ${key} as v FROM user_permissions WHERE user_id = $1 LIMIT 1`, [userId]);
    return !!p.rows[0]?.v;
  } catch { return false; }
}

function gate(key) {
  return async (req, res, next) => {
    const ok = await hasPerm(req.userId, key);
    if (!ok) return res.status(403).json({ error: 'Sem permissão' });
    next();
  };
}

// Courses
admin.get('/courses', gate('can_view_ead'), async (req, res) => {
  const r = await query(
    `SELECT c.*,
       (SELECT COUNT(*)::int FROM ead_lessons l WHERE l.course_id = c.id) AS lesson_count,
       (SELECT COUNT(*)::int FROM ead_manuals m WHERE m.course_id = c.id) AS manual_count,
       (SELECT COUNT(*)::int FROM ead_quiz_questions q WHERE q.course_id = c.id) AS question_count,
       (SELECT COUNT(*)::int FROM ead_certificates ce WHERE ce.course_id = c.id) AS certificate_count
     FROM ead_courses c ORDER BY c.created_at DESC`
  );
  res.json(r.rows);
});

admin.post('/courses', gate('can_manage_ead'), async (req, res) => {
  const { title, description, cover_url, published, has_certificate, passing_score } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const r = await query(
    `INSERT INTO ead_courses (title, description, cover_url, published, has_certificate, passing_score, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [title, description || null, cover_url || null, !!published,
     typeof has_certificate === 'boolean' ? has_certificate : true,
     Number.isFinite(+passing_score) ? +passing_score : 100,
     req.userId]
  );
  res.status(201).json(r.rows[0]);
});

admin.patch('/courses/:id', gate('can_manage_ead'), async (req, res) => {
  const { title, description, cover_url, published, has_certificate, passing_score } = req.body || {};
  const r = await query(
    `UPDATE ead_courses SET
       title = COALESCE($1,title),
       description = COALESCE($2,description),
       cover_url = COALESCE($3,cover_url),
       published = COALESCE($4,published),
       has_certificate = COALESCE($5,has_certificate),
       passing_score = COALESCE($6,passing_score),
       updated_at = NOW()
     WHERE id = $7 RETURNING *`,
    [title ?? null, description ?? null, cover_url ?? null,
     typeof published === 'boolean' ? published : null,
     typeof has_certificate === 'boolean' ? has_certificate : null,
     Number.isFinite(+passing_score) ? +passing_score : null,
     req.params.id]
  );
  res.json(r.rows[0]);
});

admin.delete('/courses/:id', gate('can_manage_ead'), async (req, res) => {
  await query('DELETE FROM ead_courses WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Modules
admin.get('/courses/:id/modules', gate('can_view_ead'), async (req, res) => {
  const r = await query('SELECT * FROM ead_modules WHERE course_id=$1 ORDER BY order_index, created_at', [req.params.id]);
  res.json(r.rows);
});
admin.post('/courses/:id/modules', gate('can_manage_ead'), async (req, res) => {
  const { title, description, order_index } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const r = await query(
    `INSERT INTO ead_modules (course_id, title, description, order_index) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.params.id, title, description || null, order_index || 0]
  );
  res.status(201).json(r.rows[0]);
});
admin.patch('/modules/:id', gate('can_manage_ead'), async (req, res) => {
  const { title, description, order_index } = req.body || {};
  const r = await query(
    `UPDATE ead_modules SET title=COALESCE($1,title), description=COALESCE($2,description), order_index=COALESCE($3,order_index) WHERE id=$4 RETURNING *`,
    [title ?? null, description ?? null, order_index ?? null, req.params.id]
  );
  res.json(r.rows[0]);
});
admin.delete('/modules/:id', gate('can_manage_ead'), async (req, res) => {
  await query('DELETE FROM ead_modules WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

// Lessons
admin.get('/courses/:id/lessons', gate('can_view_ead'), async (req, res) => {
  const r = await query('SELECT * FROM ead_lessons WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
  res.json(r.rows);
});
admin.post('/courses/:id/lessons', gate('can_manage_ead'), async (req, res) => {
  const { title, youtube_url, order_index, module_id, description } = req.body || {};
  if (!title || !youtube_url) return res.status(400).json({ error: 'Título e URL obrigatórios' });
  const r = await query(
    `INSERT INTO ead_lessons (course_id, module_id, title, youtube_url, description, order_index) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, module_id || null, title, youtube_url, description || null, order_index || 0]
  );
  res.status(201).json(r.rows[0]);
});
admin.patch('/lessons/:id', gate('can_manage_ead'), async (req, res) => {
  const { title, youtube_url, order_index, module_id, description } = req.body || {};
  const r = await query(
    `UPDATE ead_lessons SET title=COALESCE($1,title), youtube_url=COALESCE($2,youtube_url), order_index=COALESCE($3,order_index),
       module_id=$4, description=COALESCE($5,description) WHERE id=$6 RETURNING *`,
    [title ?? null, youtube_url ?? null, order_index ?? null, module_id ?? null, description ?? null, req.params.id]
  );
  res.json(r.rows[0]);
});
admin.delete('/lessons/:id', gate('can_manage_ead'), async (req, res) => {
  await query('DELETE FROM ead_lessons WHERE id=$1', [req.params.id]); res.json({ ok: true });
});

// Manuals
admin.get('/courses/:id/manuals', gate('can_view_ead'), async (req, res) => {
  const r = await query('SELECT * FROM ead_manuals WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
  res.json(r.rows);
});
admin.post('/courses/:id/manuals', gate('can_manage_ead'), async (req, res) => {
  const { title, description, cover_url, file_url, order_index } = req.body || {};
  if (!title || !file_url) return res.status(400).json({ error: 'Título e arquivo do manual são obrigatórios' });
  const r = await query(
    `INSERT INTO ead_manuals (course_id, title, description, cover_url, file_url, order_index)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.id, title, description || null, cover_url || null, file_url, order_index || 0]
  );
  res.status(201).json(r.rows[0]);
});
admin.patch('/manuals/:id', gate('can_manage_ead'), async (req, res) => {
  const { title, description, cover_url, file_url, order_index } = req.body || {};
  const r = await query(
    `UPDATE ead_manuals SET
       title=COALESCE($1,title), description=COALESCE($2,description), cover_url=COALESCE($3,cover_url),
       file_url=COALESCE($4,file_url), order_index=COALESCE($5,order_index)
     WHERE id=$6 RETURNING *`,
    [title ?? null, description ?? null, cover_url ?? null, file_url ?? null, order_index ?? null, req.params.id]
  );
  res.json(r.rows[0]);
});
admin.delete('/manuals/:id', gate('can_manage_ead'), async (req, res) => {
  await query('DELETE FROM ead_manuals WHERE id=$1', [req.params.id]); res.json({ ok: true });
});

// Quiz
admin.get('/courses/:id/questions', gate('can_view_ead'), async (req, res) => {
  const qs = await query('SELECT * FROM ead_quiz_questions WHERE course_id=$1 ORDER BY order_index, created_at', [req.params.id]);
  const opts = qs.rows.length
    ? (await query('SELECT * FROM ead_quiz_options WHERE question_id = ANY($1::uuid[]) ORDER BY created_at', [qs.rows.map(q => q.id)])).rows
    : [];
  const byQ = {};
  for (const o of opts) (byQ[o.question_id] ||= []).push(o);
  res.json(qs.rows.map(q => ({ ...q, options: byQ[q.id] || [] })));
});

admin.post('/courses/:id/questions', gate('can_manage_ead'), async (req, res) => {
  const { question, order_index, options } = req.body || {};
  if (!question || !Array.isArray(options) || options.length < 2) return res.status(400).json({ error: 'Pergunta e ao menos 2 alternativas' });
  if (!options.some(o => o.is_correct)) return res.status(400).json({ error: 'Marque a alternativa correta' });
  const q = await query(
    `INSERT INTO ead_quiz_questions (course_id, question, order_index) VALUES ($1,$2,$3) RETURNING *`,
    [req.params.id, question, order_index || 0]
  );
  for (const o of options) {
    await query(`INSERT INTO ead_quiz_options (question_id, text, is_correct) VALUES ($1,$2,$3)`, [q.rows[0].id, o.text, !!o.is_correct]);
  }
  res.status(201).json(q.rows[0]);
});

admin.patch('/questions/:id', gate('can_manage_ead'), async (req, res) => {
  const { question, order_index, options } = req.body || {};
  await query('UPDATE ead_quiz_questions SET question=COALESCE($1,question), order_index=COALESCE($2,order_index) WHERE id=$3',
    [question ?? null, order_index ?? null, req.params.id]);
  if (Array.isArray(options)) {
    await query('DELETE FROM ead_quiz_options WHERE question_id=$1', [req.params.id]);
    for (const o of options) {
      await query('INSERT INTO ead_quiz_options (question_id, text, is_correct) VALUES ($1,$2,$3)', [req.params.id, o.text, !!o.is_correct]);
    }
  }
  res.json({ ok: true });
});

admin.delete('/questions/:id', gate('can_manage_ead'), async (req, res) => {
  await query('DELETE FROM ead_quiz_questions WHERE id=$1', [req.params.id]); res.json({ ok: true });
});

// Template
admin.get('/courses/:id/template', gate('can_view_ead'), async (req, res) => {
  const r = await query('SELECT * FROM ead_certificate_templates WHERE course_id=$1', [req.params.id]);
  res.json(r.rows[0] || null);
});
admin.put('/courses/:id/template', gate('can_manage_ead'), async (req, res) => {
  const { image_url, width, height, fields } = req.body || {};
  const r = await query(
    `INSERT INTO ead_certificate_templates (course_id, image_url, width, height, fields)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (course_id) DO UPDATE SET image_url=EXCLUDED.image_url, width=EXCLUDED.width, height=EXCLUDED.height, fields=EXCLUDED.fields, updated_at=NOW()
     RETURNING *`,
    [req.params.id, image_url || null, width || null, height || null, JSON.stringify(fields || [])]
  );
  res.json(r.rows[0]);
});

// Preview certificate (admin)
admin.post('/courses/:id/template/preview', gate('can_manage_ead'), async (req, res) => {
  try {
    // create a fake student for preview
    const fake = await query(
      `SELECT id FROM ead_students WHERE email = 'preview@ead.local' LIMIT 1`
    );
    let studentId;
    if (fake.rows.length) studentId = fake.rows[0].id;
    else {
      const ins = await query(
        `INSERT INTO ead_students (cpf, name, email, password_hash, company, city, state)
         VALUES ('00000000000','Aluno Exemplo','preview@ead.local','x','Empresa Exemplo','Cidade','UF') RETURNING id`
      );
      studentId = ins.rows[0].id;
    }
    const cert = await generateCertificate(studentId, req.params.id);
    // delete the preview certificate row so it doesn't pollute lists
    await query('DELETE FROM ead_certificates WHERE student_id = $1 AND course_id = $2', [studentId, req.params.id]);
    res.json(cert);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao gerar preview' }); }
});

// Students list
admin.get('/students', gate('can_view_ead'), async (req, res) => {
  const r = await query(
    `SELECT s.id, s.name, s.cpf, s.email, s.company, s.city, s.state, s.created_at,
       (SELECT COUNT(*)::int FROM ead_certificates c WHERE c.student_id = s.id) AS certificate_count,
       (SELECT COUNT(*)::int FROM ead_enrollments e WHERE e.student_id = s.id) AS enrollment_count
     FROM ead_students s WHERE s.email <> 'preview@ead.local' ORDER BY s.created_at DESC`
  );
  res.json(r.rows);
});

admin.get('/students/:id', gate('can_view_ead'), async (req, res) => {
  const s = await query(`SELECT id, name, cpf, email, company, city, state, created_at FROM ead_students WHERE id=$1`, [req.params.id]);
  if (!s.rows.length) return res.status(404).json({ error: 'Não encontrado' });
  const certs = await query(
    `SELECT c.id, c.pdf_url, c.issued_at, co.title as course_title
     FROM ead_certificates c JOIN ead_courses co ON co.id=c.course_id
     WHERE c.student_id=$1 ORDER BY c.issued_at DESC`, [req.params.id]
  );
  const attempts = await query(
    `SELECT a.id, a.score, a.correct, a.total, a.passed, a.created_at, co.title as course_title
     FROM ead_attempts a JOIN ead_courses co ON co.id=a.course_id
     WHERE a.student_id=$1 ORDER BY a.created_at DESC LIMIT 50`, [req.params.id]
  );
  res.json({ student: s.rows[0], certificates: certs.rows, attempts: attempts.rows });
});

// All certificates
admin.get('/certificates', gate('can_view_ead'), async (req, res) => {
  const r = await query(
    `SELECT c.id, c.pdf_url, c.issued_at,
       s.id as student_id, s.name as student_name, s.cpf, s.email, s.company, s.city, s.state,
       co.id as course_id, co.title as course_title
     FROM ead_certificates c
     JOIN ead_students s ON s.id=c.student_id
     JOIN ead_courses co ON co.id=c.course_id
     WHERE s.email <> 'preview@ead.local'
     ORDER BY c.issued_at DESC`
  );
  res.json(r.rows);
});

// =========================================================================
// ADMIN: BRANDS (marcas / programas)
// =========================================================================
async function getAdminOrgId(userId) {
  const r = await query(
    `SELECT om.organization_id FROM organization_members om WHERE om.user_id = $1 ORDER BY om.created_at LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.organization_id || null;
}

admin.get('/brands', gate('can_view_ead'), async (req, res) => {
  const r = await query(
    `SELECT b.*, c.instance_name AS connection_name,
       (SELECT COUNT(*)::int FROM ead_students s WHERE s.brand_id = b.id) AS total_students,
       (SELECT COUNT(*)::int FROM ead_students s WHERE s.brand_id = b.id AND s.status = 'pending') AS pending_students
     FROM ead_brands b LEFT JOIN connections c ON c.id = b.notify_connection_id
     ORDER BY b.created_at DESC`
  );
  res.json(r.rows);
});

admin.post('/brands', gate('can_manage_ead'), async (req, res) => {
  try {
    const { slug, name, logo_url, cover_url, primary_color, accent_color, welcome_title, welcome_text, signup_fields, notify_connection_id, approval_message, active } = req.body || {};
    const cleanSlug = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanSlug || !name) return res.status(400).json({ error: 'Slug e nome são obrigatórios' });
    const orgId = await getAdminOrgId(req.userId);
    const r = await query(
      `INSERT INTO ead_brands (slug, name, logo_url, cover_url, primary_color, accent_color, welcome_title, welcome_text, signup_fields, organization_id, notify_connection_id, approval_message, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,COALESCE($13,true))
       RETURNING *`,
      [cleanSlug, name, logo_url || null, cover_url || null, primary_color || '#0ea5e9', accent_color || '#0284c7',
       welcome_title || null, welcome_text || null,
       signup_fields ? JSON.stringify(signup_fields) : null,
       orgId, notify_connection_id || null, approval_message || null,
       typeof active === 'boolean' ? active : null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug já em uso' });
    console.error('create brand', e); res.status(500).json({ error: 'Erro ao criar marca' });
  }
});

admin.patch('/brands/:id', gate('can_manage_ead'), async (req, res) => {
  try {
    const { slug, name, logo_url, cover_url, primary_color, accent_color, welcome_title, welcome_text, signup_fields, notify_connection_id, approval_message, active } = req.body || {};
    const cleanSlug = slug !== undefined ? String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : null;
    const r = await query(
      `UPDATE ead_brands SET
         slug = COALESCE($1, slug),
         name = COALESCE($2, name),
         logo_url = COALESCE($3, logo_url),
         cover_url = COALESCE($4, cover_url),
         primary_color = COALESCE($5, primary_color),
         accent_color = COALESCE($6, accent_color),
         welcome_title = COALESCE($7, welcome_title),
         welcome_text = COALESCE($8, welcome_text),
         signup_fields = COALESCE($9::jsonb, signup_fields),
         notify_connection_id = $10,
         approval_message = COALESCE($11, approval_message),
         active = COALESCE($12, active),
         updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [cleanSlug, name ?? null, logo_url ?? null, cover_url ?? null, primary_color ?? null, accent_color ?? null,
       welcome_title ?? null, welcome_text ?? null,
       signup_fields ? JSON.stringify(signup_fields) : null,
       notify_connection_id ?? null,
       approval_message ?? null,
       typeof active === 'boolean' ? active : null,
       req.params.id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug já em uso' });
    console.error(e); res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

admin.delete('/brands/:id', gate('can_manage_ead'), async (req, res) => {
  await query('DELETE FROM ead_brands WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Connections available for notification (current user's org)
admin.get('/brands-meta/connections', gate('can_view_ead'), async (req, res) => {
  const orgId = await getAdminOrgId(req.userId);
  if (!orgId) return res.json([]);
  const r = await query(
    `SELECT id, instance_name, provider, status FROM connections WHERE organization_id = $1 ORDER BY instance_name`,
    [orgId]
  );
  res.json(r.rows);
});

// =========================================================================
// ADMIN: STUDENT APPROVALS
// =========================================================================
admin.get('/students/pending', gate('can_view_ead'), async (req, res) => {
  const { brand_id } = req.query;
  const params = [];
  let where = "s.status = 'pending'";
  if (brand_id) { params.push(brand_id); where += ` AND s.brand_id = $${params.length}`; }
  const r = await query(
    `SELECT s.id, s.name, s.cpf, s.email, s.phone, s.company, s.city, s.state, s.extra_fields, s.created_at,
            b.id AS brand_id, b.name AS brand_name, b.slug AS brand_slug
     FROM ead_students s LEFT JOIN ead_brands b ON b.id = s.brand_id
     WHERE ${where} ORDER BY s.created_at DESC`,
    params
  );
  res.json(r.rows);
});

function appBaseUrl(req) {
  return process.env.APP_BASE_URL || process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
}

async function notifyApproval(student, brand, baseUrl) {
  const link = brand?.slug ? `${baseUrl}/ead/login` : `${baseUrl}/ead/login`;
  const tpl = brand?.approval_message || 'Olá {nome}! Seu cadastro foi aprovado. Acesse: {link}';
  const vars = { nome: student.name, marca: brand?.name || '', link, email: student.email };
  const message = tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  const result = { whatsapp: null, email: null };

  // WhatsApp
  if (brand?.notify_connection_id && student.phone) {
    try {
      const c = await query('SELECT * FROM connections WHERE id = $1', [brand.notify_connection_id]);
      if (c.rows[0]) {
        const r = await sendWhatsapp(c.rows[0], student.phone, message, 'text');
        result.whatsapp = r;
      } else result.whatsapp = { success: false, error: 'Conexão não encontrada' };
    } catch (e) { result.whatsapp = { success: false, error: e.message }; }
  } else {
    result.whatsapp = { success: false, error: !brand?.notify_connection_id ? 'Sem conexão configurada' : 'Aluno sem telefone' };
  }

  // E-mail (via org SMTP)
  if (student.email && brand?.organization_id) {
    try {
      const cfg = await query('SELECT * FROM email_smtp_configs WHERE organization_id = $1 LIMIT 1', [brand.organization_id]);
      const smtp = cfg.rows[0];
      if (smtp) {
        const { default: nodemailerLib } = await import('nodemailer');
        const cryptoLib = await import('crypto');
        const ENC = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';
        const [ivHex, enc] = String(smtp.password_encrypted).split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = cryptoLib.scryptSync(ENC, 'salt', 32);
        const decipher = cryptoLib.createDecipheriv('aes-256-cbc', key, iv);
        let pass = decipher.update(enc, 'hex', 'utf8'); pass += decipher.final('utf8');
        const transporter = nodemailerLib.createTransport({
          host: smtp.host, port: smtp.port, secure: smtp.secure,
          auth: { user: smtp.username, pass },
          tls: { rejectUnauthorized: false },
        });
        await transporter.sendMail({
          from: `"${smtp.from_name || brand.name}" <${smtp.from_email}>`,
          to: student.email,
          subject: `Cadastro aprovado - ${brand.name}`,
          html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
            ${brand.logo_url ? `<div style="text-align:center;margin-bottom:16px"><img src="${brand.logo_url}" alt="${brand.name}" style="max-height:80px"/></div>` : ''}
            <h2 style="color:${brand.primary_color || '#0ea5e9'}">Olá, ${student.name}!</h2>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <p style="margin-top:24px"><a href="${link}" style="background:${brand.primary_color || '#0ea5e9'};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Acessar plataforma</a></p>
          </div>`,
        });
        result.email = { success: true };
      } else result.email = { success: false, error: 'Sem SMTP configurado' };
    } catch (e) { result.email = { success: false, error: e.message }; }
  } else {
    result.email = { success: false, error: 'Sem e-mail ou organização' };
  }
  return result;
}

admin.post('/students/:id/approve', gate('can_manage_ead'), async (req, res) => {
  try {
    const s = await query('SELECT * FROM ead_students WHERE id = $1', [req.params.id]);
    if (!s.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    const student = s.rows[0];
    if (student.status === 'approved') return res.status(400).json({ error: 'Já aprovado' });
    const b = student.brand_id ? (await query('SELECT * FROM ead_brands WHERE id = $1', [student.brand_id])).rows[0] : null;
    await query(`UPDATE ead_students SET status='approved', approved_at=NOW(), approved_by=$1 WHERE id=$2`, [req.userId, student.id]);
    const notify = await notifyApproval(student, b, appBaseUrl(req));
    res.json({ ok: true, notify });
  } catch (e) { console.error('approve', e); res.status(500).json({ error: 'Erro ao aprovar' }); }
});

admin.post('/students/:id/reject', gate('can_manage_ead'), async (req, res) => {
  try {
    const { reason } = req.body || {};
    const r = await query(`UPDATE ead_students SET status='rejected', rejected_reason=$1 WHERE id=$2 RETURNING id`, [reason || null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao rejeitar' }); }
});

admin.post('/students/:id/resend-notification', gate('can_manage_ead'), async (req, res) => {
  try {
    const s = await query('SELECT * FROM ead_students WHERE id = $1', [req.params.id]);
    if (!s.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const student = s.rows[0];
    const b = student.brand_id ? (await query('SELECT * FROM ead_brands WHERE id = $1', [student.brand_id])).rows[0] : null;
    const notify = await notifyApproval(student, b, appBaseUrl(req));
    res.json({ ok: true, notify });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao reenviar' }); }
});

router.use('/admin', admin);

export default router;
