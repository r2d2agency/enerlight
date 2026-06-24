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
    const { password_hash, ...student } = s;
    res.json({ student, token: signStudent(s) });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'Erro ao entrar' });
  }
});

router.get('/auth/me', studentAuth, async (req, res) => {
  const r = await query('SELECT id, cpf, name, email, company, city, state, created_at FROM ead_students WHERE id = $1', [req.studentId]);
  if (!r.rows.length) return res.status(404).json({ error: 'Não encontrado' });
  res.json({ student: r.rows[0] });
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

router.use('/admin', admin);

export default router;
