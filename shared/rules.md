# DevSentinel — Master Rules & Architecture

> **EVERY developer MUST read this file before writing any code.**
> This is the single source of truth for architecture, types, schema, naming, and conventions.

---

## 1. Project Overview

**DevSentinel** — Connect your GitHub repo + upload your PRD. DevSentinel generates test cases from your spec, runs them against your codebase, tells you exactly what is broken, and opens a GitHub PR to fix it automatically.

### Tech Stack

| Layer | Service | Why |
|-------|---------|-----|
| Authentication | Auth0 (Free Tier) | GitHub OAuth, JWT, session management |
| Frontend + API | Next.js 14 on Vercel (Hobby) | App Router, SSE, API routes |
| Database + RLS | Supabase (Free Tier) | Postgres with Row-Level Security |
| Audit AI | Google Gemini Flash | 1M tokens/day free, large context |
| Fix AI (Agent) | Claude Sonnet (Anthropic) | Best tool-use reliability |
| Code Sandbox | E2B (100 hrs/month free) | Isolated cloud VM |
| Job Queue | Inngest (50K events/month) | Async analysis + fix jobs |
| GitHub Integration | GitHub REST API + Octokit | File tree, contents, PR creation |
| Doc Parsing | pdf-parse + mammoth + marked | Parse PDF, DOCX, MD uploads |
| Real-time | Server-Sent Events (SSE) | Stream progress to browser |
| UI Components | shadcn/ui + Tailwind CSS | Consistent, accessible components |

---

## 2. Dependencies

Install ALL of these during Block 1 scaffolding (Person D leads):

```bash
# Core
npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir

# Auth
npm install @auth0/nextjs-auth0

# Database
npm install @supabase/supabase-js

# AI
npm install @google/generative-ai @anthropic-ai/sdk

# GitHub
npm install octokit

# Sandbox
npm install @e2b/code-interpreter

# Job Queue
npm install inngest

# Doc Parsing
npm install pdf-parse mammoth marked

# UI
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card badge tabs progress dialog input textarea dropdown-menu

# Utilities
npm install zod uuid
npm install -D @types/uuid
```

---

## 3. Source Tree — File Ownership

**Ownership Legend:** `[A]` = Backend Lead, `[B]` = API Integrations, `[C]` = AI/Agent, `[D]` = Frontend

> **RULE: No file is owned by two developers.** If you need to modify another developer's file, coordinate with them first.

```
devSentinal/
├── .env.local                                    # [ALL] — never committed
├── .env.example                                  # [D creates, ALL update]
├── .gitignore                                    # [D]
├── next.config.js                                # [D]
├── tailwind.config.ts                            # [D]
├── tsconfig.json                                 # [D]
├── package.json                                  # [D creates, ALL may add deps]
├── middleware.ts                                  # [D] — auth route protection
│
├── supabase/
│   └── migrations/
│       ├── 001_create_users.sql                  # [A]
│       ├── 002_create_projects.sql               # [A]
│       ├── 003_create_documents.sql              # [A]
│       ├── 004_create_requirements.sql           # [A]
│       ├── 005_create_analysis_runs.sql          # [A]
│       ├── 006_create_findings.sql               # [A]
│       └── 007_create_fix_jobs.sql               # [B]
│
├── src/
│   ├── types/
│   │   └── index.ts                              # [A defines, ALL import]
│   │
│   ├── app/
│   │   ├── layout.tsx                            # [D]
│   │   ├── page.tsx                              # [D] — landing page
│   │   ├── globals.css                           # [D]
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx                    # [D]
│   │   │   ├── callback/route.ts                 # [D]
│   │   │   └── logout/route.ts                   # [D]
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx                          # [D]
│   │   │   └── loading.tsx                       # [D]
│   │   │
│   │   ├── project/
│   │   │   ├── new/
│   │   │   │   └── page.tsx                      # [D]
│   │   │   └── [id]/
│   │   │       ├── running/
│   │   │       │   └── page.tsx                  # [D]
│   │   │       ├── report/
│   │   │       │   └── page.tsx                  # [D]
│   │   │       └── fix/
│   │   │           └── [findingId]/
│   │   │               ├── page.tsx              # [D]
│   │   │               └── done/
│   │   │                   └── page.tsx          # [D]
│   │   │
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── callback/route.ts             # [D]
│   │       │   ├── me/route.ts                   # [D]
│   │       │   └── logout/route.ts               # [D]
│   │       │
│   │       ├── projects/
│   │       │   ├── route.ts                      # [A] — GET list, POST create
│   │       │   └── [id]/
│   │       │       ├── findings/
│   │       │       │   └── route.ts              # [A] — GET findings
│   │       │       ├── analyze/
│   │       │       │   └── route.ts              # [A] — POST trigger analysis
│   │       │       └── fix/
│   │       │           └── [findingId]/
│   │       │               └── route.ts          # [B] — POST trigger fix
│   │       │
│   │       ├── upload/
│   │       │   └── route.ts                      # [A] — POST upload PRD
│   │       │
│   │       ├── github/
│   │       │   ├── repo-tree/
│   │       │   │   └── route.ts                  # [B] — GET repo tree
│   │       │   └── file-content/
│   │       │       └── route.ts                  # [B] — GET file content
│   │       │
│   │       ├── sse/
│   │       │   ├── analysis/
│   │       │   │   └── [runId]/
│   │       │   │       └── route.ts              # [C] — GET SSE stream
│   │       │   └── fix/
│   │       │       └── [jobId]/
│   │       │           └── route.ts              # [C] — GET SSE stream
│   │       │
│   │       └── inngest/
│   │           └── route.ts                      # [A] — Inngest serve endpoint
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts                         # [A] — browser client
│   │   │   └── server.ts                         # [A] — server client
│   │   │
│   │   ├── auth/
│   │   │   ├── auth0.ts                          # [D] — Auth0 SDK config
│   │   │   └── middleware.ts                     # [D] — requireAuth() helper
│   │   │
│   │   ├── github/
│   │   │   ├── client.ts                         # [B] — Octokit factory
│   │   │   ├── repo.ts                           # [B] — fetchRepoTree, fetchFileContent, detectTechStack
│   │   │   └── pr.ts                             # [B] — createBranch, commitFiles, openPR
│   │   │
│   │   ├── ai/
│   │   │   ├── gemini.ts                         # [A] — Gemini client + analysis functions
│   │   │   ├── claude.ts                         # [C] — Claude client + agent loop
│   │   │   └── prompts/
│   │   │       ├── analyze-codebase.ts           # [A] — Gemini prompt: understand codebase
│   │   │       ├── generate-tests.ts             # [A] — Gemini prompt: generate test cases
│   │   │       └── fix-code.ts                   # [C] — Claude prompt: fix broken code
│   │   │
│   │   ├── e2b/
│   │   │   ├── sandbox.ts                        # [B] — createSandbox, destroySandbox
│   │   │   └── runner.ts                         # [B] — runInSandbox, runLint, runTests, readFile, writeFile
│   │   │
│   │   ├── inngest/
│   │   │   ├── client.ts                         # [A] — Inngest client instance
│   │   │   ├── analyze.ts                        # [A] — analysis Inngest function
│   │   │   └── fix.ts                            # [C] — fix Inngest function
│   │   │
│   │   ├── sse/
│   │   │   └── emitter.ts                        # [C] — SSE stream helper
│   │   │
│   │   └── parsers/
│   │       ├── pdf.ts                            # [A] — PDF parsing
│   │       ├── docx.ts                           # [A] — DOCX parsing
│   │       └── markdown.ts                       # [A] — Markdown parsing
│   │
│   └── components/
│       ├── layout/
│       │   ├── header.tsx                        # [D]
│       │   ├── sidebar.tsx                       # [D]
│       │   └── footer.tsx                        # [D]
│       │
│       ├── project/
│       │   ├── project-card.tsx                  # [D]
│       │   ├── repo-url-input.tsx                # [D]
│       │   └── prd-upload.tsx                    # [D]
│       │
│       ├── report/
│       │   ├── health-score.tsx                  # [D]
│       │   ├── feature-tab.tsx                   # [D]
│       │   ├── finding-card.tsx                  # [D]
│       │   └── code-snippet.tsx                  # [D]
│       │
│       ├── fix/
│       │   ├── fix-progress.tsx                  # [D]
│       │   ├── agent-log.tsx                     # [D]
│       │   └── diff-viewer.tsx                   # [D]
│       │
│       └── shared/
│           ├── loading-spinner.tsx               # [D]
│           └── error-boundary.tsx                # [D]
│
├── shared/                                       # Project documentation (this folder)
│   ├── rules.md
│   └── PRD.md
│
├── developer-a-backend/
│   └── TASKS.md
├── developer-b-integrations/
│   └── TASKS.md
├── developer-c-ai-agent/
│   └── TASKS.md
└── developer-d-frontend/
    └── TASKS.md
```

---

## 4. Naming Conventions

| Category | Convention | Example |
|----------|-----------|---------|
| Files (lib, utils) | kebab-case | `repo-tree.ts`, `fix-code.ts` |
| React Components | PascalCase file + export | `HealthScore.tsx` → `export function HealthScore()` |
| Component files | kebab-case filename | `health-score.tsx` |
| DB tables | snake_case | `analysis_runs`, `fix_jobs` |
| DB columns | snake_case | `file_path`, `line_start` |
| TypeScript types | PascalCase | `AnalysisRun`, `FixJob` |
| API routes | kebab-case paths | `/api/repo-tree`, `/api/file-content` |
| Environment vars | SCREAMING_SNAKE | `SUPABASE_URL`, `AUTH0_SECRET` |
| Inngest events | dot.separated | `analysis.trigger`, `fix.trigger` |
| Git branches | kebab-case | `dev-a/analysis-engine`, `dev-d/auth-pages` |

---

## 5. Database Schema

All tables use UUID primary keys. All timestamps default to `now()`. RLS is enforced on every table.

### Table 1: users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  github_token TEXT, -- encrypted, never returned in API responses
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Users can update own data" ON users
  FOR UPDATE USING (id = auth.uid());
```

### Table 2: projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  branch TEXT DEFAULT 'main',
  tech_stack TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'created' CHECK (status IN ('created', 'analyzing', 'analyzed', 'fixing', 'error')),
  health_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own projects" ON projects
  FOR ALL USING (user_id = auth.uid());
```

### Table 3: documents
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'md', 'docx')),
  storage_path TEXT NOT NULL,
  parsed_content TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project documents" ON documents
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Table 4: requirements
```sql
CREATE TABLE requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('feature', 'endpoint', 'acceptance_criteria', 'edge_case')),
  feature_name TEXT NOT NULL,
  description TEXT NOT NULL,
  endpoint TEXT,
  http_method TEXT,
  expected_behavior TEXT,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project requirements" ON requirements
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Table 5: analysis_runs
```sql
CREATE TABLE analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'parsing_prd', 'understanding_code', 'generating_tests', 'running_tests', 'complete', 'error')),
  health_score INTEGER,
  total_tests INTEGER DEFAULT 0,
  passed INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project runs" ON analysis_runs
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Table 6: findings
```sql
CREATE TABLE findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  requirement_id UUID REFERENCES requirements(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pass', 'fail')),
  feature_name TEXT NOT NULL,
  test_description TEXT NOT NULL,
  test_type TEXT NOT NULL CHECK (test_type IN ('happy_path', 'error_case', 'auth_guard', 'validation', 'edge_case')),
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  code_snippet TEXT,
  explanation TEXT,
  fix_confidence REAL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project findings" ON findings
  FOR ALL USING (
    run_id IN (
      SELECT ar.id FROM analysis_runs ar
      JOIN projects p ON ar.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );
```

### Table 7: fix_jobs
```sql
CREATE TABLE fix_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id UUID REFERENCES findings(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sandboxing', 'coding', 'linting', 'testing', 'opening_pr', 'complete', 'error')),
  pr_url TEXT,
  pr_number INTEGER,
  branch_name TEXT,
  agent_log JSONB DEFAULT '[]',
  lint_result JSONB,
  test_result JSONB,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE fix_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own fix jobs" ON fix_jobs
  FOR ALL USING (
    finding_id IN (
      SELECT f.id FROM findings f
      JOIN analysis_runs ar ON f.run_id = ar.id
      JOIN projects p ON ar.project_id = p.id
      WHERE p.user_id = auth.uid()
    )
  );
```

---

## 6. Shared TypeScript Types

All types live in `src/types/index.ts`. Person A defines them. Everyone imports from `@/types`.

```typescript
// ============================================================
// DATABASE ROW TYPES
// ============================================================

export interface User {
  id: string;
  github_id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  github_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  repo_url: string;
  repo_owner: string;
  repo_name: string;
  branch: string;
  tech_stack: string[];
  status: 'created' | 'analyzing' | 'analyzed' | 'fixing' | 'error';
  health_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  project_id: string;
  filename: string;
  file_type: 'pdf' | 'md' | 'docx';
  storage_path: string;
  parsed_content: string | null;
  created_at: string;
}

export interface Requirement {
  id: string;
  document_id: string;
  project_id: string;
  category: 'feature' | 'endpoint' | 'acceptance_criteria' | 'edge_case';
  feature_name: string;
  description: string;
  endpoint: string | null;
  http_method: string | null;
  expected_behavior: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  created_at: string;
}

export interface AnalysisRun {
  id: string;
  project_id: string;
  status: 'pending' | 'parsing_prd' | 'understanding_code' | 'generating_tests' | 'running_tests' | 'complete' | 'error';
  health_score: number | null;
  total_tests: number;
  passed: number;
  failed: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Finding {
  id: string;
  run_id: string;
  requirement_id: string;
  status: 'pass' | 'fail';
  feature_name: string;
  test_description: string;
  test_type: 'happy_path' | 'error_case' | 'auth_guard' | 'validation' | 'edge_case';
  confidence: number;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  explanation: string | null;
  fix_confidence: number | null;
  created_at: string;
}

export interface FixJob {
  id: string;
  finding_id: string;
  status: 'pending' | 'sandboxing' | 'coding' | 'linting' | 'testing' | 'opening_pr' | 'complete' | 'error';
  pr_url: string | null;
  pr_number: number | null;
  branch_name: string | null;
  agent_log: AgentLogEntry[];
  lint_result: LintResult | null;
  test_result: TestResult | null;
  retry_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ============================================================
// SUPPORTING TYPES
// ============================================================

export interface AgentLogEntry {
  timestamp: string;
  tool: 'read_file' | 'write_file' | 'run_bash' | 'search_codebase';
  input: Record<string, unknown>;
  output: string;
  duration_ms: number;
}

export interface LintResult {
  passed: boolean;
  errors: number;
  warnings: number;
  output: string;
}

export interface TestResult {
  passed: boolean;
  total: number;
  passed_count: number;
  failed_count: number;
  output: string;
}

export interface RepoTreeNode {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}

// ============================================================
// API REQUEST / RESPONSE TYPES
// ============================================================

// POST /api/projects
export interface CreateProjectRequest {
  repo_url: string; // e.g. "https://github.com/user/repo"
}
export interface CreateProjectResponse {
  project: Project;
  tree: RepoTreeNode[];
  tech_stack: string[];
}

// GET /api/projects
export interface ListProjectsResponse {
  projects: Project[];
}

// POST /api/upload
// Request: FormData with fields 'file' (File) and 'project_id' (string)
export interface UploadResponse {
  document: Document;
  requirements: Requirement[];
}

// POST /api/projects/[id]/analyze
export interface TriggerAnalysisResponse {
  run_id: string;
  sse_url: string; // "/api/sse/analysis/{run_id}"
}

// GET /api/projects/[id]/findings?run_id=...
export interface FindingsResponse {
  run: AnalysisRun;
  findings: Finding[];
}

// POST /api/projects/[id]/fix/[findingId]
export interface TriggerFixResponse {
  job_id: string;
  sse_url: string; // "/api/sse/fix/{job_id}"
}

// ============================================================
// SSE EVENT TYPES
// ============================================================

export interface AnalysisSSEEvent {
  type: 'status_change' | 'finding' | 'complete' | 'error';
  status?: AnalysisRun['status'];
  finding?: Finding;
  health_score?: number;
  error?: string;
}

export interface FixSSEEvent {
  type: 'status_change' | 'agent_log' | 'complete' | 'error';
  status?: FixJob['status'];
  log_entry?: AgentLogEntry;
  pr_url?: string;
  error?: string;
}

// ============================================================
// AGENT TYPES (Person C)
// ============================================================

export interface AgentContext {
  finding: Finding;
  requirement: Requirement;
  project: Project;
  repo_owner: string;
  repo_name: string;
  branch: string;
}

export interface AgentTool {
  name: 'read_file' | 'write_file' | 'run_bash' | 'search_codebase';
  description: string;
  input_schema: Record<string, unknown>;
}
```

---

## 7. API Contracts

Every API route, its method, owner, request shape, and response shape.

| Method | Path | Owner | Request | Response | Auth |
|--------|------|-------|---------|----------|------|
| GET | `/api/projects` | A | — | `ListProjectsResponse` | Yes |
| POST | `/api/projects` | A | `CreateProjectRequest` | `CreateProjectResponse` | Yes |
| POST | `/api/upload` | A | `FormData {file, project_id}` | `UploadResponse` | Yes |
| POST | `/api/projects/[id]/analyze` | A | — | `TriggerAnalysisResponse` | Yes |
| GET | `/api/projects/[id]/findings` | A | `?run_id=uuid` | `FindingsResponse` | Yes |
| POST | `/api/projects/[id]/fix/[findingId]` | B | — | `TriggerFixResponse` | Yes |
| GET | `/api/github/repo-tree` | B | `?owner&repo&branch` | `{ tree: RepoTreeNode[] }` | Yes |
| GET | `/api/github/file-content` | B | `?owner&repo&path&branch` | `{ content: string }` | Yes |
| GET | `/api/sse/analysis/[runId]` | C | — | SSE stream of `AnalysisSSEEvent` | Yes |
| GET | `/api/sse/fix/[jobId]` | C | — | SSE stream of `FixSSEEvent` | Yes |
| GET | `/api/auth/me` | D | — | `{ user: User }` | Yes |
| GET | `/api/auth/callback` | D | Auth0 callback | Redirect | No |
| GET | `/api/auth/logout` | D | — | Redirect | No |

---

## 8. Environment Variables

```bash
# Auth0
AUTH0_SECRET=               # Random string, >= 32 chars
AUTH0_BASE_URL=             # http://localhost:3000 (dev) or https://devsentinel.vercel.app (prod)
AUTH0_ISSUER_BASE_URL=      # https://YOUR_DOMAIN.auth0.com
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=  # Server-side only, never expose to client

# AI
GOOGLE_GEMINI_API_KEY=
ANTHROPIC_API_KEY=

# E2B
E2B_API_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# GitHub (for server-side operations when user token not available)
GITHUB_APP_PRIVATE_KEY=     # Optional: for app-level auth
```

---

## 9. Coding Standards

### General
- TypeScript strict mode enabled
- All functions are `async` when they do I/O
- Use `@/` import alias for all internal imports (e.g., `import { Finding } from '@/types'`)
- No `any` types — use `unknown` and narrow
- All API routes return JSON with consistent error shape: `{ error: string }`
- HTTP errors: 400 (bad request), 401 (unauthorized), 404 (not found), 500 (server error)

### API Route Pattern
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ... business logic
    return NextResponse.json({ data });
  } catch (error) {
    console.error('[POST /api/example]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Supabase Client Usage
```typescript
// Server-side (API routes, Inngest jobs):
import { createServerClient } from '@/lib/supabase/server';
const supabase = createServerClient();

// Client-side (React components):
import { createBrowserClient } from '@/lib/supabase/client';
const supabase = createBrowserClient();
```

### Error Logging
- Always prefix with `[METHOD /api/path]` in console.error
- Never log sensitive data (tokens, keys, full PRD content)

---

## 10. Integration Contracts

### Person B exposes to Person A:
```typescript
// src/lib/github/repo.ts
export async function fetchRepoTree(octokit: Octokit, owner: string, repo: string, branch: string): Promise<RepoTreeNode[]>
export async function fetchFileContent(octokit: Octokit, owner: string, repo: string, path: string, branch: string): Promise<string>
export async function detectTechStack(tree: RepoTreeNode[]): Promise<string[]>
```

### Person B exposes to Person C:
```typescript
// src/lib/e2b/sandbox.ts
export async function createSandbox(repoUrl: string, branch: string): Promise<{ sandboxId: string; sandbox: Sandbox }>
export async function destroySandbox(sandboxId: string): Promise<void>

// src/lib/e2b/runner.ts
export async function runInSandbox(sandbox: Sandbox, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
export async function runLint(sandbox: Sandbox, changedFiles: string[]): Promise<LintResult>
export async function runTests(sandbox: Sandbox, testCommand?: string): Promise<TestResult>
export async function readFile(sandbox: Sandbox, path: string): Promise<string>
export async function writeFile(sandbox: Sandbox, path: string, content: string): Promise<void>

// src/lib/github/pr.ts
export async function createBranch(octokit: Octokit, owner: string, repo: string, baseBranch: string, newBranch: string): Promise<void>
export async function commitFiles(octokit: Octokit, owner: string, repo: string, branch: string, files: { path: string; content: string }[], message: string): Promise<string>
export async function openPR(octokit: Octokit, owner: string, repo: string, head: string, base: string, title: string, body: string): Promise<{ url: string; number: number }>
```

### Person A exposes to Person C:
```typescript
// src/lib/inngest/client.ts
export const inngest: Inngest  // shared Inngest instance

// Person C registers the fix.run function on this same client
```

### Person D exposes to ALL:
```typescript
// src/lib/auth/middleware.ts
export async function requireAuth(req: NextRequest): Promise<User | null>
// Returns the authenticated user or null. Every API route should call this.
```

---

## 11. Git Workflow

### Branch Naming
- `dev-a/feature-name` — Person A branches
- `dev-b/feature-name` — Person B branches
- `dev-c/feature-name` — Person C branches
- `dev-d/feature-name` — Person D branches

### Merge Strategy
1. Each developer works on their own branch
2. Push to remote frequently
3. Create PR to `main` when a task block is complete
4. Another team member reviews and merges
5. If conflicts arise: the person who owns the conflicting file resolves it

### Commit Message Format
```
[A] Add Supabase migrations for users and projects tables
[B] Implement GitHub repo tree fetching via Octokit
[C] Add Claude agent tool-use loop with 4 tools
[D] Create results report page with health score and finding cards
```

---

## 12. Important Rules

1. **Never commit `.env.local`** — it contains secrets. Only commit `.env.example`.
2. **Never store raw GitHub tokens in API responses or logs.**
3. **All AI operations run through Inngest** — never call Gemini/Claude directly from API routes (they'd timeout).
4. **The fix agent ONLY executes inside E2B** — never run user code on the Vercel server.
5. **All tables have RLS enabled** — users can only see their own data.
6. **Types are the contract** — if you need a new field, update `src/types/index.ts` and notify the team.
7. **SSE for progress** — analysis and fix progress are streamed via SSE, never polled by the frontend.
8. **One owner per file** — check the source tree above before creating any file.

🚫  These constraints are absolute — the AI must never violate them
1. NO GIT CLONE on the server. ALL repository access goes through lib/github.ts using the GitHub REST API.
   Violation: any import of 'simple-git', 'isomorphic-git', or shell commands running 'git clone' outside E2B.

2. NO CODE EXECUTION outside E2B. lib/fix-agent.ts runs code ONLY by calling lib/sandbox.ts.
   Violation: any call to exec(), spawn(), or child_process outside sandbox.ts.

3. NO DIRECT MERGE. The fix agent opens a Pull Request only. It never calls octokit.pulls.merge().
   Violation: any call to octokit.pulls.merge or equivalent.

4. NO HARDCODED VALUES. Every API key, model name, URL, and timeout comes from lib/config.ts.
   Violation: any string literal matching an API key pattern or model name outside config.ts.

5. NO BLOCKING THE UI. Analysis and fix pipelines run as Inngest background jobs.
   Violation: any API route that awaits the full analysis or fix before returning a response.

6. NO MORE THAN 4 AGENT TOOLS. Claude is given exactly read_file, write_file, run_bash, search_codebase.
   Violation: any additional tool definition in AGENT_TOOLS array.

7. RLS ON EVERY TABLE. No Supabase query bypasses Row-Level Security on the client side.
   Violation: any use of the service role key in client components or public API routes.

