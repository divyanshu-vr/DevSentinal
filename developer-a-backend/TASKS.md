# Developer A — Backend Lead: TASKS.md

> **Before writing any code, read `shared/rules.md` completely.**

## Your Scope

You own the backend core: database schema, Supabase client, PRD parsing, AI analysis engine (Gemini), Inngest job queue, shared TypeScript types, and all `/api/projects/*` and `/api/upload` routes.

### Files You Own
- `supabase/migrations/001-006.sql` (6 migration files)
- `src/types/index.ts`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/ai/gemini.ts`
- `src/lib/ai/prompts/analyze-codebase.ts`
- `src/lib/ai/prompts/generate-tests.ts`
- `src/lib/inngest/client.ts`
- `src/lib/inngest/analyze.ts`
- `src/lib/parsers/pdf.ts`
- `src/lib/parsers/docx.ts`
- `src/lib/parsers/markdown.ts`
- `src/app/api/projects/route.ts`
- `src/app/api/projects/[id]/findings/route.ts`
- `src/app/api/projects/[id]/analyze/route.ts`
- `src/app/api/upload/route.ts`
- `src/app/api/inngest/route.ts`

### Env Vars You Need
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, GOOGLE_GEMINI_API_KEY, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
```

---

## Task 1: Database Migrations (Block 1, ~1h)

### Goal: All 6 tables created in Supabase with RLS policies

- [x] Create `supabase/migrations/001_create_users.sql` — exact SQL from `shared/rules.md` Section 5
- [x] Create `supabase/migrations/002_create_projects.sql`
- [x] Create `supabase/migrations/003_create_documents.sql`
- [x] Create `supabase/migrations/004_create_requirements.sql`
- [x] Create `supabase/migrations/005_create_analysis_runs.sql`
- [x] Create `supabase/migrations/006_create_findings.sql`
- [x] Run migrations against Supabase project
- [x] Verify all tables exist with correct columns and RLS policies

---

## Task 2: Shared Types + Supabase Client (Block 1, ~1h)

### Goal: TypeScript types and database client ready for all devs

- [x] Create `src/types/index.ts` — copy exact types from `shared/rules.md` Section 6
- [x] Create `src/lib/supabase/client.ts`:
  ```typescript
  import { createBrowserClient as _createBrowserClient } from '@supabase/ssr';
  // OR simpler approach:
  import { createClient } from '@supabase/supabase-js';

  export function createBrowserClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  ```
- [x] Create `src/lib/supabase/server.ts`:
  ```typescript
  import { createClient } from '@supabase/supabase-js';

  export function createServerClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  ```

---

## Task 3: PRD Parsers (Block 2A, ~2h)

### Goal: Parse uploaded PDF, DOCX, and MD files into plain text

- [x] Create `src/lib/parsers/pdf.ts`:
  ```typescript
  import { PDFParse } from 'pdf-parse';
  export async function parsePDF(buffer: Buffer): Promise<string>
  ```
- [x] Create `src/lib/parsers/docx.ts`:
  ```typescript
  import mammoth from 'mammoth';
  export async function parseDOCX(buffer: Buffer): Promise<string>
  ```
- [x] Create `src/lib/parsers/markdown.ts`:
  ```typescript
  import { marked } from 'marked';
  export async function parseMarkdown(text: string): Promise<string>
  ```
- [x] Each parser returns clean plain text (no HTML tags, no binary artifacts)

---

## Task 4: Upload API Route (Block 2A, ~2h)

### Goal: Accept PRD file upload, parse it, extract requirements via Gemini

- [x] Create `src/app/api/upload/route.ts`:
  - [x] `POST` handler accepts `FormData` with fields `file` (File) and `project_id` (string)
  - [x] Detect file type from extension (.pdf, .md, .docx)
  - [x] Parse file content using the appropriate parser from Task 3
  - [x] Store document record in `documents` table with `parsed_content`
  - [x] Call Gemini to extract structured requirements from parsed text (see Task 5 prompt)
  - [x] Store each extracted requirement in `requirements` table
  - [x] Return `UploadResponse` shape: `{ document, requirements }`

---

## Task 5: Gemini AI — PRD Requirement Extraction (Block 2A, ~2h)

### Goal: Gemini parses PRD text and returns structured requirements

- [x] Create `src/lib/ai/gemini.ts`:
  ```typescript
  import { GoogleGenerativeAI } from '@google/generative-ai';

  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

  export async function extractRequirements(prdText: string): Promise<ExtractedRequirement[]>
  export async function analyzeCodebase(fileTree: RepoTreeNode[], fileContents: Record<string, string>, requirements: Requirement[]): Promise<Finding[]>
  ```
- [x] Create `src/lib/ai/prompts/analyze-codebase.ts`:
  - System prompt for Gemini Pass 1: "You are a senior engineer. Given this file tree and key source files, identify the framework, all API routes, frontend pages, auth middleware, and database models. Return a JSON structure."
  - System prompt for Gemini Pass 2: "Given the codebase analysis and these PRD requirements, for each requirement determine if the code satisfies it. Return a JSON array of findings with pass/fail, file_path, line numbers, code snippet, and explanation."
- [x] Create `src/lib/ai/prompts/generate-tests.ts`:
  - Prompt that takes requirements and generates test cases with types: happy_path, error_case, auth_guard, validation, edge_case
- [x] Use Gemini's JSON mode (`generationConfig: { responseMimeType: "application/json" }`) for structured output
- [x] Handle large repos: prioritize files matching routes found in PRD requirements (max ~50 key files)

---

## Task 6: Inngest Analysis Job (Block 2A, ~3h)

### Goal: Async analysis pipeline triggered by API, streams progress via DB status updates

- [ ] Create `src/lib/inngest/client.ts`:
  ```typescript
  import { Inngest } from 'inngest';
  export const inngest = new Inngest({ id: 'devsentinel' });
  ```
- [ ] Create `src/lib/inngest/analyze.ts`:
  Inngest function `analysis.run`, triggered by event `analysis.trigger`:
  - **Step 1 — Parse PRD** (status: `parsing_prd`):
    - Read document + requirements from DB
    - Update `analysis_runs.status` to `parsing_prd`
  - **Step 2 — Understand Codebase** (status: `understanding_code`):
    - Call Person B's `fetchRepoTree()` to get file tree
    - Fetch key files using `fetchFileContent()` (prioritize routes, models, middleware)
    - Update status to `understanding_code`
  - **Step 3 — Generate Tests** (status: `generating_tests`):
    - Call Gemini with codebase context + requirements
    - Generate test cases for each requirement
    - Update status to `generating_tests`
  - **Step 4 — Run Tests** (status: `running_tests`):
    - For each test case, Gemini reads relevant code and determines pass/fail
    - Store each finding in `findings` table
    - Update status to `running_tests`
  - **Step 5 — Complete**:
    - Calculate health_score: `(passed / total_tests) * 100`
    - Update `analysis_runs` with final stats
    - Update `projects.health_score` and `projects.status` to `analyzed`
    - Update status to `complete`
  - **Error handling**: Any step failure -> status = `error`, store error_message
- [ ] Create `src/app/api/projects/[id]/analyze/route.ts`:
  - `POST`: Create `analysis_runs` row, trigger Inngest event `analysis.trigger`, return `TriggerAnalysisResponse`
- [ ] Create `src/app/api/inngest/route.ts`:
  - Inngest serve endpoint that registers both `analysis.run` and Person C's `fix.run`

### Key Design Decisions:
- Gemini Flash has 1M token context — send full file tree + up to 50 key files in one call
- Use Gemini's JSON mode for structured output
- For large repos: prioritize files matching routes found in PRD requirements
- Emit progress via updating `analysis_runs.status` (Person C polls this for SSE)

---

## Task 7: Project API Routes (Block 2A, ~1.5h)

### Goal: CRUD routes for projects and findings

- [ ] Create `src/app/api/projects/route.ts`:
  - `GET`: List all projects for authenticated user. Return `ListProjectsResponse`.
  - `POST`: Accept `CreateProjectRequest`, parse repo URL to extract owner/name, call Person B's `fetchRepoTree()` and `detectTechStack()`, create project in DB, return `CreateProjectResponse`.
- [ ] Create `src/app/api/projects/[id]/findings/route.ts`:
  - `GET`: Accept query param `?run_id=uuid` (or `latest`). Fetch analysis run + all findings. Return `FindingsResponse`.

---

## Task 8: Integration Testing (Block 3, ~2h)

- [ ] Test full flow: create project -> upload PRD -> trigger analysis -> findings stored in DB
- [ ] Use a real public GitHub repo + a simple PRD document
- [ ] Verify findings JSON matches the `Finding` type shape exactly
- [ ] Verify `analysis_runs.status` updates through all stages correctly

---

## Integration Points

### You Depend On:
- **Person B** provides `fetchRepoTree()`, `fetchFileContent()`, `detectTechStack()` from `src/lib/github/repo.ts`
  - **If B is not ready:** Stub with hardcoded repo data (file tree + a few file contents) for testing
- **Person D** provides `requireAuth()` from `src/lib/auth/middleware.ts`
  - **If D is not ready:** Stub with a function that returns a hardcoded user object

### Others Depend On You:
- **Person C** reads your `analysis_runs` and `findings` tables for SSE streaming and fix context
- **Person C** imports your `inngest` client from `src/lib/inngest/client.ts`
- **Person D** calls your API routes — ensure response shapes match shared types exactly
- **Person D** needs `/api/upload` working for the PRD upload flow
- **ALL** import types from your `src/types/index.ts`

> **Priority:** Deliver `src/types/index.ts` and `src/lib/supabase/server.ts` in Block 1 so others can start immediately.
