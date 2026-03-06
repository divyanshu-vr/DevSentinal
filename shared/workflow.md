# DevSentinel — Workflow & Execution Order

> **Read this BEFORE you start coding.** This document tells you exactly when to start, when to wait, what to deliver first, and how to track progress.

---

## Progress Tracker

**RULE: After completing any step, update this tracker.** Change `[ ]` to `[x]` and add your initials + timestamp.

### Block 1 — Foundation (Hours 0-5)

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 1.1 | Initialize Next.js project, install ALL deps, push scaffold to `main` | D | Nothing | `[ ]` |
| 1.2 | Create `requireAuth()` middleware + Auth0 config | D | 1.1 | `[ ]` |
| 1.3 | Auth0 login/callback/logout pages working | D | 1.2 | `[ ]` |
| 1.4 | Deploy blank app to Vercel | D | 1.1 | `[ ]` |
| 1.5 | Create `src/types/index.ts` (all shared types) | A | 1.1 | `[x]` A — all shared types from rules.md Section 6 |
| 1.6 | Create Supabase client (`server.ts` + `client.ts`) | A | 1.1 | `[x]` A — browser + server clients created |
| 1.7 | Run DB migrations (tables 1-6) in Supabase | A | Nothing (can use Supabase dashboard) | `[x]` A — migrations run + verified |
| 1.8 | Run DB migration (table 7: fix_jobs) in Supabase | B | Nothing (can use Supabase dashboard) | `[x]` B — migration run + verified |

**Block 1 Gate:** Everyone pulls from `main` after D pushes scaffold (1.1). A's types (1.5) and Supabase client (1.6) must be merged before Block 2 starts.

---

### Block 2 — Parallel Development (Hours 5-14)

Two pairs work simultaneously. Within each pair, work is loosely coupled.

#### Pair 1: Person A + Person C

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 2A.1 | PRD parsers (pdf.ts, docx.ts, markdown.ts) | A | 1.5, 1.6 | `[x]` A — pdf (pdf-parse v2), docx (mammoth), markdown (marked) done |
| 2A.2 | Upload API route (`POST /api/upload`) | A | 2A.1 | `[x]` A — POST handler with parsing, Gemini extraction, DB storage |
| 2A.3 | Gemini prompts (analyze-codebase.ts, generate-tests.ts) | A | 1.5 | `[x]` A — Pass 1 (codebase understanding) + Pass 2 (requirement analysis) + test generation prompts done |
| 2A.4 | Gemini client (`gemini.ts`) with extraction + analysis functions | A | 2A.3 | `[x]` A — extractRequirements, understandCodebase, generateTestCases, analyzeCodebase + prioritizeFiles (max 50 key files) done |
| 2A.5 | Inngest client (`client.ts`) | A | 1.1 | `[ ]` |
| 2A.6 | Inngest analysis job (`analyze.ts`) — full pipeline | A | 2A.4, 2A.5, 2B.1* | `[ ]` |
| 2A.7 | Project API routes (`GET/POST /api/projects`, `GET /findings`) | A | 1.5, 1.6 | `[ ]` |
| 2A.8 | Inngest serve endpoint (`/api/inngest/route.ts`) | A | 2A.5 | `[ ]` |
| 2C.1 | Claude client + 4 tool definitions (`claude.ts`) | C | 1.1 | `[ ]` |
| 2C.2 | Fix agent prompt (`fix-code.ts`) | C | 1.5 | `[ ]` |
| 2C.3 | SSE emitter helper (`emitter.ts`) | C | 1.1 | `[ ]` |
| 2C.4 | SSE analysis endpoint (`/api/sse/analysis/[runId]`) | C | 2C.3, 1.6 | `[ ]` |
| 2C.5 | SSE fix endpoint (`/api/sse/fix/[jobId]`) | C | 2C.3, 1.6 | `[ ]` |
| 2C.6 | Fix Inngest job (`fix.ts`) — full 7-step pipeline | C | 2C.1, 2C.2, 2A.5, 2B.3* | `[ ]` |

> `*` = soft dependency. Use stubs if the other person isn't ready yet.

#### Pair 2: Person B + Person D

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 2B.1 | GitHub client + repo.ts (fetchRepoTree, fetchFileContent, detectTechStack) | B | 1.1 | `[x]` B — client.ts + repo.ts with all 3 functions done |
| 2B.2 | GitHub API routes (repo-tree, file-content) | B | 2B.1, 1.2 | `[x]` B — repo-tree + file-content API routes done |
| 2B.3 | E2B sandbox library (sandbox.ts, runner.ts) | B | 1.1 | `[x]` B — sandbox.ts (createSandbox, destroySandbox) + runner.ts (runInSandbox, runLint, runTests, readFile, writeFile) done |
| 2B.4 | GitHub PR library (pr.ts — createBranch, commitFiles, openPR) | B | 2B.1 | `[x]` B — pr.ts with createBranch, commitFiles, openPR done |
| 2B.5 | Fix trigger API route (`POST /api/projects/[id]/fix/[findingId]`) | B | 1.6, 2B.3 | `[x]` B — POST handler with auth, finding verification, fix_jobs creation, Inngest event (stubbed), TriggerFixResponse done |
| 2D.1 | Landing page (`/`) | D | 1.1 | `[ ]` |
| 2D.2 | Layout + header + sidebar components | D | 1.1 | `[ ]` |
| 2D.3 | Dashboard page (`/dashboard`) + project-card component | D | 1.2 | `[ ]` |
| 2D.4 | New Project page (`/project/new`) — repo URL input + PRD upload | D | 1.2 | `[ ]` |
| 2D.5 | Shared components (loading-spinner, error-boundary) | D | 1.1 | `[ ]` |

**Block 2 Gate:** Before moving to Block 3, verify:
- A: `console.log` shows structured findings JSON from a real repo + real PRD
- B: Agent can open a real PR on a test repo from a manually crafted finding JSON
- C: SSE endpoints stream status updates when DB rows change
- D: Landing, dashboard, and new project pages render correctly

---

### Block 3 — Integration (Hours 14-22)

**ALL 4 developers work together.** This is the critical merge point.

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 3.1 | All devs pull latest `main`, resolve any merge conflicts | ALL | Block 2 complete | `[ ]` |
| 3.2 | Wire A's analysis output -> C reads findings for fix agent context | A + C | 2A.6, 2C.6 | `[ ]` |
| 3.3 | Wire B's fix trigger -> fires Inngest event -> C's fix job runs | B + C | 2B.5, 2C.6 | `[ ]` |
| 3.4 | Wire D's New Project page -> calls A's `POST /api/projects` + `POST /api/upload` | D + A | 2D.4, 2A.2, 2A.7 | `[ ]` |
| 3.5 | Wire D's Run Analysis button -> calls A's `POST /api/projects/[id]/analyze` | D + A | 2D.4, 2A.6 | `[ ]` |
| 3.6 | Replace all stubs with real function calls | ALL | 3.2-3.5 | `[ ]` |
| 3.7 | End-to-end test: repo URL + PRD -> analysis -> findings in DB | A + B | 3.6 | `[ ]` |
| 3.8 | End-to-end test: finding in DB -> trigger fix -> PR opens on GitHub | B + C | 3.6 | `[ ]` |
| 3.9 | Full pipeline test: repo + PRD -> analysis -> report -> Auto-Fix -> PR opens | ALL | 3.7, 3.8 | `[ ]` |

**Block 3 Gate:** Paste a real repo URL + upload a real PRD -> see a GitHub PR appear. If this works, you're on track.

---

### Block 4 — UI Polish (Hours 22-34)

Back to parallel work. Everyone polishes their domain.

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 4D.1 | Analysis Running page (`/project/[id]/running`) — SSE-connected | D | 2C.4 working | `[ ]` |
| 4D.2 | Results Report page (`/project/[id]/report`) — health score, feature tabs, finding cards | D | 2A.7 working | `[ ]` |
| 4D.3 | Fix Running page (`/project/[id]/fix/[findingId]`) — live agent log | D | 2C.5 working | `[ ]` |
| 4D.4 | Fix Done page (`/project/[id]/fix/[findingId]/done`) — PR link, diff viewer | D | 2B.5 working | `[ ]` |
| 4D.5 | Code snippet component with syntax highlighting | D | 4D.2 | `[ ]` |
| 4A.1 | Tune Gemini prompts for analysis accuracy (test with real repos) | A | 3.9 | `[ ]` |
| 4A.2 | Handle edge cases: large repos, empty PRDs, partial failures | A | 3.9 | `[ ]` |
| 4B.1 | Harden E2B sandbox: timeout handling, cleanup on crash | B | 3.8 | `[ ]` |
| 4B.2 | Improve PR format: meaningful title, description, branch naming | B | 3.8 | `[ ]` |
| 4C.1 | Tune Claude fix prompt for reliability (test with real bugs) | C | 3.8 | `[ ]` |
| 4C.2 | Improve SSE streaming: better error recovery, connection timeout handling | C | 3.9 | `[ ]` |

**Block 4 Gate:** Full UI works end-to-end on any public repo + any PRD doc.

---

### Block 5 — Testing & Polish (Hours 34-42)

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 5.1 | Test with real repo #1 + PRD | ALL | Block 4 | `[ ]` |
| 5.2 | Test with real repo #2 + PRD | ALL | 5.1 | `[ ]` |
| 5.3 | Test with real repo #3 + PRD | ALL | 5.2 | `[ ]` |
| 5.4 | Test with real repo #4 + PRD | ALL | 5.3 | `[ ]` |
| 5.5 | Test with real repo #5 + PRD | ALL | 5.4 | `[ ]` |
| 5.6 | Fix edge cases found during testing | ALL | 5.1-5.5 | `[ ]` |
| 5.7 | Polish landing page for demo | D | 5.6 | `[ ]` |
| 5.8 | Prepare 3 demo scenarios | ALL | 5.6 | `[ ]` |
| 5.9 | Deploy final version to Vercel | D | 5.8 | `[ ]` |

**Block 5 Gate:** 5/5 test runs produce correct findings + at least 1 successful auto-fix PR.

---

### Block 6 — Demo Prep (Hours 42-48)

| # | Task | Owner | Depends On | Status |
|---|------|-------|-----------|--------|
| 6.1 | Rehearse full demo (3 dry runs) | ALL | Block 5 | `[ ]` |
| 6.2 | Fix any last-minute issues found in rehearsal | ALL | 6.1 | `[ ]` |
| 6.3 | Prepare judge Q&A answers | ALL | 6.1 | `[ ]` |
| 6.4 | Sleep at least 4 hours | ALL | 6.2 | `[ ]` |

**Final Gate:** Demo runs end-to-end in < 3 minutes reliably.

---

## Visual Timeline

```
Hours:  0─────5──────────14──────────22──────────34───────42────48
        |     |           |           |           |        |     |
  D:    [SCAFFOLD+AUTH]──[UI Pages]──[INTEGRATE]─[Report UI+Polish]─[Demo]
  A:    [DB+Types]───────[Gemini AI]─[INTEGRATE]─[Tuning]──────────[Demo]
  B:      wait───────[GitHub+E2B]────[INTEGRATE]─[Hardening]───────[Demo]
  C:      wait───────[Claude+SSE]────[INTEGRATE]─[Tuning]─────────[Demo]
        |     |           |           |
        |     |           |       ALL 4 MERGE
        |     |       PAIRS START
        |  D+A deliver foundations
     D STARTS FIRST
```

---

## Detailed Execution Order Per Person

### Person D — Frontend Lead

**You start FIRST. Everyone depends on your scaffold.**

```
HOUR 0 ──────────────────────────────────────────────────────────────────
  |
  | 1. Initialize Next.js project (create-next-app)
  | 2. Install ALL dependencies from rules.md Section 2
  | 3. Init shadcn/ui + add all components
  | 4. Create .env.example, .gitignore, folder structure
  | 5. Push to main ← CRITICAL: everyone pulls after this
  |
HOUR 2 ──────────────────────────────────────────────────────────────────
  |
  | 6. Set up Auth0 SDK config (src/lib/auth/auth0.ts)
  | 7. Create requireAuth() middleware ← CRITICAL: A, B, C need this
  | 8. Auth pages: login, callback, logout
  | 9. Root middleware.ts (protect /dashboard/*, /project/*)
  | 10. Deploy to Vercel, verify Auth0 login works
  |
HOUR 5 ──────────────────────────────────────────────────────────────────
  |
  | 11. Landing page (/)
  | 12. Layout + header + sidebar components
  | 13. Dashboard page (/dashboard)
  | 14. New Project page (/project/new) — repo URL input + PRD upload
  |     (mock API responses until A's routes are ready)
  |
HOUR 14 ─── INTEGRATION ────────────────────────────────────────────────
  |
  | 15. Wire New Project page to A's real API routes
  | 16. Wire Run Analysis button to A's analyze route
  |
HOUR 22 ──────────────────────────────────────────────────────────────────
  |
  | 17. Analysis Running page (connect to C's SSE)
  | 18. Results Report page (health score, feature tabs, finding cards)
  | 19. Fix Running page (connect to C's SSE, agent log)
  | 20. Fix Done page (PR link, diff viewer)
  | 21. Polish all pages, loading states, error states
  |
HOUR 34+ ─── TESTING & DEMO ────────────────────────────────────────────
```

### Person A — Backend Lead

**You start alongside D. Deliver types + Supabase client first.**

```
HOUR 0 ──────────────────────────────────────────────────────────────────
  |
  | 1. Create DB migrations (001-006) — run in Supabase dashboard
  |    (Can do this even before D's scaffold, directly in Supabase)
  |
HOUR 1 (after D pushes scaffold) ───────────────────────────────────────
  |
  | 2. Create src/types/index.ts ← CRITICAL: everyone imports from this
  | 3. Create src/lib/supabase/server.ts + client.ts
  | 4. Create src/lib/inngest/client.ts
  | 5. Push to main ← C needs inngest client, everyone needs types
  |
HOUR 5 ──────────────────────────────────────────────────────────────────
  |
  | 6. PRD parsers (pdf.ts, docx.ts, markdown.ts)
  | 7. Upload API route (POST /api/upload)
  | 8. Gemini prompts (analyze-codebase.ts, generate-tests.ts)
  | 9. Gemini client (gemini.ts)
  |    NOTE: You need B's fetchRepoTree() here.
  |    If B isn't ready, stub with hardcoded repo data.
  | 10. Project API routes (GET/POST /api/projects, GET /findings)
  | 11. Inngest analysis job (analyze.ts) — full pipeline
  | 12. Inngest serve endpoint (/api/inngest/route.ts)
  |     Register both analysis.run AND C's fix.run here
  | 13. Test: structured findings JSON from a real repo + real PRD
  |
HOUR 14 ─── INTEGRATION ────────────────────────────────────────────────
  |
  | 14. Replace stub repo functions with B's real GitHub functions
  | 15. Wire D's frontend to your API routes
  | 16. End-to-end test: repo + PRD -> analysis -> findings in DB
  |
HOUR 22 ──────────────────────────────────────────────────────────────────
  |
  | 17. Tune Gemini prompts for accuracy
  | 18. Handle edge cases: large repos, empty PRDs, partial failures
  |
HOUR 34+ ─── TESTING & DEMO ────────────────────────────────────────────
```

### Person B — API Integrations

**You wait for D's scaffold (1-2 hours). Use that time to study APIs.**

```
HOUR 0 ──────────────────────────────────────────────────────────────────
  |
  | 1. Create fix_jobs migration (007) — run in Supabase dashboard
  | 2. Read GitHub REST API docs, E2B docs, Octokit docs
  |    (productive waiting while D scaffolds)
  |
HOUR 2 (after D pushes scaffold) ───────────────────────────────────────
  |
  | 3. GitHub client (client.ts — Octokit factory)
  | 4. GitHub repo functions (repo.ts — fetchRepoTree, fetchFileContent, detectTechStack)
  |    ← CRITICAL: A is blocked on this. Deliver ASAP.
  | 5. Push repo.ts to main so A can use it
  |
HOUR 5 ──────────────────────────────────────────────────────────────────
  |
  | 6. GitHub API routes (repo-tree, file-content)
  | 7. E2B sandbox library (sandbox.ts — createSandbox, destroySandbox)
  | 8. E2B runner (runner.ts — runInSandbox, runLint, runTests, readFile, writeFile)
  | 9. GitHub PR library (pr.ts — createBranch, commitFiles, openPR)
  | 10. Fix trigger API route (POST /api/projects/[id]/fix/[findingId])
  | 11. Test: manually trigger fix -> sandbox spins up -> PR opens on test repo
  |
HOUR 14 ─── INTEGRATION ────────────────────────────────────────────────
  |
  | 12. Wire C's fix job to use your real sandbox + PR functions
  | 13. End-to-end test: finding -> fix -> PR opens
  |
HOUR 22 ──────────────────────────────────────────────────────────────────
  |
  | 14. Harden sandbox: timeout handling, cleanup on crash
  | 15. Improve PR format: meaningful title, description
  |
HOUR 34+ ─── TESTING & DEMO ────────────────────────────────────────────
```

### Person C — AI/Agent Lead

**You wait for D's scaffold (1-2 hours). Use that time to design prompts.**

```
HOUR 0 ──────────────────────────────────────────────────────────────────
  |
  | 1. Design Claude fix prompt on paper/locally
  | 2. Read Claude tool-use docs, plan agent loop architecture
  |    (productive waiting while D scaffolds)
  |
HOUR 2 (after D pushes scaffold) ───────────────────────────────────────
  |
  | 3. SSE emitter helper (emitter.ts) ← CRITICAL: D needs this for UI
  | 4. SSE analysis endpoint (/api/sse/analysis/[runId])
  | 5. SSE fix endpoint (/api/sse/fix/[jobId])
  |    Push SSE endpoints early so D can build live progress UI against them
  |
HOUR 5 ──────────────────────────────────────────────────────────────────
  |
  | 6. Claude client + 4 tool definitions (claude.ts)
  | 7. Fix agent prompt (fix-code.ts)
  | 8. runAgentLoop() — the core tool-use loop
  |    NOTE: You need B's sandbox functions here.
  |    If B isn't ready, stub with local fs operations.
  | 9. Fix Inngest job (fix.ts) — full 7-step pipeline
  | 10. Test agent loop with stubbed sandbox
  |
HOUR 14 ─── INTEGRATION ────────────────────────────────────────────────
  |
  | 11. Replace stubs with B's real sandbox functions
  | 12. Verify A's Inngest serve endpoint registers your fix.run
  | 13. End-to-end test: finding -> fix job -> agent runs -> PR opens
  | 14. Verify SSE streams work with D's frontend
  |
HOUR 22 ──────────────────────────────────────────────────────────────────
  |
  | 15. Tune Claude prompt for reliability
  | 16. Improve SSE error recovery, connection timeouts
  |
HOUR 34+ ─── TESTING & DEMO ────────────────────────────────────────────
```

---

## Critical Path

The critical path is the longest chain of dependent tasks. If any of these are late, the entire project is delayed:

```
D scaffolds (0h)
  -> A creates types (1h)
  -> B delivers fetchRepoTree (3h)
  -> A builds Gemini analysis pipeline (10h)
  -> ALL integrate (14h)
  -> D builds report UI (22h)
  -> ALL test with real repos (34h)
  -> Demo ready (42h)
```

**Bottleneck risk points:**
1. **D's scaffold** — if this is late, everyone is blocked
2. **B's GitHub repo functions** — if late, A can't test analysis with real repos
3. **Block 3 integration** — if any one person's code doesn't work, the merge stalls
4. **Gemini prompt quality** — if analysis produces bad results, the whole demo suffers

---

## Dependency Graph (Who Blocks Whom)

```
D (scaffold + auth)
├──> A (needs scaffold + requireAuth)
│    ├──> B (A needs B's fetchRepoTree — bidirectional)
│    └──> C (C needs A's inngest client + findings in DB)
├──> B (needs scaffold + requireAuth)
│    └──> C (C needs B's sandbox + PR functions)
└──> C (needs scaffold)
     └──> D (D needs C's SSE endpoints for live UI)
```

**Translation:**
- D blocks A, B, C (scaffold)
- B blocks A (GitHub functions)
- A blocks C (types, inngest client, findings data)
- B blocks C (sandbox, PR functions)
- C blocks D (SSE endpoints for live progress UI)

---

## Stub Strategy (When Your Dependency Isn't Ready)

Don't wait idle. Use stubs:

| If you need... | But it's not ready... | Stub with... |
|---------------|----------------------|-------------|
| B's `fetchRepoTree()` | B hasn't delivered yet | Hardcoded file tree JSON for a known repo |
| B's `fetchFileContent()` | B hasn't delivered yet | Hardcoded file content strings |
| B's sandbox functions | B hasn't delivered yet | Local filesystem read/write + `child_process.exec` |
| A's API routes | A hasn't delivered yet | Static JSON responses matching type shapes |
| C's SSE endpoints | C hasn't delivered yet | Mock EventSource that emits fake events on a timer |
| D's `requireAuth()` | D hasn't delivered yet | `async () => ({ id: 'test', github_id: '123', username: 'test' })` |

**IMPORTANT:** When you stub, match the exact type signatures from `shared/rules.md` Section 10. This ensures the real integration is a drop-in replacement.

---

## Communication Checkpoints

| Hour | What Happens | Who Talks |
|------|-------------|-----------|
| 0 | D confirms scaffold is initialized, shares Vercel URL | D -> ALL |
| 2 | D confirms `requireAuth()` is pushed to main | D -> ALL |
| 3 | A confirms types + Supabase client pushed to main | A -> ALL |
| 4 | B confirms `fetchRepoTree()` pushed to main | B -> A |
| 5 | C confirms SSE endpoints pushed (even if stubbed) | C -> D |
| 10 | A reports analysis pipeline status (working/blocked) | A -> ALL |
| 10 | B reports sandbox + PR status (working/blocked) | B -> ALL |
| 10 | C reports agent loop status (working/blocked) | C -> ALL |
| 14 | ALL meet: "Can we integrate?" — Block 3 starts | ALL |
| 22 | ALL verify: "Does the full pipeline work?" | ALL |
| 34 | ALL start testing with real repos | ALL |
| 42 | Demo rehearsal | ALL |

---

## How to Update Progress

1. Open `shared/workflow.md`
2. Find your task in the Progress Tracker tables above
3. Change `[ ]` to `[x]`
4. Commit with message: `[X] Mark step N.N complete — <brief description>`

Example:
```bash
git add shared/workflow.md
git commit -m "[D] Mark step 1.1 complete — scaffold pushed to main"
git push
```

This way the team can `git pull` and instantly see what's done and what's still pending.
