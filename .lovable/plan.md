## Sistema EAD - Cursos, Provas e Certificados

Plataforma de ensino para instaladores/empresas com cursos em vídeo (YouTube embed), quiz de avaliação e geração automática de certificado em PDF.

---

### 1. Fluxo do Instalador (área pública/autenticada)

**Cadastro/Login dedicado** (`/ead/login` e `/ead/cadastro`):
- Campos obrigatórios: CPF, Nome, Email, Senha, Empresa, Cidade, Estado
- Validação de CPF (algoritmo) e email
- Login separado dos usuários internos do sistema

**Catálogo de Cursos** (`/ead`):
- Lista de cursos publicados (ex: "RedBar", "Curso X")
- Cada card mostra: capa, título, descrição, nº de aulas, status (não iniciado / em andamento / aprovado com selo)

**Página do Curso** (`/ead/curso/:id`):
- Lista de aulas em ordem; player embed do YouTube (assistido dentro da plataforma, sem sair)
- Marcação de aula concluída
- Botão "Fazer Prova" liberado após assistir todas (ou sempre, conforme config do curso)

**Prova/Quiz** (`/ead/curso/:id/prova`):
- Perguntas com alternativas (múltipla escolha, 1 correta)
- Tentativas ilimitadas até atingir 100%
- Resultado imediato com gabarito
- Ao acertar 100%: selo "Aprovado", prova desabilitada, certificado gerado automaticamente

**Meus Certificados** (`/ead/certificados`):
- Lista de certificados aprovados
- Download em PDF

---

### 2. Geração de Certificado

**Admin faz upload de template PNG** do certificado.
**Editor visual** (admin): arrasta os campos sobre a imagem para posicionar:
- `{{nome}}`, `{{cpf}}`, `{{empresa}}`, `{{curso}}`, `{{data_conclusao}}`, `{{cidade_estado}}`
- Define fonte, tamanho, cor e coordenadas (x,y) de cada campo

**Geração**: quando aluno é aprovado, backend monta o PDF usando o template + posições + dados do aluno (pdf-lib ou pdfkit no Node, ou jspdf no front). Salva o PDF em `/uploads/certificates/` e referencia em `ead_certificates`.

---

### 3. Admin EAD (`/admin/ead`)

Visível para perfis com permissão "EAD - Gerenciar":

**Aba Cursos**: CRUD de cursos + aulas (título, descrição, link YouTube, ordem)
**Aba Provas**: CRUD de perguntas e alternativas por curso (marca a correta)
**Aba Certificados (template)**: upload do PNG, posicionar campos no editor visual
**Aba Alunos**: lista de instaladores cadastrados (filtros por curso, status, empresa, cidade)
**Aba Certificados emitidos**: lista global de quem foi aprovado, com link para baixar o PDF

---

### 4. Permissões

Novo grupo de permissões "EAD":
- `ead_view` (ver área admin), `ead_manage_courses`, `ead_manage_quiz`, `ead_manage_template`, `ead_view_students`, `ead_view_certificates`

Adicionado em `PermissionTemplatesTab.tsx` e backend `permissions.js`.

---

### Detalhes técnicos

**Banco** (`backend/schema-ead.sql` + migration):
- `ead_students` (id, cpf UNIQUE, name, email UNIQUE, password_hash, company, city, state, created_at)
- `ead_courses` (id, org_id, title, slug, description, cover_url, published, created_at)
- `ead_lessons` (id, course_id, title, youtube_url, order_index)
- `ead_quiz_questions` (id, course_id, question, order_index)
- `ead_quiz_options` (id, question_id, text, is_correct)
- `ead_attempts` (id, student_id, course_id, score, passed, answers JSONB, created_at)
- `ead_enrollments` (id, student_id, course_id, status, approved_at)
- `ead_certificate_templates` (id, course_id, image_url, fields JSONB) — fields = `[{key, x, y, fontSize, color, fontFamily}]`
- `ead_certificates` (id, student_id, course_id, pdf_url, issued_at)
- GRANTs + RLS conforme padrão do projeto

**Backend** (`backend/src/routes/ead.js`):
- `POST /ead/auth/register`, `POST /ead/auth/login` (JWT separado para alunos)
- `GET /ead/courses`, `GET /ead/courses/:id`
- `POST /ead/courses/:id/attempt` → corrige, se 100% gera certificado
- `GET /ead/students/:id/certificates`
- Admin: `CRUD /admin/ead/courses`, `/admin/ead/lessons`, `/admin/ead/questions`, `/admin/ead/templates`, `GET /admin/ead/students`, `GET /admin/ead/certificates`
- Geração de PDF com `pdf-lib` carregando o PNG como background

**Frontend**:
- Páginas: `src/pages/ead/Login.tsx`, `Cadastro.tsx`, `Catalogo.tsx`, `Curso.tsx`, `Prova.tsx`, `MeusCertificados.tsx`
- Admin: `src/pages/admin/EadAdmin.tsx` com abas (Cursos, Aulas, Quiz, Template Editor, Alunos, Certificados)
- Hook `src/hooks/use-ead.ts` + contexto `EadAuthContext` para sessão do aluno
- Editor de template: canvas/div absoluta sobre `<img>`, campos draggable com `react-draggable` ou mousedown manual
- PDF download direto via URL do backend

**Permissões e rotas**: adicionar entrada no menu lateral (`Sidebar`), proteger admin com `ProtectedRoute` + check de permissão.

---

### O que vou implementar nesta entrega

Tudo acima de ponta a ponta: schema + migration, rotas backend, geração de PDF, autenticação separada de alunos, todas as páginas do aluno, painel admin completo com editor visual de template, permissões. Sem pagamento, sem emissão de e-mail (posso adicionar depois).

Confirma para eu seguir?
