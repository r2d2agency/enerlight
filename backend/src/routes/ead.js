import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import sharp from 'sharp';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sendMessage as sendWhatsapp } from '../lib/whatsapp-provider.js';

const DEFAULT_SIGNUP_FIELDS = [
  { key: 'name', label: 'Nome completo', type: 'text', required: true },
  { key: 'cpf', label: 'CPF', type: 'cpf', required: true },
  { key: 'email', label: 'E-mail', type: 'email', required: true },
  { key: 'phone', label: 'WhatsApp', type: 'phone', required: true },
  { key: 'company', label: 'Empresa', type: 'text', required: false },
  { key: 'city', label: 'Cidade', type: 'text', required: false },
  { key: 'state', label: 'Estado', type: 'uf', required: false },
];

function genTempPassword(digits = 6) {
  // Formato: "ener" + N dígitos aleatórios (ex: ener483920)
  let s = 'ener';
  for (let i = 0; i < digits; i++) s += Math.floor(Math.random() * 10);
  return s;
}


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
    let { cpf, name, email, company, city, state } = req.body || {};
    cpf = String(cpf || '').replace(/\D/g, '');
    email = String(email || '').trim().toLowerCase();
    name = String(name || '').trim();
    if (!cpf || !name || !email) return res.status(400).json({ error: 'Preencha CPF, nome e e-mail' });
    if (!isValidCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });

    const dup = await query('SELECT id FROM ead_students WHERE cpf = $1 OR lower(email) = $2 LIMIT 1', [cpf, email]);
    if (dup.rows.length) return res.status(400).json({ error: 'CPF ou email já cadastrados' });

    const r = await query(
      `INSERT INTO ead_students (cpf, name, email, password_hash, company, city, state, status)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,'pending') RETURNING id, cpf, name, email, company, city, state, status, created_at`,
      [cpf, name, email, company || null, city || null, state || null]
    );
    const student = r.rows[0];
    res.status(201).json({ student, pending: true, message: 'Cadastro recebido! Aguarde a liberação — você receberá sua senha temporária por WhatsApp/e-mail.' });
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
    if (!s.password_hash) return res.status(403).json({ error: 'Seu cadastro ainda não foi aprovado. Aguarde a liberação e o envio da senha temporária.', status: s.status || 'pending' });
    const ok = await bcrypt.compare(password, s.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (s.status === 'pending') return res.status(403).json({ error: 'Seu cadastro está em análise. Você receberá um aviso por WhatsApp/e-mail quando for liberado.', status: 'pending' });
    if (s.status === 'rejected') return res.status(403).json({ error: 'Cadastro não aprovado. Entre em contato com o administrador.', status: 'rejected' });
    const { password_hash, ...student } = s;
    res.json({ student: { ...student, must_change_password: !!s.must_change_password }, token: signStudent(s) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.post('/auth/change-password', studentAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!new_password || String(new_password).length < 6) return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres' });
    const r = await query('SELECT id, password_hash, must_change_password FROM ead_students WHERE id = $1', [req.studentId]);
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const s = r.rows[0];
    // If not forced change, require current password
    if (!s.must_change_password) {
      if (!current_password) return res.status(400).json({ error: 'Informe a senha atual' });
      const ok = await bcrypt.compare(current_password, s.password_hash || '');
      if (!ok) return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    const hash = await bcrypt.hash(String(new_password), 10);
    await query('UPDATE ead_students SET password_hash=$1, must_change_password=false WHERE id=$2', [hash, req.studentId]);
    res.json({ ok: true });
  } catch (e) { console.error('change-password', e); res.status(500).json({ error: 'Erro ao trocar senha' }); }
});

router.get('/auth/me', studentAuth, async (req, res) => {
  const r = await query(
    `SELECT s.id, s.cpf, s.name, s.email, s.company, s.city, s.state, s.phone, s.status, s.created_at, s.must_change_password,
            b.id AS brand_id, b.slug AS brand_slug, b.name AS brand_name, b.logo_url AS brand_logo, b.cover_url AS brand_cover_url,
            b.primary_color AS brand_primary, b.accent_color AS brand_accent
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
    const phone = String(body.phone || '').replace(/\D/g, '') || null;
    const company = body.company || null;
    const city = body.city || null;
    const state = body.state || null;

    // basic validation against brand-declared required fields (senha é gerada na aprovação)
    const known = new Set(['name','cpf','email','password','phone','company','city','state']);
    const extra = {};
    for (const f of fields) {
      if (f.key === 'password') continue; // ignorado - senha é gerada automaticamente
      const val = body[f.key];
      if (f.required && (val === undefined || val === null || String(val).trim() === '')) {
        return res.status(400).json({ error: `Campo obrigatório: ${f.label || f.key}` });
      }
      if (!known.has(f.key) && val !== undefined) extra[f.key] = val;
    }

    if (!cpf || !name || !email) return res.status(400).json({ error: 'Preencha nome, CPF e e-mail' });
    if (!isValidCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });

    const dup = await query('SELECT id, status FROM ead_students WHERE cpf = $1 OR lower(email) = $2 LIMIT 1', [cpf, email]);
    if (dup.rows.length) {
      const s = dup.rows[0];
      if (s.status === 'pending') return res.status(400).json({ error: 'Já existe um cadastro pendente com este CPF/e-mail.' });
      return res.status(400).json({ error: 'CPF ou e-mail já cadastrados' });
    }

    const r = await query(
      `INSERT INTO ead_students (cpf, name, email, password_hash, company, city, state, phone, brand_id, status, extra_fields)
       VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,'pending',$9)
       RETURNING id, name, email`,
      [cpf, name, email, company, city, state, phone, brand.id, JSON.stringify(extra)]
    );

    // Notifica administradores por WhatsApp que há novo cadastro aguardando aprovação
    notifyAdminNewSignup(brand, { id: r.rows[0].id, name, email, phone, company, city, state })
      .catch(err => console.error('[EAD notifyAdminNewSignup] error', err));

    res.status(201).json({ ok: true, student: r.rows[0], message: 'Cadastro enviado! Assim que aprovado, você receberá sua senha temporária por WhatsApp/e-mail.' });

  } catch (e) {
    console.error('brand signup error', e);
    res.status(500).json({ error: 'Erro ao cadastrar' });
  }
});

// =========================================================================
// PUBLIC / STUDENT: courses, lessons, quiz
// =========================================================================
router.get('/courses', studentAuth, async (req, res) => {
  try {
    const s = await query('SELECT brand_id FROM ead_students WHERE id = $1', [req.studentId]);
    const brandId = s.rows[0]?.brand_id || null;
    // Strict brand isolation: student only sees courses of their own brand.
    if (!brandId) return res.json([]);
    const r = await query(
      `SELECT c.id, c.title, c.description, c.cover_url, c.created_at, c.brand_id,
              b.name AS brand_name, b.slug AS brand_slug,
              (SELECT COUNT(*)::int FROM ead_lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM ead_quiz_questions q WHERE q.course_id = c.id) AS question_count
       FROM ead_courses c LEFT JOIN ead_brands b ON b.id = c.brand_id
       WHERE c.published = true AND c.brand_id = $1
       ORDER BY c.created_at DESC`,
      [brandId]
    );
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

router.get('/courses/:id', studentAuth, async (req, res) => {
  try {
    const c = await query('SELECT * FROM ead_courses WHERE id = $1', [req.params.id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Curso não encontrado' });
    const course = c.rows[0];
    const s = await query('SELECT brand_id FROM ead_students WHERE id = $1', [req.studentId]);
    const studentBrand = s.rows[0]?.brand_id || null;
    if (!studentBrand || !course.brand_id || course.brand_id !== studentBrand) {
      return res.status(403).json({ error: 'Este curso não está disponível para sua marca.' });
    }
    const modules = await query('SELECT id, title, description, order_index FROM ead_modules WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    const lessons = await query('SELECT id, module_id, title, youtube_url, video_type, video_url, duration_seconds, description, order_index FROM ead_lessons WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    const manuals = await query('SELECT id, title, description, cover_url, file_url, order_index FROM ead_manuals WHERE course_id = $1 ORDER BY order_index, created_at', [req.params.id]);
    const enr = await query('SELECT status, approved_at FROM ead_enrollments WHERE student_id = $1 AND course_id = $2', [req.studentId, req.params.id]);
    const cert = await query('SELECT id, pdf_url, issued_at FROM ead_certificates WHERE student_id = $1 AND course_id = $2', [req.studentId, req.params.id]);
    const prog = await query('SELECT lesson_id, watched_seconds, last_position, total_seconds, completed FROM ead_lesson_progress WHERE student_id = $1 AND course_id = $2', [req.studentId, req.params.id]);
    res.json({ course, modules: modules.rows, lessons: lessons.rows, manuals: manuals.rows, enrollment: enr.rows[0] || null, certificate: cert.rows[0] || null, progress: prog.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

// Progress heartbeat — auto-completes at >=90% watched
router.post('/lessons/:id/progress', studentAuth, async (req, res) => {
  try {
    const { watched_seconds, last_position, total_seconds } = req.body || {};
    const ws = Math.max(0, parseInt(watched_seconds) || 0);
    const lp = Math.max(0, parseInt(last_position) || 0);
    const ts = total_seconds ? Math.max(0, parseInt(total_seconds)) : null;
    const l = await query('SELECT course_id FROM ead_lessons WHERE id = $1', [req.params.id]);
    if (!l.rows.length) return res.status(404).json({ error: 'Aula não encontrada' });
    const courseId = l.rows[0].course_id;
    const completed = ts && ts > 0 ? (ws / ts) >= 0.9 : false;
    const r = await query(
      `INSERT INTO ead_lesson_progress (student_id, lesson_id, course_id, watched_seconds, last_position, total_seconds, completed, completed_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 THEN NOW() ELSE NULL END, NOW())
       ON CONFLICT (student_id, lesson_id) DO UPDATE SET
         watched_seconds = GREATEST(ead_lesson_progress.watched_seconds, EXCLUDED.watched_seconds),
         last_position = EXCLUDED.last_position,
         total_seconds = COALESCE(EXCLUDED.total_seconds, ead_lesson_progress.total_seconds),
         completed = ead_lesson_progress.completed OR EXCLUDED.completed,
         completed_at = COALESCE(ead_lesson_progress.completed_at, CASE WHEN EXCLUDED.completed THEN NOW() ELSE NULL END),
         updated_at = NOW()
       RETURNING *`,
      [req.studentId, req.params.id, courseId, ws, lp, ts, completed]
    );
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

// Manual mark complete (fallback button)
router.post('/lessons/:id/complete', studentAuth, async (req, res) => {
  try {
    const l = await query('SELECT course_id FROM ead_lessons WHERE id = $1', [req.params.id]);
    if (!l.rows.length) return res.status(404).json({ error: 'Aula não encontrada' });
    const r = await query(
      `INSERT INTO ead_lesson_progress (student_id, lesson_id, course_id, completed, completed_at, updated_at)
       VALUES ($1,$2,$3,true,NOW(),NOW())
       ON CONFLICT (student_id, lesson_id) DO UPDATE SET completed = true, completed_at = COALESCE(ead_lesson_progress.completed_at, NOW()), updated_at = NOW()
       RETURNING *`,
      [req.studentId, req.params.id, l.rows[0].course_id]
    );
    res.json(r.rows[0]);
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

// All manuals available to the logged student (strict same brand)
router.get('/my/manuals', studentAuth, async (req, res) => {
  try {
    const s = await query('SELECT brand_id FROM ead_students WHERE id = $1', [req.studentId]);
    const brandId = s.rows[0]?.brand_id || null;
    if (!brandId) return res.json([]);
    const r = await query(
      `SELECT m.id, m.title, m.description, m.cover_url, m.file_url, m.order_index,
              c.id AS course_id, c.title AS course_title, c.brand_id
         FROM ead_manuals m
         JOIN ead_courses c ON c.id = m.course_id
        WHERE c.published = true AND c.brand_id = $1
        ORDER BY c.title, m.order_index, m.created_at`,
      [brandId]
    );
    res.json(r.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
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

let eadApprovalSchemaReady = false;

async function ensureEadApprovalSchema() {
  if (eadApprovalSchemaReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ead_students (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cpf VARCHAR(11) UNIQUE NOT NULL,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      company VARCHAR(200),
      city VARCHAR(120),
      state VARCHAR(40),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ead_brands (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(80) UNIQUE NOT NULL,
      name VARCHAR(160) NOT NULL,
      logo_url TEXT,
      cover_url TEXT,
      primary_color VARCHAR(20) DEFAULT '#0ea5e9',
      accent_color VARCHAR(20) DEFAULT '#0284c7',
      welcome_title VARCHAR(200),
      welcome_text TEXT,
      signup_fields JSONB DEFAULT '[]'::jsonb,
      organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
      notify_connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
      approval_message TEXT DEFAULT 'Olá {nome}! Seu cadastro na área {marca} foi aprovado. Acesse: {link}',
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES ead_brands(id) ON DELETE SET NULL;
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'approved';
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS extra_fields JSONB DEFAULT '{}'::jsonb;
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL;
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
    ALTER TABLE ead_students ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT false;
    ALTER TABLE ead_students ALTER COLUMN password_hash DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ead_students_brand ON ead_students(brand_id);
    CREATE INDEX IF NOT EXISTS idx_ead_students_status ON ead_students(status);
    CREATE INDEX IF NOT EXISTS idx_ead_brands_slug ON ead_brands(slug);

    ALTER TABLE ead_brands ADD COLUMN IF NOT EXISTS notify_admin_phone VARCHAR(30);
    ALTER TABLE ead_brands ADD COLUMN IF NOT EXISTS signup_notify_message TEXT;
    ALTER TABLE ead_brands ADD COLUMN IF NOT EXISTS notify_admin_recipients JSONB DEFAULT '[]'::jsonb;

    CREATE TABLE IF NOT EXISTS ead_brand_admins (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id UUID NOT NULL REFERENCES ead_brands(id) ON DELETE CASCADE,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(200) NOT NULL,
      password_hash TEXT NOT NULL,
      active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(brand_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_ead_brand_admins_brand ON ead_brand_admins(brand_id);
    CREATE INDEX IF NOT EXISTS idx_ead_brand_admins_email ON ead_brand_admins(lower(email));

    CREATE TABLE IF NOT EXISTS ead_brand_catalog_categories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id UUID REFERENCES ead_brands(id) ON DELETE CASCADE,
      name VARCHAR(160) NOT NULL,
      description TEXT,
      order_index INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE ead_brand_catalog_categories ALTER COLUMN brand_id DROP NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ead_bcat_brand ON ead_brand_catalog_categories(brand_id);

    CREATE TABLE IF NOT EXISTS ead_brand_catalogs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id UUID REFERENCES ead_brands(id) ON DELETE CASCADE,
      category_id UUID REFERENCES ead_brand_catalog_categories(id) ON DELETE SET NULL,
      title VARCHAR(200) NOT NULL,
      description TEXT,
      type VARCHAR(20) NOT NULL DEFAULT 'gallery',
      cover_url TEXT,
      images JSONB DEFAULT '[]'::jsonb,
      pdf_url TEXT,
      order_index INT DEFAULT 0,
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE ead_brand_catalogs ALTER COLUMN brand_id DROP NOT NULL;
    ALTER TABLE ead_brand_catalogs ADD COLUMN IF NOT EXISTS extra_brand_ids UUID[] DEFAULT '{}';
    ALTER TABLE ead_brand_catalog_categories ADD COLUMN IF NOT EXISTS extra_brand_ids UUID[] DEFAULT '{}';
    CREATE INDEX IF NOT EXISTS idx_ead_bcat_brand2 ON ead_brand_catalogs(brand_id);
    CREATE INDEX IF NOT EXISTS idx_ead_bcat_category ON ead_brand_catalogs(category_id);
  `);
  eadApprovalSchemaReady = true;
}


async function runWithEadSchemaRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    const message = String(error?.message || '');
    if (!/(ead_students|ead_brands|status|brand_id|phone|extra_fields|approved_at|approved_by|rejected_reason|must_change_password|password_hash)/i.test(message)) {
      throw error;
    }
    eadApprovalSchemaReady = false;
    await ensureEadApprovalSchema();
    return fn();
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} excedeu ${Math.round(ms / 1000)}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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
  const { brand_id } = req.query;
  const params = [];
  let where = '';
  if (brand_id === 'null') { where = 'WHERE c.brand_id IS NULL'; }
  else if (brand_id) { params.push(brand_id); where = `WHERE c.brand_id = $${params.length}`; }
  const r = await query(
    `SELECT c.*, b.name AS brand_name, b.slug AS brand_slug,
       (SELECT COUNT(*)::int FROM ead_lessons l WHERE l.course_id = c.id) AS lesson_count,
       (SELECT COUNT(*)::int FROM ead_manuals m WHERE m.course_id = c.id) AS manual_count,
       (SELECT COUNT(*)::int FROM ead_quiz_questions q WHERE q.course_id = c.id) AS question_count,
       (SELECT COUNT(*)::int FROM ead_certificates ce WHERE ce.course_id = c.id) AS certificate_count
     FROM ead_courses c LEFT JOIN ead_brands b ON b.id = c.brand_id
     ${where}
     ORDER BY c.created_at DESC`,
    params
  );
  res.json(r.rows);
});

admin.post('/courses', gate('can_manage_ead'), async (req, res) => {
  const { title, description, cover_url, published, has_certificate, passing_score, brand_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  const r = await query(
    `INSERT INTO ead_courses (title, description, cover_url, published, has_certificate, passing_score, brand_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [title, description || null, cover_url || null, !!published,
     typeof has_certificate === 'boolean' ? has_certificate : true,
     Number.isFinite(+passing_score) ? +passing_score : 100,
     brand_id || null,
     req.userId]
  );
  res.status(201).json(r.rows[0]);
});

admin.patch('/courses/:id', gate('can_manage_ead'), async (req, res) => {
  const { title, description, cover_url, published, has_certificate, passing_score, brand_id } = req.body || {};
  const hasBrand = Object.prototype.hasOwnProperty.call(req.body || {}, 'brand_id');
  const r = await query(
    `UPDATE ead_courses SET
       title = COALESCE($1,title),
       description = COALESCE($2,description),
       cover_url = COALESCE($3,cover_url),
       published = COALESCE($4,published),
       has_certificate = COALESCE($5,has_certificate),
       passing_score = COALESCE($6,passing_score),
       brand_id = CASE WHEN $8::boolean THEN $7 ELSE brand_id END,
       updated_at = NOW()
     WHERE id = $9 RETURNING *`,
    [title ?? null, description ?? null, cover_url ?? null,
     typeof published === 'boolean' ? published : null,
     typeof has_certificate === 'boolean' ? has_certificate : null,
     Number.isFinite(+passing_score) ? +passing_score : null,
     brand_id || null, hasBrand,
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
  const { title, youtube_url, video_url, video_type, duration_seconds, order_index, module_id, description } = req.body || {};
  const vt = video_type === 'upload' ? 'upload' : 'youtube';
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  if (vt === 'youtube' && !youtube_url) return res.status(400).json({ error: 'URL do YouTube obrigatória' });
  if (vt === 'upload' && !video_url) return res.status(400).json({ error: 'Arquivo de vídeo obrigatório' });
  const r = await query(
    `INSERT INTO ead_lessons (course_id, module_id, title, youtube_url, video_url, video_type, duration_seconds, description, order_index)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.params.id, module_id || null, title, youtube_url || null, video_url || null, vt, duration_seconds || null, description || null, order_index || 0]
  );
  res.status(201).json(r.rows[0]);
});
admin.patch('/lessons/:id', gate('can_manage_ead'), async (req, res) => {
  const { title, youtube_url, video_url, video_type, duration_seconds, order_index, module_id, description } = req.body || {};
  const r = await query(
    `UPDATE ead_lessons SET
       title=COALESCE($1,title),
       youtube_url=$2,
       video_url=$3,
       video_type=COALESCE($4,video_type),
       duration_seconds=COALESCE($5,duration_seconds),
       order_index=COALESCE($6,order_index),
       module_id=$7,
       description=COALESCE($8,description)
     WHERE id=$9 RETURNING *`,
    [title ?? null, youtube_url ?? null, video_url ?? null, video_type ?? null, duration_seconds ?? null, order_index ?? null, module_id ?? null, description ?? null, req.params.id]
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
  try {
    await ensureEadApprovalSchema();
    const r = await runWithEadSchemaRetry(() => query(
      `SELECT s.id, s.name, s.cpf, s.email, s.phone, s.company, s.city, s.state, s.status, s.extra_fields, s.approved_at, s.created_at,
         s.brand_id, b.name AS brand_name, b.slug AS brand_slug,
         (SELECT COUNT(*)::int FROM ead_certificates c WHERE c.student_id = s.id) AS certificate_count,
         (SELECT COUNT(*)::int FROM ead_enrollments e WHERE e.student_id = s.id) AS enrollment_count
       FROM ead_students s LEFT JOIN ead_brands b ON b.id = s.brand_id
       WHERE s.email <> 'preview@ead.local' ORDER BY s.created_at DESC`
    ));
    res.json(r.rows);
  } catch (e) {
    console.error('list students', e);
    res.status(500).json({ error: 'Erro ao carregar alunos' });
  }
});

admin.get('/students/pending', gate('can_view_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { brand_id } = req.query;
    const params = [];
    let where = "s.status = 'pending'";
    if (brand_id) { params.push(brand_id); where += ` AND s.brand_id = $${params.length}`; }
    const r = await runWithEadSchemaRetry(() => query(
      `SELECT s.id, s.name, s.cpf, s.email, s.phone, s.company, s.city, s.state, s.extra_fields, s.created_at,
              b.id AS brand_id, b.name AS brand_name, b.slug AS brand_slug
       FROM ead_students s LEFT JOIN ead_brands b ON b.id = s.brand_id
       WHERE ${where} ORDER BY s.created_at DESC`,
      params
    ));
    res.json(r.rows);
  } catch (e) {
    console.error('pending students', e);
    res.status(500).json({ error: 'Erro ao buscar aprovações pendentes' });
  }
});

admin.get('/students/:id', gate('can_view_ead'), async (req, res) => {
  const s = await query(
    `SELECT s.id, s.name, s.cpf, s.email, s.phone, s.company, s.city, s.state,
       s.status, s.extra_fields, s.approved_at, s.rejected_reason, s.created_at,
       s.brand_id, b.name AS brand_name, b.slug AS brand_slug,
       u.name AS approved_by_name
     FROM ead_students s
     LEFT JOIN ead_brands b ON b.id = s.brand_id
     LEFT JOIN users u ON u.id = s.approved_by
     WHERE s.id=$1`, [req.params.id]);
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
  const enrollments = await query(
    `SELECT e.id, e.status, e.approved_at, e.created_at, co.title as course_title
     FROM ead_enrollments e JOIN ead_courses co ON co.id = e.course_id
     WHERE e.student_id=$1 ORDER BY e.created_at DESC`, [req.params.id]
  );
  res.json({ student: s.rows[0], certificates: certs.rows, attempts: attempts.rows, enrollments: enrollments.rows });
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

function sanitizeNotifyRecipients(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(r => ({
      name: String(r?.name || '').trim(),
      phone: String(r?.phone || '').replace(/\D/g, ''),
      email: String(r?.email || '').trim().toLowerCase(),
    }))
    .filter(r => r.phone || r.email);
}

admin.get('/brands', gate('can_view_ead'), async (req, res) => {
  await ensureEadApprovalSchema();
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
    await ensureEadApprovalSchema();
    const { slug, name, logo_url, cover_url, primary_color, accent_color, welcome_title, welcome_text, signup_fields, notify_connection_id, approval_message, active, notify_admin_phone, signup_notify_message, notify_admin_recipients } = req.body || {};
    const cleanSlug = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanSlug || !name) return res.status(400).json({ error: 'Slug e nome são obrigatórios' });
    const orgId = await getAdminOrgId(req.userId);
    const cleanAdminPhone = notify_admin_phone ? String(notify_admin_phone).replace(/\D/g, '') || null : null;
    const cleanRecipients = sanitizeNotifyRecipients(notify_admin_recipients);
    const r = await query(
      `INSERT INTO ead_brands (slug, name, logo_url, cover_url, primary_color, accent_color, welcome_title, welcome_text, signup_fields, organization_id, notify_connection_id, approval_message, active, notify_admin_phone, signup_notify_message, notify_admin_recipients)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,COALESCE($13,true),$14,$15,$16::jsonb)
       RETURNING *`,
      [cleanSlug, name, logo_url || null, cover_url || null, primary_color || '#0ea5e9', accent_color || '#0284c7',
       welcome_title || null, welcome_text || null,
       JSON.stringify(Array.isArray(signup_fields) && signup_fields.length ? signup_fields : DEFAULT_SIGNUP_FIELDS),
       orgId, notify_connection_id || null, approval_message || null,
       typeof active === 'boolean' ? active : null,
       cleanAdminPhone, signup_notify_message || null, JSON.stringify(cleanRecipients)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Slug já em uso' });
    console.error('create brand', e); res.status(500).json({ error: 'Erro ao criar marca' });
  }
});

admin.patch('/brands/:id', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { slug, name, logo_url, cover_url, primary_color, accent_color, welcome_title, welcome_text, signup_fields, notify_connection_id, approval_message, active, notify_admin_phone, signup_notify_message, notify_admin_recipients } = req.body || {};
    const cleanSlug = slug !== undefined ? String(slug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') : null;
    const cleanAdminPhone = notify_admin_phone !== undefined
      ? (notify_admin_phone ? String(notify_admin_phone).replace(/\D/g, '') || null : null)
      : undefined;
    const cleanRecipients = Array.isArray(notify_admin_recipients)
      ? sanitizeNotifyRecipients(notify_admin_recipients)
      : undefined;
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
         notify_admin_phone = CASE WHEN $14::boolean THEN $15 ELSE notify_admin_phone END,
         signup_notify_message = COALESCE($16, signup_notify_message),
         notify_admin_recipients = CASE WHEN $17::boolean THEN $18::jsonb ELSE notify_admin_recipients END,
         updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [cleanSlug, name ?? null, logo_url ?? null, cover_url ?? null, primary_color ?? null, accent_color ?? null,
       welcome_title ?? null, welcome_text ?? null,
       signup_fields ? JSON.stringify(signup_fields) : null,
       notify_connection_id ?? null,
       approval_message ?? null,
       typeof active === 'boolean' ? active : null,
       req.params.id,
       cleanAdminPhone !== undefined, cleanAdminPhone ?? null,
       signup_notify_message ?? null,
       cleanRecipients !== undefined, cleanRecipients ? JSON.stringify(cleanRecipients) : '[]']
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
    `SELECT id, instance_name, instance_id, phone_number, provider, status
     FROM connections WHERE organization_id = $1
     ORDER BY CASE WHEN status = 'connected' THEN 0 ELSE 1 END, instance_name NULLS LAST, created_at`,
    [orgId]
  );

  res.json(r.rows);
});

// =========================================================================
// ADMIN: STUDENT APPROVALS
// =========================================================================
function appBaseUrl(req) {
  // Sempre usa o domínio público do app. Descarta hosts internos (easypanel, backend, api, localhost).
  const PUBLIC_DEFAULT = 'https://app.enerlight.com.br';
  const isInternal = (u) => /easypanel|localhost|127\.0\.0\.1|whastsale-backend|backend\./i.test(String(u || ''));
  const clean = (u) => {
    if (!u || isInternal(u)) return '';
    try { return new URL(u).origin; } catch { return ''; }
  };
  const fromHeader = clean(req.get('origin') || req.get('referer') || '');
  const raw = clean(process.env.APP_BASE_URL)
    || clean(process.env.FRONTEND_URL)
    || fromHeader
    || PUBLIC_DEFAULT;
  return String(raw).replace(/\/+$/, '');
}

async function notifyAdminNewSignup(brand, student) {
  try {
    // Consolida destinatários: array notify_admin_recipients + fallback ao notify_admin_phone
    const recipientList = [];
    if (Array.isArray(brand?.notify_admin_recipients)) {
      for (const r of brand.notify_admin_recipients) {
        const phone = String(r?.phone || '').replace(/\D/g, '');
        const email = String(r?.email || '').trim().toLowerCase();
        if (phone || email) recipientList.push({ name: String(r?.name || '').trim(), phone, email });
      }
    }
    if (!recipientList.length && brand?.notify_admin_phone) {
      recipientList.push({ name: '', phone: String(brand.notify_admin_phone).replace(/\D/g, ''), email: '' });
    }
    if (!recipientList.length) return;

    // WhatsApp connection
    let conn = null;
    if (brand?.notify_connection_id) {
      const c = await query('SELECT * FROM connections WHERE id = $1', [brand.notify_connection_id]);
      conn = c.rows[0] || null;
    }
    if (!conn && brand?.organization_id) {
      const c = await query(
        `SELECT * FROM connections WHERE organization_id = $1
         ORDER BY CASE WHEN status = 'connected' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`,
        [brand.organization_id]
      );
      conn = c.rows[0] || null;
    }

    // SMTP (para e-mails)
    let transporter = null;
    let smtpFrom = null;
    if (brand?.organization_id) {
      try {
        const cfg = await query('SELECT * FROM email_smtp_configs WHERE organization_id = $1 LIMIT 1', [brand.organization_id]);
        const smtp = cfg.rows[0];
        if (smtp) {
          const ENC = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';
          const [ivHex, enc] = String(smtp.password_encrypted).split(':');
          const iv = Buffer.from(ivHex, 'hex');
          const key = crypto.scryptSync(ENC, 'salt', 32);
          const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
          let pass = decipher.update(enc, 'hex', 'utf8'); pass += decipher.final('utf8');
          transporter = nodemailer.createTransport({
            host: smtp.host, port: smtp.port, secure: smtp.secure,
            auth: { user: smtp.username, pass },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000,
          });
          smtpFrom = `"${smtp.from_name || brand?.name || 'EAD'}" <${smtp.from_email}>`;
        }
      } catch (e) {
        console.error('[EAD notifyAdminNewSignup] smtp load error', e?.message || e);
      }
    }

    const defaultTpl = `🔔 *Novo cadastro aguardando aprovação*\n\n{saudacao}👤 {nome}\n📧 {email}\n📱 {telefone}\n🏢 {empresa}\n📍 {cidade}/{uf}\n\nÁrea: *{marca}*\nAcesse o painel para aprovar.`;
    const tpl = brand?.signup_notify_message || defaultTpl;

    for (const rec of recipientList) {
      const vars = {
        nome: student.name || '-', email: student.email || '-',
        telefone: student.phone || '-', empresa: student.company || '-',
        cidade: student.city || '-', uf: student.state || '-',
        marca: brand?.name || '',
        destinatario: rec.name || '',
        saudacao: rec.name ? `Olá ${rec.name}!\n\n` : '',
      };
      const message = tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

      // WhatsApp
      if (rec.phone && conn) {
        try {
          const r = await sendWhatsapp(conn, rec.phone, message, 'text');
          console.log('[EAD notifyAdminNewSignup] wa', { brand: brand.slug, to: rec.phone, r });
        } catch (err) {
          console.error('[EAD notifyAdminNewSignup] wa error', rec.phone, err?.message || err);
        }
      }

      // Email
      if (rec.email && transporter) {
        try {
          await transporter.sendMail({
            from: smtpFrom,
            to: rec.email,
            subject: `Novo cadastro aguardando aprovação — ${brand?.name || 'EAD'}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #eee;border-radius:8px">
              ${brand?.logo_url ? `<div style="text-align:center;margin-bottom:16px"><img src="${brand.logo_url}" alt="${brand.name}" style="max-height:80px"/></div>` : ''}
              <h2 style="color:${brand?.primary_color || '#0ea5e9'}">Novo cadastro aguardando aprovação</h2>
              ${rec.name ? `<p>Olá <b>${rec.name}</b>,</p>` : ''}
              <p>Um novo instalador se cadastrou na área <b>${brand?.name || ''}</b>:</p>
              <ul style="line-height:1.7">
                <li><b>Nome:</b> ${student.name || '-'}</li>
                <li><b>E-mail:</b> ${student.email || '-'}</li>
                <li><b>WhatsApp:</b> ${student.phone || '-'}</li>
                <li><b>Empresa:</b> ${student.company || '-'}</li>
                <li><b>Cidade/UF:</b> ${student.city || '-'}/${student.state || '-'}</li>
              </ul>
              <p style="color:#666;font-size:13px;margin-top:16px">Acesse o painel administrativo para aprovar ou rejeitar este cadastro.</p>
            </div>`,
          });
          console.log('[EAD notifyAdminNewSignup] email ok', { to: rec.email });
        } catch (err) {
          console.error('[EAD notifyAdminNewSignup] email error', rec.email, err?.message || err);
        }
      }
    }
  } catch (e) {
    console.error('[EAD notifyAdminNewSignup] error', e);
  }
}

async function notifyApproval(student, brand, baseUrl, tempPassword) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const link = brand?.slug ? `${base}/marca/${brand.slug}/login` : `${base}/ead/login`;
  const defaultTpl = brand?.name
    ? `Olá {nome}! 🎉\n\nSeu cadastro na área *{marca}* foi aprovado.\n\n🔐 *Suas credenciais de acesso:*\nE-mail: {email}\nSenha temporária: *{senha}*\n\nAcesse: {link}\n\nAo entrar pela primeira vez você será solicitado a criar uma nova senha.`
    : `Olá {nome}! Cadastro aprovado.\nE-mail: {email}\nSenha temporária: {senha}\nAcesse: {link}`;
  const tpl = brand?.approval_message || defaultTpl;
  const senhaTxt = tempPassword || '(já definida)';
  const vars = { nome: student.name, marca: brand?.name || '', link, email: student.email, empresa: student.company || '', senha: senhaTxt };
  const message = tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');


  const result = { whatsapp: null, email: null };

  // WhatsApp — usa conexão configurada na marca, ou fallback para qualquer conexão ativa da organização
  if (student.phone) {
    try {
      let conn = null;
      if (brand?.notify_connection_id) {
        const c = await query('SELECT * FROM connections WHERE id = $1', [brand.notify_connection_id]);
        conn = c.rows[0] || null;
      }
      if (!conn) {
        const orgId = brand?.organization_id || student.organization_id;
        if (orgId) {
          const c = await query(
            `SELECT * FROM connections WHERE organization_id = $1
             ORDER BY CASE WHEN status = 'connected' THEN 0 ELSE 1 END, created_at ASC LIMIT 1`,
            [orgId]
          );
          conn = c.rows[0] || null;
        }
      }
      if (conn) {
        const r = await sendWhatsapp(conn, student.phone, message, 'text');
        result.whatsapp = r;
        console.log('[EAD notify] whatsapp', { studentId: student.id, connId: conn.id, r });
      } else {
        result.whatsapp = { success: false, error: 'Nenhuma conexão WhatsApp disponível' };
      }
    } catch (e) {
      console.error('[EAD notify] whatsapp error', e);
      result.whatsapp = { success: false, error: e.message };
    }
  } else {
    result.whatsapp = { success: false, error: 'Aluno sem telefone' };
  }

  // E-mail (via org SMTP)
  if (student.email && brand?.organization_id) {
    try {
      const cfg = await query('SELECT * FROM email_smtp_configs WHERE organization_id = $1 LIMIT 1', [brand.organization_id]);
      const smtp = cfg.rows[0];
      if (smtp) {
        const ENC = process.env.EMAIL_ENCRYPTION_KEY || 'whatsale-email-key-32chars!!';
        const [ivHex, enc] = String(smtp.password_encrypted).split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(ENC, 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let pass = decipher.update(enc, 'hex', 'utf8'); pass += decipher.final('utf8');
        const transporter = nodemailer.createTransport({
          host: smtp.host, port: smtp.port, secure: smtp.secure,
          auth: { user: smtp.username, pass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 8000,
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
    await ensureEadApprovalSchema();
    const s = await runWithEadSchemaRetry(() => query('SELECT * FROM ead_students WHERE id = $1', [req.params.id]));
    if (!s.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    const student = s.rows[0];
    if (student.status === 'approved') return res.status(400).json({ error: 'Já aprovado', already: true });
    const b = student.brand_id ? (await runWithEadSchemaRetry(() => query('SELECT * FROM ead_brands WHERE id = $1', [student.brand_id]))).rows[0] : null;

    // Gera senha temporária
    const tempPassword = genTempPassword(8);
    const hash = await bcrypt.hash(tempPassword, 10);
    const upd = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_students SET status='approved', approved_at=NOW(), approved_by=$1, password_hash=$2, must_change_password=true WHERE id=$3
       RETURNING id, status, approved_at`,
      [req.userId || null, hash, student.id]
    ));

    // Envia notificação de forma síncrona (com timeout) para retornar resultado real ao admin
    const baseUrl = appBaseUrl(req);
    const notify = await withTimeout(
      notifyApproval(student, b, baseUrl, tempPassword),
      9000,
      'Notificação de aprovação'
    ).catch((err) => ({
      whatsapp: { success: false, error: err?.message || 'timeout' },
      email: { success: false, error: err?.message || 'timeout' },
    }));

    res.json({ ok: true, temp_password: tempPassword, student: upd.rows[0], notify });
  } catch (e) { console.error('approve', e); res.status(500).json({ error: e?.message || 'Erro ao aprovar' }); }
});


admin.post('/students/:id/reject', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { reason } = req.body || {};
    const r = await runWithEadSchemaRetry(() => query(`UPDATE ead_students SET status='rejected', rejected_reason=$1 WHERE id=$2 RETURNING id`, [reason || null, req.params.id]));
    if (!r.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao rejeitar' }); }
});

admin.post('/students/:id/resend-notification', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const s = await runWithEadSchemaRetry(() => query('SELECT * FROM ead_students WHERE id = $1', [req.params.id]));
    if (!s.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    const student = s.rows[0];
    const b = student.brand_id ? (await runWithEadSchemaRetry(() => query('SELECT * FROM ead_brands WHERE id = $1', [student.brand_id]))).rows[0] : null;

    // Se ainda não trocou a senha (ou nunca teve uma), regera uma temporária para reenviar
    let tempPassword = null;
    if (!student.password_hash || student.must_change_password) {
      tempPassword = genTempPassword(8);
      const hash = await bcrypt.hash(tempPassword, 10);
      await runWithEadSchemaRetry(() => query(
        `UPDATE ead_students SET password_hash=$1, must_change_password=true WHERE id=$2`,
        [hash, student.id]
      ));
    }

    const notify = await withTimeout(notifyApproval(student, b, appBaseUrl(req), tempPassword), 9000, 'Notificação de aprovação').catch((e) => ({
      whatsapp: { success: false, error: e.message || 'Notificação não concluída' },
      email: { success: false, error: e.message || 'Notificação não concluída' },
    }));
    res.json({ ok: true, temp_password: tempPassword, notify });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao reenviar' }); }
});

admin.post('/students/:id/reset-password', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const s = await runWithEadSchemaRetry(() => query('SELECT * FROM ead_students WHERE id = $1', [req.params.id]));
    if (!s.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    const student = s.rows[0];
    const b = student.brand_id ? (await runWithEadSchemaRetry(() => query('SELECT * FROM ead_brands WHERE id = $1', [student.brand_id]))).rows[0] : null;

    const tempPassword = genTempPassword(8);
    const hash = await bcrypt.hash(tempPassword, 10);
    await runWithEadSchemaRetry(() => query(
      `UPDATE ead_students SET password_hash=$1, must_change_password=true WHERE id=$2`,
      [hash, student.id]
    ));

    const notify = await withTimeout(notifyApproval(student, b, appBaseUrl(req), tempPassword), 9000, 'Notificação de reset').catch((e) => ({
      whatsapp: { success: false, error: e.message || 'Notificação não concluída' },
      email: { success: false, error: e.message || 'Notificação não concluída' },
    }));
    res.json({ ok: true, temp_password: tempPassword, notify });
  } catch (e) { console.error('reset-password', e); res.status(500).json({ error: 'Erro ao resetar senha' }); }
});

// ---- Cadastro manual de aluno já aprovado no quiz (prova presencial) ----
// Cria/atualiza aluno como aprovado, matricula no curso, registra tentativa 100%
// e emite certificado. Envia senha por WhatsApp/e-mail.
admin.post('/students/manual-enroll', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    let { name, cpf, email, phone, company, city, state, brand_id, course_id, password, send_notification } = req.body || {};
    name = String(name || '').trim();
    cpf = String(cpf || '').replace(/\D/g, '');
    email = String(email || '').trim().toLowerCase();
    phone = phone ? String(phone).replace(/\D/g, '') : null;

    if (!name || !cpf || !email || !course_id) {
      return res.status(400).json({ error: 'Nome, CPF, e-mail e curso são obrigatórios' });
    }
    if (!isValidCPF(cpf)) return res.status(400).json({ error: 'CPF inválido' });

    const course = await runWithEadSchemaRetry(() => query(
      'SELECT id, title, has_certificate FROM ead_courses WHERE id = $1', [course_id]
    ));
    if (!course.rows.length) return res.status(404).json({ error: 'Curso não encontrado' });

    // Localiza aluno existente por CPF ou e-mail
    const existing = await runWithEadSchemaRetry(() => query(
      'SELECT * FROM ead_students WHERE cpf = $1 OR lower(email) = $2 LIMIT 1', [cpf, email]
    ));

    const tempPassword = (password && String(password).length >= 6)
      ? String(password)
      : genTempPassword(8);
    const hash = await bcrypt.hash(tempPassword, 10);

    let student;
    if (existing.rows.length) {
      const upd = await runWithEadSchemaRetry(() => query(
        `UPDATE ead_students SET
           name = $1,
           email = COALESCE(NULLIF($2,''), email),
           phone = COALESCE(NULLIF($3,''), phone),
           company = COALESCE(NULLIF($4,''), company),
           city = COALESCE(NULLIF($5,''), city),
           state = COALESCE(NULLIF($6,''), state),
           brand_id = COALESCE($7, brand_id),
           status = 'approved',
           approved_at = COALESCE(approved_at, NOW()),
           approved_by = COALESCE(approved_by, $8),
           password_hash = $9,
           must_change_password = true
         WHERE id = $10
         RETURNING *`,
        [name, email, phone, company || '', city || '', state || '', brand_id || null, req.userId || null, hash, existing.rows[0].id]
      ));
      student = upd.rows[0];
    } else {
      const ins = await runWithEadSchemaRetry(() => query(
        `INSERT INTO ead_students (cpf, name, email, phone, password_hash, company, city, state, brand_id, status, approved_at, approved_by, must_change_password)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved',NOW(),$10,true)
         RETURNING *`,
        [cpf, name, email, phone, hash, company || null, city || null, state || null, brand_id || null, req.userId || null]
      ));
      student = ins.rows[0];
    }

    // Matricula como aprovado
    await query(
      `INSERT INTO ead_enrollments (student_id, course_id, status, approved_at)
       VALUES ($1,$2,'approved',NOW())
       ON CONFLICT (student_id, course_id) DO UPDATE SET
         status = 'approved',
         approved_at = COALESCE(ead_enrollments.approved_at, EXCLUDED.approved_at)`,
      [student.id, course_id]
    );

    // Contabiliza tentativa presencial 100%
    const totalQ = await query('SELECT COUNT(*)::int AS n FROM ead_quiz_questions WHERE course_id = $1', [course_id]);
    const totalN = totalQ.rows[0]?.n || 0;
    await query(
      `INSERT INTO ead_attempts (student_id, course_id, score, total, correct, passed, answers)
       VALUES ($1,$2,100,$3,$3,true,$4::jsonb)`,
      [student.id, course_id, totalN, JSON.stringify({ manual: true, source: 'presencial' })]
    );

    // Gera certificado
    let certificate = null;
    if (course.rows[0].has_certificate !== false) {
      try {
        certificate = await generateCertificate(student.id, course_id);
      } catch (e) {
        console.error('manual-enroll cert error', e);
      }
    }

    // Notifica com senha
    let notify = null;
    if (send_notification !== false) {
      const b = student.brand_id ? (await runWithEadSchemaRetry(() => query('SELECT * FROM ead_brands WHERE id = $1', [student.brand_id]))).rows[0] : null;
      notify = await withTimeout(
        notifyApproval(student, b, appBaseUrl(req), tempPassword),
        9000,
        'Notificação de cadastro manual'
      ).catch((err) => ({
        whatsapp: { success: false, error: err?.message || 'timeout' },
        email: { success: false, error: err?.message || 'timeout' },
      }));
    }

    res.json({
      ok: true,
      student: { id: student.id, name: student.name, email: student.email, cpf: student.cpf },
      temp_password: tempPassword,
      certificate,
      notify,
    });
  } catch (e) {
    console.error('manual-enroll', e);
    res.status(500).json({ error: e?.message || 'Erro ao cadastrar aluno manualmente' });
  }
});

// ---- Emitir certificado para aluno JÁ CADASTRADO (prova presencial) ----
admin.post('/students/:id/issue-certificate', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { course_id } = req.body || {};
    if (!course_id) return res.status(400).json({ error: 'course_id obrigatório' });

    const s = await runWithEadSchemaRetry(() => query('SELECT * FROM ead_students WHERE id = $1', [req.params.id]));
    if (!s.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    const student = s.rows[0];

    const c = await query('SELECT id, title, has_certificate FROM ead_courses WHERE id = $1', [course_id]);
    if (!c.rows.length) return res.status(404).json({ error: 'Curso não encontrado' });

    // Se estiver rejeitado/pending, aprova o aluno
    if (student.status !== 'approved') {
      await runWithEadSchemaRetry(() => query(
        `UPDATE ead_students SET status='approved', approved_at=COALESCE(approved_at, NOW()), approved_by=COALESCE(approved_by, $1) WHERE id = $2`,
        [req.userId || null, student.id]
      ));
    }

    // Matricula como aprovado
    await query(
      `INSERT INTO ead_enrollments (student_id, course_id, status, approved_at)
       VALUES ($1,$2,'approved',NOW())
       ON CONFLICT (student_id, course_id) DO UPDATE SET
         status = 'approved',
         approved_at = COALESCE(ead_enrollments.approved_at, EXCLUDED.approved_at)`,
      [student.id, course_id]
    );

    // Se já existe certificado, não duplica — retorna o existente
    const existingCert = await query(
      'SELECT id, pdf_url, issued_at FROM ead_certificates WHERE student_id = $1 AND course_id = $2',
      [student.id, course_id]
    );
    if (existingCert.rows.length) {
      return res.json({ ok: true, certificate: existingCert.rows[0], already: true });
    }

    // Registra tentativa presencial e gera certificado
    const totalQ = await query('SELECT COUNT(*)::int AS n FROM ead_quiz_questions WHERE course_id = $1', [course_id]);
    const totalN = totalQ.rows[0]?.n || 0;
    await query(
      `INSERT INTO ead_attempts (student_id, course_id, score, total, correct, passed, answers)
       VALUES ($1,$2,100,$3,$3,true,$4::jsonb)`,
      [student.id, course_id, totalN, JSON.stringify({ manual: true, source: 'presencial' })]
    );

    let certificate = null;
    if (c.rows[0].has_certificate !== false) {
      certificate = await generateCertificate(student.id, course_id);
    }

    res.json({ ok: true, certificate });
  } catch (e) {
    console.error('issue-certificate', e);
    res.status(500).json({ error: e?.message || 'Erro ao emitir certificado' });
  }
});








admin.patch('/students/:id', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { brand_id } = req.body || {};
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_students SET brand_id=$1 WHERE id=$2 RETURNING id`,
      [brand_id || null, req.params.id]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json({ ok: true });
  } catch (e) { console.error('update student', e); res.status(500).json({ error: 'Erro ao atualizar' }); }
});

// =========================================================================
// BRAND ADMIN AUTH + DASHBOARD (per-brand analytics portal)
// =========================================================================
function signBrandAdmin(a) {
  return jwt.sign(
    { brandAdminId: a.id, brandId: a.brand_id, type: 'ead_brand_admin' },
    SECRET(),
    { expiresIn: '30d' }
  );
}

function brandAdminAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token não fornecido' });
  try {
    const d = jwt.verify(h.slice(7), SECRET());
    if (d.type !== 'ead_brand_admin') return res.status(401).json({ error: 'Token inválido' });
    req.brandAdminId = d.brandAdminId;
    req.brandId = d.brandId;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

router.post('/brand-admin/login', async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { slug, email, password } = req.body || {};
    if (!slug || !email || !password) return res.status(400).json({ error: 'Dados incompletos' });
    const r = await runWithEadSchemaRetry(() => query(
      `SELECT ba.*, b.slug, b.name AS brand_name, b.logo_url, b.primary_color, b.accent_color
         FROM ead_brand_admins ba
         JOIN ead_brands b ON b.id = ba.brand_id
        WHERE b.slug = $1 AND lower(ba.email) = lower($2) AND ba.active = true
        LIMIT 1`,
      [String(slug).toLowerCase(), email]
    ));
    if (!r.rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });
    const a = r.rows[0];
    const ok = await bcrypt.compare(String(password), a.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });
    await query(`UPDATE ead_brand_admins SET last_login_at = NOW() WHERE id = $1`, [a.id]);
    const token = signBrandAdmin(a);
    res.json({
      token,
      admin: {
        id: a.id, name: a.name, email: a.email,
        brand: { id: a.brand_id, slug: a.slug, name: a.brand_name, logo_url: a.logo_url, primary_color: a.primary_color, accent_color: a.accent_color },
      },
    });
  } catch (e) { console.error('brand-admin login', e); res.status(500).json({ error: 'Erro no login' }); }
});

router.get('/brand-admin/me', brandAdminAuth, async (req, res) => {
  const r = await query(
    `SELECT ba.id, ba.name, ba.email, b.id AS brand_id, b.slug, b.name AS brand_name, b.logo_url, b.primary_color, b.accent_color
       FROM ead_brand_admins ba JOIN ead_brands b ON b.id = ba.brand_id WHERE ba.id = $1`,
    [req.brandAdminId]
  );
  if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
  const a = r.rows[0];
  res.json({
    admin: {
      id: a.id, name: a.name, email: a.email,
      brand: { id: a.brand_id, slug: a.slug, name: a.brand_name, logo_url: a.logo_url, primary_color: a.primary_color, accent_color: a.accent_color },
    },
  });
});

router.get('/brand-admin/settings', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const brand = await runWithEadSchemaRetry(() => query(
      `SELECT id, name, organization_id, notify_connection_id, notify_admin_phone, signup_notify_message, notify_admin_recipients
         FROM ead_brands WHERE id = $1 LIMIT 1`,
      [req.brandId]
    ));
    if (!brand.rows.length) return res.status(404).json({ error: 'Marca não encontrada' });
    const b = brand.rows[0];
    const recipients = sanitizeNotifyRecipients(b.notify_admin_recipients);
    if (!recipients.length && b.notify_admin_phone) {
      recipients.push({ name: '', phone: String(b.notify_admin_phone).replace(/\D/g, ''), email: '' });
    }
    let connections = [];
    if (b.organization_id) {
      const c = await query(
        `SELECT id, instance_name, instance_id, phone_number, provider, status
           FROM connections WHERE organization_id = $1
          ORDER BY CASE WHEN status = 'connected' THEN 0 ELSE 1 END, instance_name NULLS LAST, created_at`,
        [b.organization_id]
      );
      connections = c.rows;
    }
    res.json({
      notify_connection_id: b.notify_connection_id,
      notify_admin_phone: b.notify_admin_phone,
      notify_admin_recipients: recipients,
      signup_notify_message: b.signup_notify_message,
      connections,
    });
  } catch (e) { console.error('brand-admin settings', e); res.status(500).json({ error: 'Erro ao carregar configurações' }); }
});

router.patch('/brand-admin/settings', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { notify_connection_id, notify_admin_recipients, signup_notify_message } = req.body || {};
    const brand = await runWithEadSchemaRetry(() => query(
      `SELECT id, organization_id FROM ead_brands WHERE id = $1 LIMIT 1`,
      [req.brandId]
    ));
    if (!brand.rows.length) return res.status(404).json({ error: 'Marca não encontrada' });
    const orgId = brand.rows[0].organization_id;

    const connectionId = notify_connection_id || null;
    if (connectionId) {
      const c = await query('SELECT id FROM connections WHERE id = $1 AND organization_id = $2 LIMIT 1', [connectionId, orgId]);
      if (!c.rows.length) return res.status(400).json({ error: 'Conexão WhatsApp inválida para esta marca' });
    }

    const recipients = sanitizeNotifyRecipients(notify_admin_recipients);
    const firstPhone = recipients.find(r => r.phone)?.phone || null;
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brands SET
         notify_connection_id = $1,
         notify_admin_phone = $2,
         notify_admin_recipients = $3::jsonb,
         signup_notify_message = $4,
         updated_at = NOW()
       WHERE id = $5
       RETURNING notify_connection_id, notify_admin_phone, notify_admin_recipients, signup_notify_message`,
      [connectionId, firstPhone, JSON.stringify(recipients), signup_notify_message || null, req.brandId]
    ));
    res.json({ ok: true, settings: r.rows[0] });
  } catch (e) { console.error('brand-admin save settings', e); res.status(500).json({ error: 'Erro ao salvar configurações' }); }
});

router.get('/brand-admin/dashboard', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const brandId = req.brandId;

    // Optional date filters (YYYY-MM-DD). Default: no filter.
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const company = req.query.company ? String(req.query.company).trim() : null;
    const city = req.query.city ? String(req.query.city).trim() : null;
    const dateOk = (d) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!dateOk(from) || !dateOk(to)) return res.status(400).json({ error: 'Data inválida' });

    // Build filter fragments for each table alias (s = students, a = attempts)
    const params = [brandId];
    let sFilter = '';
    let aFilter = '';
    if (from) { params.push(from); sFilter += ` AND s.created_at >= $${params.length}::date`; aFilter += ` AND a.created_at >= $${params.length}::date`; }
    if (to)   { params.push(to);   sFilter += ` AND s.created_at <  ($${params.length}::date + INTERVAL '1 day')`; aFilter += ` AND a.created_at <  ($${params.length}::date + INTERVAL '1 day')`; }
    if (company) {
      params.push(company);
      const frag = ` AND COALESCE(NULLIF(TRIM(s.company), ''), 'Sem empresa') = $${params.length}`;
      sFilter += frag;
      aFilter += frag;
    }
    if (city) {
      params.push(city);
      const frag = ` AND COALESCE(NULLIF(TRIM(s.city), ''), 'Sem cidade') = $${params.length}`;
      sFilter += frag;
      aFilter += frag;
    }
    const hasFilter = !!(from || to || company || city);


    const [students, courses, certs, attempts, monthly, topCourses, topStudents, recent, pending, companies, allCompanies, cities] = await Promise.all([
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE s.status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE s.status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE s.status = 'rejected')::int AS rejected,
          COUNT(*) FILTER (WHERE s.created_at >= NOW() - INTERVAL '30 days')::int AS last30
        FROM ead_students s WHERE s.brand_id = $1${sFilter}`, params),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE published)::int AS published
        FROM ead_courses WHERE brand_id = $1`, [brandId]),
      query(`SELECT COUNT(*)::int AS total
         FROM ead_certificates c
         JOIN ead_students s ON s.id = c.student_id
        WHERE s.brand_id = $1${sFilter}`, params),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE a.passed)::int AS passed,
          COALESCE(AVG(a.score),0)::float AS avg_score,
          COALESCE(AVG(CASE WHEN a.passed THEN 1.0 ELSE 0.0 END)*100,0)::float AS pass_rate
         FROM ead_attempts a
         JOIN ead_students s ON s.id = a.student_id
        WHERE s.brand_id = $1${aFilter}`, params),
      query(`SELECT to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS signups,
                COUNT(*) FILTER (WHERE s.status='approved')::int AS approved
         FROM ead_students s
        WHERE s.brand_id = $1 ${hasFilter ? sFilter : `AND s.created_at >= NOW() - INTERVAL '6 months'`}
        GROUP BY 1 ORDER BY 1`, hasFilter ? params : [brandId]),
      query(`SELECT c.id, c.title,
                COUNT(DISTINCT a.student_id)::int AS students_attempted,
                COUNT(DISTINCT CASE WHEN a.passed THEN a.student_id END)::int AS students_passed,
                COALESCE(AVG(a.score),0)::float AS avg_score
           FROM ead_courses c
           LEFT JOIN ead_attempts a ON a.course_id = c.id
           LEFT JOIN ead_students s ON s.id = a.student_id
          WHERE c.brand_id = $1 ${hasFilter ? `AND (a.id IS NULL OR (1=1 ${aFilter}))` : ''}
          GROUP BY c.id, c.title
          ORDER BY students_attempted DESC NULLS LAST
          LIMIT 8`, params),

      query(`SELECT s.id, s.name, s.email, s.company,
                COUNT(DISTINCT cert.course_id)::int AS certificates,
                COALESCE(AVG(a.score),0)::float AS avg_score
           FROM ead_students s
           LEFT JOIN ead_certificates cert ON cert.student_id = s.id
           LEFT JOIN ead_attempts a ON a.student_id = s.id
          WHERE s.brand_id = $1 AND s.status = 'approved'${sFilter}
          GROUP BY s.id, s.name, s.email, s.company
          ORDER BY certificates DESC, avg_score DESC
          LIMIT 10`, params),
      query(`SELECT s.id, s.name, s.email, s.status, s.created_at, s.approved_at, s.city, s.state, s.company
           FROM ead_students s WHERE s.brand_id = $1${sFilter}
           ORDER BY s.created_at DESC LIMIT 10`, params),
      query(`SELECT s.id, s.name, s.email, s.phone, s.cpf, s.created_at, s.city, s.state, s.company
           FROM ead_students s WHERE s.brand_id = $1 AND s.status = 'pending'${sFilter}
           ORDER BY s.created_at DESC LIMIT 100`, params),
      query(`SELECT
                COALESCE(NULLIF(TRIM(s.company), ''), 'Sem empresa') AS company,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE s.status='approved')::int AS approved,
                COUNT(*) FILTER (WHERE s.status='pending')::int AS pending,
                COUNT(*) FILTER (WHERE s.status='rejected')::int AS rejected,
                MAX(s.city) AS city,
                MAX(s.state) AS state,
                MAX(s.created_at) AS last_signup
           FROM ead_students s
          WHERE s.brand_id = $1${sFilter}
          GROUP BY COALESCE(NULLIF(TRIM(s.company), ''), 'Sem empresa')
          ORDER BY total DESC, approved DESC
          LIMIT 50`, params),
      query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(s.company), ''), 'Sem empresa') AS company
           FROM ead_students s
          WHERE s.brand_id = $1
          ORDER BY 1`, [brandId]),
      query(`SELECT DISTINCT COALESCE(NULLIF(TRIM(s.city), ''), 'Sem cidade') AS city
           FROM ead_students s
          WHERE s.brand_id = $1
          ORDER BY 1`, [brandId]),
    ]);
    res.json({
      students: students.rows[0],
      courses: courses.rows[0],
      certificates: certs.rows[0].total,
      attempts: attempts.rows[0],
      monthly: monthly.rows,
      top_courses: topCourses.rows,
      top_students: topStudents.rows,
      recent_students: recent.rows,
      pending_students: pending.rows,
      companies: companies.rows,
      all_companies: allCompanies.rows.map(r => r.company),
      all_cities: cities.rows.map(r => r.city),
      filter: { from, to, company, city },
    });

  } catch (e) { console.error('brand-admin dashboard', e); res.status(500).json({ error: 'Erro ao carregar' }); }
});

// ---- Brand Admin: approve / reject pending students (scoped to own brand) ----
router.get('/brand-admin/students/pending', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const params = [req.brandId];
    let where = `s.brand_id = $1 AND s.status = 'pending'`;
    if (req.query.company) { params.push(String(req.query.company).trim()); where += ` AND COALESCE(NULLIF(TRIM(s.company),''),'Sem empresa') = $${params.length}`; }
    if (req.query.city)    { params.push(String(req.query.city).trim());    where += ` AND COALESCE(NULLIF(TRIM(s.city),''),'Sem cidade') = $${params.length}`; }
    const r = await runWithEadSchemaRetry(() => query(
      `SELECT s.id, s.name, s.cpf, s.email, s.phone, s.company, s.city, s.state, s.extra_fields, s.created_at
         FROM ead_students s WHERE ${where} ORDER BY s.created_at DESC`,
      params
    ));
    res.json(r.rows);
  } catch (e) { console.error('ba pending', e); res.status(500).json({ error: 'Erro ao carregar pendências' }); }
});

router.post('/brand-admin/students/:id/approve', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const s = await runWithEadSchemaRetry(() => query(
      'SELECT * FROM ead_students WHERE id = $1 AND brand_id = $2', [req.params.id, req.brandId]
    ));
    if (!s.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    const student = s.rows[0];
    if (student.status === 'approved') return res.status(400).json({ error: 'Já aprovado', already: true });
    const b = (await runWithEadSchemaRetry(() => query('SELECT * FROM ead_brands WHERE id = $1', [req.brandId]))).rows[0];

    const tempPassword = genTempPassword(8);
    const hash = await bcrypt.hash(tempPassword, 10);
    const upd = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_students SET status='approved', approved_at=NOW(), password_hash=$1, must_change_password=true WHERE id=$2
       RETURNING id, status, approved_at`,
      [hash, student.id]
    ));

    const baseUrl = appBaseUrl(req);
    const notify = await withTimeout(
      notifyApproval(student, b, baseUrl, tempPassword),
      9000,
      'Notificação de aprovação'
    ).catch((err) => ({
      whatsapp: { success: false, error: err?.message || 'timeout' },
      email: { success: false, error: err?.message || 'timeout' },
    }));
    res.json({ ok: true, temp_password: tempPassword, student: upd.rows[0], notify });
  } catch (e) { console.error('ba approve', e); res.status(500).json({ error: e?.message || 'Erro ao aprovar' }); }
});

router.post('/brand-admin/students/:id/reject', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { reason } = req.body || {};
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_students SET status='rejected', rejected_reason=$1
        WHERE id=$2 AND brand_id=$3 RETURNING id`,
      [reason || null, req.params.id, req.brandId]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json({ ok: true });
  } catch (e) { console.error('ba reject', e); res.status(500).json({ error: 'Erro ao rejeitar' }); }
});




// ---- Superadmin CRUD for brand admins (managed via internal auth)
admin.get('/brands/:id/admins', gate('can_view_ead'), async (req, res) => {
  await ensureEadApprovalSchema();
  const r = await runWithEadSchemaRetry(() => query(
    `SELECT id, name, email, active, last_login_at, created_at
       FROM ead_brand_admins WHERE brand_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  ));
  res.json(r.rows);
});

admin.post('/brands/:id/admins', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { name, email, password } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
    const pass = password && String(password).length >= 6 ? String(password) : genTempPassword(10);
    const hash = await bcrypt.hash(pass, 10);
    const r = await runWithEadSchemaRetry(() => query(
      `INSERT INTO ead_brand_admins (brand_id, name, email, password_hash)
       VALUES ($1,$2,$3,$4) RETURNING id, name, email, active, created_at`,
      [req.params.id, name, email, hash]
    ));
    res.status(201).json({ ...r.rows[0], temp_password: pass });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'E-mail já cadastrado para esta marca' });
    console.error(e); res.status(500).json({ error: 'Erro ao criar administrador' });
  }
});

admin.patch('/brand-admins/:id', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { name, email, active, password } = req.body || {};
    let hash = null;
    if (password && String(password).length >= 6) hash = await bcrypt.hash(String(password), 10);
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brand_admins SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         active = COALESCE($3, active),
         password_hash = COALESCE($4, password_hash)
       WHERE id = $5 RETURNING id, name, email, active`,
      [name ?? null, email ?? null, typeof active === 'boolean' ? active : null, hash, req.params.id]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'E-mail já cadastrado para esta marca' });
    console.error(e); res.status(500).json({ error: 'Erro ao atualizar' });
  }
});

admin.post('/brand-admins/:id/reset-password', gate('can_manage_ead'), async (req, res) => {
  try {
    const pass = genTempPassword(10);
    const hash = await bcrypt.hash(pass, 10);
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brand_admins SET password_hash=$1 WHERE id=$2 RETURNING id`,
      [hash, req.params.id]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true, temp_password: pass });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao resetar senha' }); }
});

admin.delete('/brand-admins/:id', gate('can_manage_ead'), async (req, res) => {
  await runWithEadSchemaRetry(() => query('DELETE FROM ead_brand_admins WHERE id = $1', [req.params.id]));
  res.json({ ok: true });
});

// =========================================================================
// BRAND CATALOGS — categorias + catálogos (galeria de imagens ou PDF)
// =========================================================================

// Multer para upload de imagens/PDF do brand-admin
const _catalogUploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(_catalogUploadsDir)) fs.mkdirSync(_catalogUploadsDir, { recursive: true });
const catalogUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, _catalogUploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '';
      cb(null, `catalog-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
});

function catalogFileUrl(filename) {
  const base = process.env.API_BASE_URL || '';
  return `${base}/uploads/${filename}`;
}

// ---- Upload endpoint (brand-admin auth) — retorna { url }
// Imagens são convertidas para WebP (qualidade otimizada) para melhor performance.
router.post('/brand-admin/catalog-upload', brandAdminAuth, catalogUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  try {
    const mime = String(req.file.mimetype || '').toLowerCase();
    const isImage = mime.startsWith('image/') && !mime.includes('svg') && !mime.includes('gif');
    if (isImage) {
      const srcPath = path.join(_catalogUploadsDir, req.file.filename);
      const webpName = `catalog-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
      const outPath = path.join(_catalogUploadsDir, webpName);
      await sharp(srcPath, { failOn: 'none' })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toFile(outPath);
      try { fs.unlinkSync(srcPath); } catch {}
      const stat = fs.statSync(outPath);
      return res.json({ url: catalogFileUrl(webpName), filename: webpName, size: stat.size, mimetype: 'image/webp' });
    }
    // Não-imagens (PDF etc.) mantêm o arquivo original
    return res.json({ url: catalogFileUrl(req.file.filename), filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) {
    console.error('[ead catalog upload] webp convert failed', err);
    // Fallback: entrega o original se conversão falhar
    return res.json({ url: catalogFileUrl(req.file.filename), filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  }
});

// ---- Categorias
router.get('/brand-admin/catalog-categories', brandAdminAuth, async (req, res) => {
  await ensureEadApprovalSchema();
  const r = await runWithEadSchemaRetry(() => query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM ead_brand_catalogs bc WHERE bc.category_id = c.id) AS catalog_count
       FROM ead_brand_catalog_categories c
      WHERE c.brand_id = $1 ORDER BY c.order_index, c.created_at`,
    [req.brandId]
  ));
  res.json(r.rows);
});

router.post('/brand-admin/catalog-categories', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { name, description, order_index } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const r = await runWithEadSchemaRetry(() => query(
      `INSERT INTO ead_brand_catalog_categories (brand_id, name, description, order_index)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.brandId, String(name).trim(), description || null, Number.isFinite(+order_index) ? +order_index : 0]
    ));
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

router.patch('/brand-admin/catalog-categories/:id', brandAdminAuth, async (req, res) => {
  try {
    const { name, description, order_index } = req.body || {};
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brand_catalog_categories SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         order_index = COALESCE($3, order_index)
       WHERE id = $4 AND brand_id = $5 RETURNING *`,
      [name ?? null, description ?? null, Number.isFinite(+order_index) ? +order_index : null, req.params.id, req.brandId]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar' }); }
});

router.delete('/brand-admin/catalog-categories/:id', brandAdminAuth, async (req, res) => {
  await runWithEadSchemaRetry(() => query(
    'DELETE FROM ead_brand_catalog_categories WHERE id = $1 AND brand_id = $2',
    [req.params.id, req.brandId]
  ));
  res.json({ ok: true });
});

// ---- Catálogos
router.get('/brand-admin/catalogs', brandAdminAuth, async (req, res) => {
  await ensureEadApprovalSchema();
  const params = [req.brandId];
  let where = 'WHERE bc.brand_id = $1';
  if (req.query.category_id) {
    params.push(req.query.category_id);
    where += ` AND bc.category_id = $${params.length}`;
  }
  const r = await runWithEadSchemaRetry(() => query(
    `SELECT bc.*, cat.name AS category_name
       FROM ead_brand_catalogs bc
       LEFT JOIN ead_brand_catalog_categories cat ON cat.id = bc.category_id
       ${where}
       ORDER BY bc.order_index, bc.created_at DESC`,
    params
  ));
  res.json(r.rows);
});

function sanitizeImages(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(x => x && typeof x.url === 'string').map((x, i) => ({
    url: String(x.url),
    title: x.title ? String(x.title).slice(0, 200) : null,
    order: Number.isFinite(+x.order) ? +x.order : i,
  })).sort((a, b) => a.order - b.order);
}

router.post('/brand-admin/catalogs', brandAdminAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { title, description, category_id, type, cover_url, images, pdf_url, order_index, active } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Título obrigatório' });
    const t = type === 'pdf' ? 'pdf' : 'gallery';
    if (t === 'pdf' && !pdf_url) return res.status(400).json({ error: 'Arquivo PDF obrigatório' });
    if (t === 'gallery' && (!Array.isArray(images) || images.length === 0)) return res.status(400).json({ error: 'Adicione ao menos uma imagem' });
    const r = await runWithEadSchemaRetry(() => query(
      `INSERT INTO ead_brand_catalogs
         (brand_id, category_id, title, description, type, cover_url, images, pdf_url, order_index, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10) RETURNING *`,
      [req.brandId, category_id || null, String(title).trim(), description || null, t,
       cover_url || null, JSON.stringify(sanitizeImages(images)), pdf_url || null,
       Number.isFinite(+order_index) ? +order_index : 0, active !== false]
    ));
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar catálogo' }); }
});

router.patch('/brand-admin/catalogs/:id', brandAdminAuth, async (req, res) => {
  try {
    const { title, description, category_id, type, cover_url, images, pdf_url, order_index, active } = req.body || {};
    const hasCategory = Object.prototype.hasOwnProperty.call(req.body || {}, 'category_id');
    const hasImages = Object.prototype.hasOwnProperty.call(req.body || {}, 'images');
    const t = type === 'pdf' ? 'pdf' : type === 'gallery' ? 'gallery' : null;
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brand_catalogs SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category_id = CASE WHEN $10::boolean THEN $3 ELSE category_id END,
         type = COALESCE($4, type),
         cover_url = COALESCE($5, cover_url),
         images = CASE WHEN $11::boolean THEN $6::jsonb ELSE images END,
         pdf_url = COALESCE($7, pdf_url),
         order_index = COALESCE($8, order_index),
         active = COALESCE($9, active),
         updated_at = NOW()
       WHERE id = $12 AND brand_id = $13 RETURNING *`,
      [
        title ?? null, description ?? null, category_id || null, t,
        cover_url ?? null, hasImages ? JSON.stringify(sanitizeImages(images)) : null,
        pdf_url ?? null, Number.isFinite(+order_index) ? +order_index : null,
        typeof active === 'boolean' ? active : null,
        hasCategory, hasImages, req.params.id, req.brandId,
      ]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar' }); }
});

router.delete('/brand-admin/catalogs/:id', brandAdminAuth, async (req, res) => {
  await runWithEadSchemaRetry(() => query(
    'DELETE FROM ead_brand_catalogs WHERE id = $1 AND brand_id = $2',
    [req.params.id, req.brandId]
  ));
  res.json({ ok: true });
});

// =========================================================================
// STUDENT — listar catálogos da marca + baixar galeria como PDF
// =========================================================================
router.get('/my/catalogs', studentAuth, async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const s = await query('SELECT brand_id FROM ead_students WHERE id = $1', [req.studentId]);
    const brandId = s.rows[0]?.brand_id || null;

    // Global (brand_id IS NULL e sem extras) OU marca principal do aluno OU extras contêm marca do aluno
    const visClause = brandId
      ? `(brand_id IS NULL OR brand_id = $1 OR $1 = ANY(COALESCE(extra_brand_ids, '{}'::uuid[])))`
      : `(brand_id IS NULL)`;

    const cats = await runWithEadSchemaRetry(() => query(
      `SELECT id, name, description, order_index, brand_id, extra_brand_ids
         FROM ead_brand_catalog_categories
        WHERE ${visClause}
        ORDER BY order_index, created_at`,
      brandId ? [brandId] : []
    ));
    const catalogs = await runWithEadSchemaRetry(() => query(
      `SELECT id, category_id, title, description, type, cover_url, images, pdf_url, order_index, brand_id, extra_brand_ids
         FROM ead_brand_catalogs
        WHERE active = true AND ${visClause}
        ORDER BY order_index, created_at DESC`,
      brandId ? [brandId] : []
    ));
    const byCat = new Map();
    for (const c of cats.rows) byCat.set(c.id, { ...c, items: [] });
    const uncategorized = [];
    for (const it of catalogs.rows) {
      if (it.category_id && byCat.has(it.category_id)) byCat.get(it.category_id).items.push(it);
      else uncategorized.push(it);
    }
    res.json({ categories: Array.from(byCat.values()), uncategorized });
  } catch (e) { console.error('my/catalogs', e); res.status(500).json({ error: 'Erro ao carregar catálogos' }); }
});

router.get('/my/catalogs/:id', studentAuth, async (req, res) => {
  try {
    const s = await query('SELECT brand_id FROM ead_students WHERE id = $1', [req.studentId]);
    const brandId = s.rows[0]?.brand_id || null;
    const visClause = brandId
      ? `(bc.brand_id IS NULL OR bc.brand_id = $2 OR $2 = ANY(COALESCE(bc.extra_brand_ids, '{}'::uuid[])))`
      : `(bc.brand_id IS NULL)`;
    const r = await runWithEadSchemaRetry(() => query(
      `SELECT bc.*, cat.name AS category_name
         FROM ead_brand_catalogs bc
         LEFT JOIN ead_brand_catalog_categories cat ON cat.id = bc.category_id
        WHERE bc.id = $1 AND bc.active = true AND ${visClause}`,
      brandId ? [req.params.id, brandId] : [req.params.id]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro' }); }
});

// Gera PDF da galeria on-the-fly (uma imagem por página) e faz streaming
router.get('/my/catalogs/:id/pdf', studentAuth, async (req, res) => {
  try {
    const s = await query('SELECT brand_id FROM ead_students WHERE id = $1', [req.studentId]);
    const brandId = s.rows[0]?.brand_id || null;
    const r = await runWithEadSchemaRetry(() => query(
      `SELECT title, type, images, pdf_url FROM ead_brand_catalogs
        WHERE id = $1 AND active = true
          AND (brand_id IS NULL ${brandId ? 'OR brand_id = $2' : ''})`,
      brandId ? [req.params.id, brandId] : [req.params.id]
    ));
    const cat = r.rows[0];
    if (!cat) return res.status(404).json({ error: 'Não encontrado' });

    // Se já for PDF, redireciona
    if (cat.type === 'pdf' && cat.pdf_url) return res.redirect(cat.pdf_url);

    const imgs = Array.isArray(cat.images) ? cat.images : [];
    if (!imgs.length) return res.status(400).json({ error: 'Catálogo sem imagens' });

    const pdfDoc = await PDFDocument.create();
    for (const im of imgs) {
      try {
        let bytes;
        const url = String(im.url || '');
        if (url.startsWith('http')) {
          const rr = await fetch(url);
          bytes = Buffer.from(await rr.arrayBuffer());
        } else {
          const local = path.join(process.cwd(), url.replace(/^\/uploads\//, 'uploads/'));
          if (fs.existsSync(local)) bytes = fs.readFileSync(local);
        }
        if (!bytes) continue;
        let img;
        // Normaliza para JPEG (pdf-lib não suporta webp nativamente)
        try {
          const jpg = await sharp(bytes, { failOn: 'none' }).rotate().jpeg({ quality: 85 }).toBuffer();
          img = await pdfDoc.embedJpg(jpg);
        } catch {
          try { img = await pdfDoc.embedJpg(bytes); }
          catch { try { img = await pdfDoc.embedPng(bytes); } catch { continue; } }
        }
        // A4 landscape/portrait dinâmico conforme proporção
        const isLandscape = img.width >= img.height;
        const pageW = isLandscape ? 842 : 595;
        const pageH = isLandscape ? 595 : 842;
        const page = pdfDoc.addPage([pageW, pageH]);
        const scale = Math.min(pageW / img.width, pageH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      } catch (e) { console.error('img fail', e); }
    }

    const bytes = await pdfDoc.save();
    const safeName = String(cat.title || 'catalogo').replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 60);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    res.send(Buffer.from(bytes));
  } catch (e) { console.error('catalog pdf', e); res.status(500).json({ error: 'Erro ao gerar PDF' }); }
});

// =========================================================================
// SUPERADMIN — catálogos globais (com opção de vincular a uma marca)
// =========================================================================
admin.post('/catalog-upload', gate('can_manage_ead'), catalogUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
  try {
    const mime = String(req.file.mimetype || '').toLowerCase();
    const isImage = mime.startsWith('image/') && !mime.includes('svg') && !mime.includes('gif');
    if (isImage) {
      const srcPath = path.join(_catalogUploadsDir, req.file.filename);
      const webpName = `catalog-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
      const outPath = path.join(_catalogUploadsDir, webpName);
      await sharp(srcPath, { failOn: 'none' })
        .rotate()
        .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 4 })
        .toFile(outPath);
      try { fs.unlinkSync(srcPath); } catch {}
      const stat = fs.statSync(outPath);
      return res.json({ url: catalogFileUrl(webpName), filename: webpName, size: stat.size, mimetype: 'image/webp' });
    }
    return res.json({ url: catalogFileUrl(req.file.filename), filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) {
    console.error('[ead admin catalog upload] webp convert failed', err);
    return res.json({ url: catalogFileUrl(req.file.filename), filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  }
});

admin.get('/catalog-categories', gate('can_view_ead'), async (req, res) => {
  await ensureEadApprovalSchema();
  const r = await runWithEadSchemaRetry(() => query(
    `SELECT c.*, b.name AS brand_name,
            (SELECT COUNT(*)::int FROM ead_brand_catalogs bc WHERE bc.category_id = c.id) AS catalog_count
       FROM ead_brand_catalog_categories c
       LEFT JOIN ead_brands b ON b.id = c.brand_id
       ORDER BY c.order_index, c.created_at`
  ));
  res.json(r.rows);
});

admin.post('/catalog-categories', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { name, description, order_index, brand_id } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const r = await runWithEadSchemaRetry(() => query(
      `INSERT INTO ead_brand_catalog_categories (brand_id, name, description, order_index)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [brand_id || null, String(name).trim(), description || null, Number.isFinite(+order_index) ? +order_index : 0]
    ));
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar categoria' }); }
});

admin.patch('/catalog-categories/:id', gate('can_manage_ead'), async (req, res) => {
  try {
    const { name, description, order_index, brand_id } = req.body || {};
    const hasBrand = Object.prototype.hasOwnProperty.call(req.body || {}, 'brand_id');
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brand_catalog_categories SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         order_index = COALESCE($3, order_index),
         brand_id = CASE WHEN $5::boolean THEN $4 ELSE brand_id END
       WHERE id = $6 RETURNING *`,
      [name ?? null, description ?? null, Number.isFinite(+order_index) ? +order_index : null,
       brand_id || null, hasBrand, req.params.id]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar' }); }
});

admin.delete('/catalog-categories/:id', gate('can_manage_ead'), async (req, res) => {
  await runWithEadSchemaRetry(() => query('DELETE FROM ead_brand_catalog_categories WHERE id = $1', [req.params.id]));
  res.json({ ok: true });
});

admin.get('/catalogs', gate('can_view_ead'), async (req, res) => {
  await ensureEadApprovalSchema();
  const params = [];
  const where = [];
  if (req.query.category_id) { params.push(req.query.category_id); where.push(`bc.category_id = $${params.length}`); }
  if (req.query.brand_id === '__global__') where.push('bc.brand_id IS NULL');
  else if (req.query.brand_id) {
    params.push(req.query.brand_id);
    where.push(`(bc.brand_id = $${params.length} OR $${params.length} = ANY(COALESCE(bc.extra_brand_ids, '{}'::uuid[])))`);
  }
  const r = await runWithEadSchemaRetry(() => query(
    `SELECT bc.*, cat.name AS category_name, b.name AS brand_name,
            COALESCE((
              SELECT array_agg(eb.name)
                FROM unnest(COALESCE(bc.extra_brand_ids, '{}'::uuid[])) x
                JOIN ead_brands eb ON eb.id = x
            ), '{}'::text[]) AS extra_brand_names
       FROM ead_brand_catalogs bc
       LEFT JOIN ead_brand_catalog_categories cat ON cat.id = bc.category_id
       LEFT JOIN ead_brands b ON b.id = bc.brand_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY bc.order_index, bc.created_at DESC`,
    params
  ));
  res.json(r.rows);
});

admin.post('/catalogs', gate('can_manage_ead'), async (req, res) => {
  try {
    await ensureEadApprovalSchema();
    const { title, description, category_id, type, cover_url, images, pdf_url, order_index, active, brand_id, extra_brand_ids } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Título obrigatório' });
    const t = type === 'pdf' ? 'pdf' : 'gallery';
    if (t === 'pdf' && !pdf_url) return res.status(400).json({ error: 'Arquivo PDF obrigatório' });
    if (t === 'gallery' && (!Array.isArray(images) || images.length === 0)) return res.status(400).json({ error: 'Adicione ao menos uma imagem' });
    const extras = Array.isArray(extra_brand_ids) ? extra_brand_ids.filter(Boolean) : [];
    const r = await runWithEadSchemaRetry(() => query(
      `INSERT INTO ead_brand_catalogs
         (brand_id, category_id, title, description, type, cover_url, images, pdf_url, order_index, active, extra_brand_ids)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::uuid[]) RETURNING *`,
      [brand_id || null, category_id || null, String(title).trim(), description || null, t,
       cover_url || null, JSON.stringify(sanitizeImages(images)), pdf_url || null,
       Number.isFinite(+order_index) ? +order_index : 0, active !== false, extras]
    ));
    res.status(201).json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao criar catálogo' }); }
});

admin.patch('/catalogs/:id', gate('can_manage_ead'), async (req, res) => {
  try {
    const { title, description, category_id, type, cover_url, images, pdf_url, order_index, active, brand_id, extra_brand_ids } = req.body || {};
    const hasCategory = Object.prototype.hasOwnProperty.call(req.body || {}, 'category_id');
    const hasImages = Object.prototype.hasOwnProperty.call(req.body || {}, 'images');
    const hasBrand = Object.prototype.hasOwnProperty.call(req.body || {}, 'brand_id');
    const hasExtras = Object.prototype.hasOwnProperty.call(req.body || {}, 'extra_brand_ids');
    const extras = Array.isArray(extra_brand_ids) ? extra_brand_ids.filter(Boolean) : [];
    const t = type === 'pdf' ? 'pdf' : type === 'gallery' ? 'gallery' : null;
    const r = await runWithEadSchemaRetry(() => query(
      `UPDATE ead_brand_catalogs SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         category_id = CASE WHEN $10::boolean THEN $3 ELSE category_id END,
         type = COALESCE($4, type),
         cover_url = COALESCE($5, cover_url),
         images = CASE WHEN $11::boolean THEN $6::jsonb ELSE images END,
         pdf_url = COALESCE($7, pdf_url),
         order_index = COALESCE($8, order_index),
         active = COALESCE($9, active),
         brand_id = CASE WHEN $13::boolean THEN $14 ELSE brand_id END,
         extra_brand_ids = CASE WHEN $15::boolean THEN $16::uuid[] ELSE extra_brand_ids END,
         updated_at = NOW()
       WHERE id = $12 RETURNING *`,
      [
        title ?? null, description ?? null, category_id || null, t,
        cover_url ?? null, hasImages ? JSON.stringify(sanitizeImages(images)) : null,
        pdf_url ?? null, Number.isFinite(+order_index) ? +order_index : null,
        typeof active === 'boolean' ? active : null,
        hasCategory, hasImages, req.params.id, hasBrand, brand_id || null,
        hasExtras, extras,
      ]
    ));
    if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
    res.json(r.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Erro ao atualizar' }); }
});

admin.delete('/catalogs/:id', gate('can_manage_ead'), async (req, res) => {
  await runWithEadSchemaRetry(() => query('DELETE FROM ead_brand_catalogs WHERE id = $1', [req.params.id]));
  res.json({ ok: true });
});

router.use('/admin', admin);

export default router;

