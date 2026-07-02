-- EAD Module: Cursos, aulas, quiz e certificados para instaladores
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
CREATE INDEX IF NOT EXISTS idx_ead_students_email ON ead_students(lower(email));

CREATE TABLE IF NOT EXISTS ead_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  cover_url TEXT,
  published BOOLEAN DEFAULT false,
  has_certificate BOOLEAN DEFAULT true,
  passing_score INT DEFAULT 100,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ead_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ead_modules_course ON ead_modules(course_id);

CREATE TABLE IF NOT EXISTS ead_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  module_id UUID REFERENCES ead_modules(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  youtube_url TEXT NOT NULL,
  description TEXT,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ead_lessons_course ON ead_lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_ead_lessons_module ON ead_lessons(module_id);

CREATE TABLE IF NOT EXISTS ead_manuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  cover_url TEXT,
  file_url TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ead_manuals_course ON ead_manuals(course_id);

CREATE TABLE IF NOT EXISTS ead_quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ead_quiz_questions_course ON ead_quiz_questions(course_id);

CREATE TABLE IF NOT EXISTS ead_quiz_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES ead_quiz_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ead_quiz_options_question ON ead_quiz_options(question_id);

CREATE TABLE IF NOT EXISTS ead_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES ead_students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  status VARCHAR(40) DEFAULT 'in_progress',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

CREATE TABLE IF NOT EXISTS ead_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES ead_students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  score NUMERIC(6,2) DEFAULT 0,
  total INT DEFAULT 0,
  correct INT DEFAULT 0,
  passed BOOLEAN DEFAULT false,
  answers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ead_attempts_sc ON ead_attempts(student_id, course_id);

CREATE TABLE IF NOT EXISTS ead_certificate_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID UNIQUE NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  image_url TEXT,
  width INT,
  height INT,
  fields JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ead_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES ead_students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES ead_courses(id) ON DELETE CASCADE,
  pdf_url TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_ead_certificates_student ON ead_certificates(student_id);

-- Brand Admin Portal (per-brand analytics dashboard login)
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
