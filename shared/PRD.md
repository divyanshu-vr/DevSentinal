# DevSentinel — Product Requirements Document v1.0

> **Ownership Legend:** `[A]` = Backend Lead, `[B]` = API Integrations, `[C]` = AI/Agent, `[D]` = Frontend
> Each section is tagged with its primary owner(s).

---

## 1. Problem Statement `[ALL]`

Teams write PRDs. Teams write code. But there is almost never an automated bridge between the two. The result:

- Features described in the spec are silently missing or partially implemented in the codebase.
- Endpoint behavior drifts from the spec over time without anyone noticing.
- Bugs are found manually — in code review, in QA, or in production.
- When a bug is found, the developer still has to locate the exact file, write the fix, and open a PR manually.

---

## 2. Product Overview `[ALL]`

DevSentinel is a web platform with four sequential capabilities, triggered by a single user action.

**The One-Line Pitch:** Connect your GitHub repo + upload your PRD. DevSentinel generates test cases from your spec, runs them against your live endpoints, tells you exactly what is broken, and opens a GitHub PR to fix it — automatically.

**The Gap DevSentinel Closes:** Existing tools audit code OR fix code. None start from your PRD and do both. DevSentinel treats your spec as the source of truth, generates tests from it, and turns every failed test into an automatically fixed Pull Request.

### Core User Flow

| Phase | What Happens | Who Does It |
|-------|-------------|-------------|
| 1. Auth | User signs in via Auth0 (GitHub OAuth) | Auth0 |
| 2. Connect | User pastes GitHub repo URL + uploads PRD (PDF/MD/DOCX) | User |
| 3. Analyse | AI compares PRD to codebase. Generates test cases. Reports pass/fail per feature. | AI Engine |
| 4. Auto-Fix | For each failing feature, user clicks Auto-Fix. Agent writes fix and opens GitHub PR. | Fix Agent |

### Step-by-Step Flow

| Step | Screen | User Action | System Response |
|------|--------|------------|-----------------|
| 1 | Landing Page | Clicks 'Get Started' | Redirected to Auth0 login |
| 2 | Auth (Auth0) | Signs in with GitHub | JWT issued. Redirected to Dashboard. |
| 3 | New Project | Pastes GitHub repo URL | Repo tree fetched via GitHub REST API |
| 4 | PRD Upload | Uploads PRD file (PDF/MD/DOCX) | AI parses PRD. Extracts features + endpoints. |
| 5 | Analysis Trigger | Clicks 'Run Analysis' | AI generates test cases from PRD. Tests each endpoint. |
| 6 | Results Report | Views report | Each feature marked as Working or Broken with exact location. |
| 7 | Auto-Fix | Clicks 'Auto-Fix' on a broken feature | Agent writes fix in sandboxed VM. CI runs. PR opened. |
| 8 | PR Review | Reviews PR on GitHub | Merges or requests changes. DevSentinel marks issue resolved. |

---

## 3. Detailed Feature Specification

### 3.1 Authentication — Auth0 `[D]`

Authentication is handled entirely by Auth0. The application never stores passwords.

- GitHub OAuth via Auth0 — single click sign-in, no manual forms
- JWT issued on successful login — stored in httpOnly cookie, validated on every API request
- Auth middleware protects all `/dashboard/*` and `/api/*` routes — unauthenticated users redirected to `/login`
- On first login, a user record is created in the database with the GitHub username and avatar URL

**Security Note:** Auth0 handles all token storage, refresh, and revocation. DevSentinel requests GitHub OAuth scope `repo:read` only during auth. Write scope (`repo:write`) is requested separately — only when the user triggers Auto-Fix for the first time.

### 3.2 Repository Connection `[B]`

The user connects their GitHub repository by pasting a URL. No git clone happens on the server — the GitHub REST API is used for all file access.

- Input: GitHub repo URL (e.g. `https://github.com/user/my-app`)
- System fetches the full file tree in one API call — `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
- Individual file contents are fetched on demand — `GET /repos/{owner}/{repo}/contents/{path}`
- Tech stack is auto-detected from `package.json` / `requirements.txt` / `go.mod` and displayed to the user
- Repository metadata (name, branch, file count, language) is saved to the `projects` table

### 3.3 PRD Upload & Parsing `[A]`

The user uploads their Product Requirements Document. This is the input that drives all test generation.

- Supported formats: PDF, Markdown (.md), Word Document (.docx)
- Drag-and-drop upload zone on the project setup screen
- AI parses the PRD and extracts a structured list of: features, API endpoints, expected behaviors, and acceptance criteria
- Extracted requirements are stored in the `requirements` table — each as a typed record with category, description, and priority
- A preview of extracted features is shown to the user for confirmation before analysis runs

**What AI Extracts from PRD:**

| PRD Section Type | What AI Extracts | Example |
|-----------------|-----------------|---------|
| Feature Description | Feature name + expected user behavior | "User can reset password via email link" |
| API Endpoint | Method, path, expected response | `POST /api/auth/reset` -> 200 with email sent |
| Acceptance Criteria | Specific pass/fail conditions | "Returns 401 if token is expired" |
| Edge Cases | Error states and boundary conditions | "Returns 400 if email field is empty" |

### 3.4 AI Analysis Engine — PRD vs. Codebase `[A + C]`

> **Split:** Person A owns Steps 1-4 (Gemini analysis + report generation). Person C owns the SSE streaming of results to the frontend.

This is the core intelligence of DevSentinel. The AI reads both the PRD and the codebase, generates test cases from the spec, and tests them against the actual code.

**Step 1 — Understand the Codebase `[A]`**
- AI reads the full file tree and key files to build a mental model of the codebase
- Identifies: framework, all API routes, all frontend pages, authentication middleware, database models
- Builds a route graph — maps every PRD endpoint to its actual handler file + line number
- Builds an import graph — detects broken import chains before tests even run

**Step 2 — Generate Test Cases from PRD `[A]`**

| PRD Feature | Generated Test Case | Test Type |
|------------|-------------------|-----------|
| User login endpoint | POST /api/auth/login with valid credentials -> expect 200 + JWT | Happy path |
| User login endpoint | POST /api/auth/login with wrong password -> expect 401 | Error case |
| Password reset | POST /api/auth/reset with valid email -> expect email sent confirmation | Happy path |
| Protected route | GET /api/user/profile without token -> expect 401 redirect | Auth guard |
| Data validation | POST /api/products with missing name field -> expect 400 + error message | Validation |

**Step 3 — Test Each Feature Against the Code `[A]`**
- The AI does not execute the code. It reads the implementation and reasons about whether it satisfies each test case — like a senior engineer doing a thorough code review against the spec.
- For each test case, AI reads the relevant handler file, middleware, and database model
- Checks that the route exists, the logic is correct, error cases are handled, and the response matches the spec
- Records a PASS or FAIL verdict with a confidence score for each test case
- For FAILs: records the exact file path, start line, end line, offending code snippet, and plain-English explanation

**Step 4 — Generate the Report `[A]`**

Report Structure:
- Overall Health Score — percentage of test cases passing (weighted by severity)
- Feature-by-Feature breakdown — each PRD feature shows all its test cases with PASS / FAIL badges
- For each FAIL: exact file path + line numbers + the broken code snippet + what is wrong
- Auto-Fix availability badge — shown next to each failing feature if the agent can fix it

### 3.5 Results Report — Screen Specification `[D]`

| UI Element | Description |
|-----------|-------------|
| Health Score | Large circular score at top. Green >= 80%, Yellow 50-79%, Red < 50%. Updates live as fixes are applied. |
| Feature Tabs | One tab per PRD feature. Badge shows pass/fail count. Click to expand all test cases. |
| Test Case Card (PASS) | Green badge. Feature name. Test description. Confidence score. |
| Test Case Card (FAIL) | Red badge. Feature name. Plain-English explanation of what is broken. File path + line numbers clickable. Broken code snippet highlighted in red. 'Auto-Fix This' button. |
| Auto-Fix Button | Shown only on FAIL cards. Triggers the fix agent for that specific failing feature. |
| Export Report | Download full report as PDF. Includes all findings with code snippets and fix status. |

### 3.6 Auto-Fix Agent `[C + B]`

> **Split:** Person C owns the Claude agent loop (Stage 3) and orchestration (Inngest job). Person B owns sandbox lifecycle (Stage 2), CI runner (Stages 4-5), and PR creation (Stage 6).

When the user clicks 'Auto-Fix' on a failing feature, the fix agent pipeline is triggered. The agent has full context from the audit — it knows exactly which file is wrong, which line, and what the spec says it should do.

| Stage | What Happens | Type | Time |
|-------|-------------|------|------|
| 1. Context Pack `[C]` | Audit finding assembled into agent task | Deterministic | < 1s |
| 2. Sandbox Spin-up `[B]` | E2B isolated cloud VM created. Repo cloned. Dependencies installed. | Deterministic | 8-15s |
| 3. Agent Call `[C]` | Claude Sonnet called with context + 4 tools. Writes the fix inside the sandbox. | LLM | 15-40s |
| 4. Lint Check `[B]` | Linter runs on changed files only. Trivial issues auto-fixed. | Deterministic | < 5s |
| 5. Test Run `[B + C]` | Relevant tests run in sandbox. If fail: one LLM retry with error context. | Deterministic + LLM | 10-30s |
| 6. PR Creation `[B]` | git commit -> push branch -> GitHub PR opened via Octokit. PR URL returned to UI. | Deterministic | < 5s |
| 7. Cleanup `[B]` | Sandbox destroyed. No resource leaks. Fix job status updated in DB. | Deterministic | < 1s |

**Safety by Design:**
- The fix agent ONLY executes inside an E2B sandboxed VM — never on the host server.
- The sandbox has no internet access — cannot exfiltrate code or call external services.
- Write access to the user's GitHub repo is scoped to a single branch — never to main.
- The PR is opened for human review. DevSentinel never merges directly.

### 3.7 Agent Tool Set (4 Tools Only) `[C]`

The agent is intentionally given exactly 4 tools. Fewer tools means less LLM uncertainty and more reliable fix output.

| Tool | What It Does | Safety |
|------|-------------|--------|
| `read_file` | Read any file in the cloned repo by path | Read-only. Safe. |
| `write_file` | Write or overwrite a file at a given path in the sandbox | Sandbox-scoped only. |
| `run_bash` | Execute a shell command in the sandbox. Returns stdout + stderr + exit code. | No internet. Sandbox only. |
| `search_codebase` | Grep for a pattern. Returns matching file paths + line numbers. | Read-only. Safe. |

---

## 4. Screen-by-Screen Specification `[D]`

| Screen | Route | Purpose | Key Elements |
|--------|-------|---------|-------------|
| Landing Page | `/` | Convert visitors | Hero headline. 'Get Started' CTA -> Auth0. How-it-works 4-step visual. Zero-cost callout. |
| Auth (Auth0) | `/login` | Authentication | Auth0-hosted page. GitHub OAuth button. Handled entirely by Auth0. |
| Dashboard | `/dashboard` | Project overview | List of projects with status chips. 'New Project' button. |
| New Project | `/project/new` | Connect repo + upload PRD | GitHub repo URL input. PRD drag-drop upload. 'Run Analysis' CTA. |
| Analysis Running | `/project/:id/running` | Live progress | Stage-by-stage progress bar via SSE. |
| Results Report | `/project/:id/report` | Main value screen | Health score. Feature tabs. PASS/FAIL cards. Code snippets. Auto-Fix buttons. |
| Fix Running | `/project/:id/fix/:findingId` | Live fix progress | Real-time agent log. Current stage indicator. |
| Fix Complete | `/project/:id/fix/:findingId/done` | PR confirmation | Link to opened GitHub PR. Diff preview. 'Mark Resolved' button. |

---

## 5. Technology Stack `[ALL]`

| Layer | Service / Tool | Why This Choice | Cost |
|-------|---------------|----------------|------|
| Authentication | Auth0 (Free Tier) | Handles GitHub OAuth, JWT, session management | $0 |
| Frontend + API | Next.js 14 on Vercel (Hobby) | SSE support, API routes, easy deployment | $0 |
| Database + RLS | Supabase (Free Tier) | Postgres with Row-Level Security | $0 |
| Audit AI | Google Gemini Flash | 1M tokens/day free. Large context window | $0 |
| Fix AI (Agent Loop) | Claude Sonnet (Anthropic) | Best tool-use reliability | ~$0.01-0.03/fix |
| Code Sandbox | E2B (100 hrs/month free) | Isolated cloud VM for safe code execution | $0 |
| Job Queue | Inngest (50K events/month) | Analysis + fix jobs are async | $0 |
| GitHub Integration | GitHub REST API + Octokit | File tree, file contents, PR creation | $0 |
| Doc Parsing | pdf-parse + mammoth + marked | Parse PDF, DOCX, and MD PRD uploads | $0 |
| Real-time Updates | Server-Sent Events (SSE) | Stream progress to browser in real time | $0 |
| Monitoring | Sentry + PostHog (Free) | Error tracking + product analytics | $0 |
| **TOTAL** | | | **$0/month** |

---

## 6. Data Model `[A + B]`

> Person A owns tables 1-6. Person B owns table 7 (fix_jobs).
> See `shared/rules.md` Section 5 for exact SQL CREATE TABLE statements.

| Table | Key Columns | Purpose |
|-------|------------|---------|
| `users` | id, github_id, username, avatar_url, created_at | Created on first Auth0 login |
| `projects` | user_id, name, repo_url, repo_name, branch, tech_stack, status, health_score | One project per repo+PRD pair |
| `documents` | project_id, filename, file_type, storage_path, parsed_content | Uploaded PRD files |
| `requirements` | document_id, project_id, category, feature_name, description, endpoint, expected_behavior, priority | AI-extracted PRD requirements |
| `analysis_runs` | project_id, status, health_score, total_tests, passed, failed, created_at | Each 'Run Analysis' trigger |
| `findings` | run_id, requirement_id, status, file_path, line_start, line_end, code_snippet, explanation, fix_confidence | Per-test-case result |
| `fix_jobs` | finding_id, status, pr_url, pr_number, branch_name, agent_log, lint_result, test_result, retry_count | Auto-Fix agent execution |

**Row-Level Security:** All tables enforce RLS via Supabase. Users can only access rows belonging to their own projects.

---

## 7. 48-Hour Build Plan `[ALL]`

4-person team. Blocks 2 and 3 are parallelized across two pairs.

### Team Ownership
- **Person A** — Backend lead: analysis engine, Gemini prompts, findings storage, Inngest job queue
- **Person B** — API integrations: GitHub REST API, E2B sandbox, Octokit PR creation, CI runner
- **Person C** — AI/Agent: Claude tool loop, prompt engineering, audit-to-fix data bridge, SSE streaming
- **Person D** — Frontend: Next.js UI, results report screen, diff viewer, live fix log, Auth0 integration

### Timeline

| Block | Hours | Tasks | Done When |
|-------|-------|-------|-----------|
| Block 1 | 0-5h | Project setup: Next.js, Supabase, Auth0, Vercel. All API keys wired. | Auth0 login works. Blank dashboard is live on Vercel. |
| Block 2A (Pair 1: A+C) | 5-14h | PRD parser + AI analysis engine. Gemini prompts. Store findings in DB. | Structured findings JSON from a real repo + real PRD. |
| Block 2B (Pair 2: B+D) | 5-14h | GitHub repo connection UI. Fix agent: E2B sandbox, Claude tool loop, PR creation. | Agent opens a real PR on a test repo. |
| Block 3 | 14-22h | Integration: wire audit findings to fix agent input. Full pipeline end-to-end. | Paste real repo + real PRD -> see PR appear. |
| Block 4 | 22-34h | Results Report UI. SSE streaming. Health score, feature tabs, PASS/FAIL cards, Auto-Fix button. | Full UI works end-to-end. |
| Block 5 | 34-42h | Test with 5+ real repos. Fix edge cases. Polish landing page. Prepare demos. | 5/5 test runs produce correct findings. |
| Block 6 | 42-48h | Buffer. Sleep. Rehearse demo. Fix last-minute issues. | Demo runs end-to-end in < 3 minutes reliably. |

---

## 8. Non-Functional Requirements `[ALL]`

| Requirement | Specification |
|------------|---------------|
| Analysis Speed | Full analysis of a 500-file repo with a 20-page PRD completes in under 5 minutes. |
| Fix Speed | Repo URL + PRD upload to PR opened: under 3 minutes for a single-file bug fix. |
| Streaming Progress | Both analysis and fix stages stream live to the browser via SSE. |
| Idempotency | Re-running analysis on the same repo + same PRD + same commit produces consistent findings. |
| Partial Failure | If one file fails to analyse, the run continues. Failure noted in report; does not abort. |
| Auth Security | Auth0 handles all auth. JWT validated on every protected request. GitHub tokens stored encrypted. |
| Sandbox Isolation | Fix agent code execution ONLY runs inside E2B. No way for agent to touch host server. |
| PR Safety | Agent opens a PR for human review. DevSentinel NEVER merges directly to main. |
| Rate Limiting | All `/api/*` routes rate-limited: 100 requests/minute per user. |
| Zero-Cost Launch | Total monthly infrastructure cost: $0. All services on free tiers. |

---

## 9. Out of Scope — v1.0 `[ALL]`

| Feature | Deferred To |
|---------|------------|
| Webhook-triggered re-analysis on every git push | v1.1 |
| Automatic merge without human PR review | Never — safety boundary |
| Support for private repos without GitHub OAuth | v1.2 |
| Multi-user / team accounts with shared projects | v1.2 |
| GitLab / Bitbucket integration | v1.3 |
| Dynamic runtime testing (actually running the application) | v2.0 |
| Visual regression testing for UI components | v2.0 |
| Multi-file refactors spanning > 5 files in a single fix | v1.1 |
| Persistent cross-session comparison of findings over time | v1.1 |

---

## 10. Hackathon Success Criteria `[ALL]`

**The Demo Must Show:**
1. Sign in with GitHub via Auth0 — zero friction.
2. Paste a public GitHub repo URL + upload a PRD document.
3. DevSentinel analyses the codebase and generates a test report with PASS / FAIL per feature.
4. Click 'Auto-Fix' on a failing feature — watch the agent work in real time.
5. A real GitHub PR appears on screen within 3 minutes of clicking Auto-Fix.

| Metric | Target |
|--------|--------|
| End-to-end demo time (repo URL -> PR opened) | < 3 minutes |
| Analysis accuracy (findings match real bugs) | > 80% precision |
| Auto-Fix PR pass rate (CI passes on first try) | > 75% of fixes |
| Demo reliability (same scenario, 5 consecutive runs) | 5/5 succeed |
| Monthly infrastructure cost | $0 |
