# DevSentinel v2 — Analysis Suite: Workflow & Execution Order

> **Read this BEFORE you start coding v2 features.**
> This document defines the execution order, dependencies, and progress tracking for the v2 Analysis Suite.
>
> **Single developer workflow.** All blocks are sequential — no parallelization needed.
>
> **Prerequisites:** v1 backend (Person A + B tasks) must be complete. Specifically:
> - `src/types/index.ts` exists with all v1 types
> - `src/lib/supabase/server.ts` + `client.ts` exist
> - `src/lib/e2b/sandbox.ts` + `runner.ts` exist
> - `src/lib/inngest/client.ts` + `analyze.ts` exist
> - `src/lib/github/client.ts` + `repo.ts` exist
> - `src/lib/ai/gemini.ts` exists with analysis pipeline
> - All v1 DB migrations (001-007) have been run

---

## Progress Tracker

**RULE: After completing any step, update this tracker.** Change `[ ]` to `[x]` and add a timestamp.

### Block 1 — Foundation (Types + DB Migrations)

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 1.1 | Add v2 types to `src/types/index.ts` (GraphNode, GraphEdge, CodeGraph, SecurityFinding, QualityMetrics, CodeSmell, GeneratedTestFile, CompositeHealthScore, all API response types) | v1 types exist | `[ ]` |
| 1.2 | Create migration `008_create_code_graphs.sql` — run in Supabase | 1.1 | `[ ]` |
| 1.3 | Create migration `009_create_security_findings.sql` — run in Supabase | 1.1 | `[ ]` |
| 1.4 | Create migration `010_create_quality_reports.sql` — run in Supabase | 1.1 | `[ ]` |
| 1.5 | Create migration `011_create_generated_tests.sql` — run in Supabase | 1.1 | `[ ]` |
| 1.6 | Create migration `012_update_analysis_run_status.sql` — add new status values | 1.1 | `[ ]` |
| 1.7 | Add new env vars to `.env.example` (SONAR_TOKEN, SONAR_ORGANIZATION, TESTSPRITE_API_KEY) | Nothing | `[ ]` |
| 1.8 | Install `react-force-graph-2d` npm dependency | Nothing | `[ ]` |

**Block 1 Gate:** All v2 types compile. All 5 new migrations run successfully. `AnalysisRun.status` accepts new values.

---

### Block 2 — Code Graph Builder

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 2.1 | Create `src/lib/graph/types.ts` — local types for graph building (internal helpers, not DB types) | 1.1 | `[ ]` |
| 2.2 | Create `src/lib/graph/builder.ts` — `buildCodeGraph()` function that runs graph-sitter in E2B sandbox | 1.1, v1 sandbox.ts | `[ ]` |
| 2.3 | Create Python analysis script (embedded as string in builder.ts) that graph-sitter runs in sandbox | 2.2 | `[ ]` |
| 2.4 | Add JS/TS fallback using madge in `builder.ts` for repos without Python | 2.2 | `[ ]` |
| 2.5 | Create `src/lib/graph/analyzer.ts` — `analyzeGraph()` with cycle detection, coupling analysis, orphan detection | 2.2 | `[ ]` |
| 2.6 | Add `installAnalysisTools()` to `src/lib/e2b/sandbox.ts` | v1 sandbox.ts | `[ ]` |
| 2.7 | Create `src/app/api/projects/[id]/graph/route.ts` — GET endpoint | 1.2, 2.5 | `[ ]` |
| 2.8 | Test: manually trigger graph build on a test repo in E2B → verify JSON output | 2.5 | `[ ]` |

**Block 2 Gate:** `buildCodeGraph()` returns valid CodeGraph JSON. `analyzeGraph()` correctly identifies circular deps. API endpoint returns graph data.

---

### Block 3 — Security Scanning (Semgrep)

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 3.1 | Create `src/lib/security/types.ts` — internal helper types for Semgrep SARIF parsing | 1.1 | `[ ]` |
| 3.2 | Create `src/lib/security/semgrep.ts` — `runSemgrepScan()` that installs + runs Semgrep in E2B sandbox | 2.6 (installAnalysisTools) | `[ ]` |
| 3.3 | Implement SARIF JSON parsing → `SecurityFinding[]` mapping | 3.2 | `[ ]` |
| 3.4 | Add noise filtering (exclude test files, vendor dirs, INFO in non-critical paths) | 3.3 | `[ ]` |
| 3.5 | Create `src/app/api/projects/[id]/security/route.ts` — GET endpoint with severity filtering | 1.3, 3.3 | `[ ]` |
| 3.6 | Test: run Semgrep on a repo with known vulnerabilities → verify findings match | 3.4 | `[ ]` |

**Block 3 Gate:** Semgrep runs in E2B sandbox. SARIF output correctly parsed. API endpoint returns security findings with CWE/OWASP tags.

---

### Block 4 — Code Quality (SonarCloud)

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 4.1 | Create SonarCloud account + organization (if not exists) | Nothing | `[ ]` |
| 4.2 | Create `src/lib/quality/types.ts` — internal helper types for SonarCloud API responses | 1.1 | `[ ]` |
| 4.3 | Create `src/lib/quality/sonarcloud.ts` — SonarCloud API client | 4.1 | `[ ]` |
| 4.4 | Implement `triggerSonarScan()` — generates sonar-project.properties + runs sonar-scanner in E2B | 4.3, 2.6 | `[ ]` |
| 4.5 | Implement `fetchQualityMetrics()` — calls SonarCloud REST API for measures | 4.3 | `[ ]` |
| 4.6 | Implement `fetchQualityIssues()` — calls SonarCloud REST API for issues | 4.3 | `[ ]` |
| 4.7 | Create `src/app/api/projects/[id]/quality/route.ts` — GET endpoint | 1.4, 4.5 | `[ ]` |
| 4.8 | Test: trigger SonarCloud scan on a test repo → verify metrics returned | 4.6 | `[ ]` |

**Block 4 Gate:** SonarCloud scan triggers successfully. Metrics (A-E ratings, coverage, duplication) fetched via API. Issues list populated.

---

### Block 5 — Test File Generation (TestSprite)

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 5.1 | Create TestSprite account + get API key | Nothing | `[ ]` |
| 5.2 | Configure TestSprite MCP in `.claude/settings.local.json` | 5.1 | `[ ]` |
| 5.3 | Create `src/lib/testing/types.ts` — internal helper types | 1.1 | `[ ]` |
| 5.4 | Create `src/lib/testing/testsprite.ts` — `generateTestFiles()` function | 5.1 | `[ ]` |
| 5.5 | Implement context building: extract framework, routes, models from codebase analysis | 5.4 | `[ ]` |
| 5.6 | Create `src/app/api/projects/[id]/tests/route.ts` — GET endpoint | 1.5, 5.4 | `[ ]` |
| 5.7 | Test: generate test files for a test repo → verify output is valid, runnable code | 5.5 | `[ ]` |

**Block 5 Gate:** TestSprite generates real test files. Files contain valid test code for the detected framework. API endpoint returns generated tests.

---

### Block 6 — Pipeline Integration

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 6.1 | Modify `src/lib/inngest/analyze.ts` — add `build-code-graph` step (Step 3) | Block 2 complete | `[ ]` |
| 6.2 | Modify `src/lib/inngest/analyze.ts` — add `security-scan` step (Step 4) | Block 3 complete | `[ ]` |
| 6.3 | Modify `src/lib/inngest/analyze.ts` — add `quality-scan` step (Step 5) | Block 4 complete | `[ ]` |
| 6.4 | Modify `src/lib/inngest/analyze.ts` — add `generate-test-files` step (Step 8) | Block 5 complete | `[ ]` |
| 6.5 | Modify `src/lib/ai/gemini.ts` — pass graph summary to Gemini Pass 2 prompt | 6.1 | `[ ]` |
| 6.6 | Modify `src/lib/ai/prompts/analyze-codebase.ts` — update REQUIREMENT_ANALYSIS_PROMPT to reference graph | 6.5 | `[ ]` |
| 6.7 | Implement composite health score calculation in step 9 (complete) | 6.1-6.4 | `[ ]` |
| 6.8 | Add fault tolerance — wrap each v2 step in try-catch, continue on failure | 6.1-6.4 | `[ ]` |
| 6.9 | Update SSE events to include new status values | 6.1-6.4 | `[ ]` |
| 6.10 | Implement sandbox reuse — pass same sandbox instance across steps 2-8 | 6.1-6.4 | `[ ]` |
| 6.11 | End-to-end test: trigger full 9-step pipeline on a real repo → all steps complete | 6.10 | `[ ]` |

**Block 6 Gate:** Full 9-step pipeline runs end-to-end. SSE streams all 9 status changes. Composite health score calculated. Pipeline continues if any v2 step fails.

---

### Block 7 — Frontend Pages

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 7.1 | Create `src/components/graph/graph-viewer.tsx` — react-force-graph-2d component | 1.8, 2.7 | `[ ]` |
| 7.2 | Create `src/components/graph/graph-insights.tsx` — sidebar with cycle/coupling/orphan lists | 7.1 | `[ ]` |
| 7.3 | Create graph page: `/project/[id]/graph` (or tab in report page) | 7.1, 7.2 | `[ ]` |
| 7.4 | Create `src/components/security/severity-badge.tsx` | 3.5 | `[ ]` |
| 7.5 | Create `src/components/security/security-finding-card.tsx` | 7.4 | `[ ]` |
| 7.6 | Create security section in report page (or new tab) | 7.4, 7.5 | `[ ]` |
| 7.7 | Create `src/components/quality/rating-card.tsx` + `quality-gate-badge.tsx` | 4.7 | `[ ]` |
| 7.8 | Create `src/components/quality/code-smell-card.tsx` | 7.7 | `[ ]` |
| 7.9 | Create quality section in report page (or new tab) | 7.7, 7.8 | `[ ]` |
| 7.10 | Create `src/components/testing/test-file-card.tsx` + `test-code-preview.tsx` | 5.6 | `[ ]` |
| 7.11 | Create tests section in report page (or new tab) | 7.10 | `[ ]` |
| 7.12 | Update health score display to show composite breakdown | 6.7 | `[ ]` |
| 7.13 | Update Analysis Running page to show 9 stages instead of 5 | 6.9 | `[ ]` |

**Block 7 Gate:** All 4 new sections/tabs render correctly. Graph visualization is interactive. Security findings show CWE/OWASP tags. Quality shows A-E ratings. Generated tests show syntax-highlighted code.

---

### Block 8 — Testing & Polish

| # | Task | Depends On | Status |
|---|------|-----------|--------|
| 8.1 | Test full pipeline with real repo #1 (JS/TS project, e.g., Express API) | Block 6 complete | `[ ]` |
| 8.2 | Test full pipeline with real repo #2 (Python project, e.g., FastAPI) | 8.1 | `[ ]` |
| 8.3 | Test full pipeline with real repo #3 (large repo, 1000+ files) | 8.2 | `[ ]` |
| 8.4 | Test graph builder with repo that has circular dependencies → verify detection | 8.1 | `[ ]` |
| 8.5 | Test Semgrep with repo that has known XSS/SQLi vulnerabilities → verify detection | 8.1 | `[ ]` |
| 8.6 | Test SonarCloud with repo that has code smells → verify A-E rating | 8.1 | `[ ]` |
| 8.7 | Test TestSprite generates valid test files for detected framework | 8.1 | `[ ]` |
| 8.8 | Test graceful degradation: run pipeline without SONAR_TOKEN → quality step skipped | 8.1 | `[ ]` |
| 8.9 | Test graceful degradation: run pipeline without TESTSPRITE_API_KEY → test gen skipped | 8.1 | `[ ]` |
| 8.10 | Fix edge cases found during testing | 8.1-8.9 | `[ ]` |
| 8.11 | Performance optimization: ensure large repo analysis < 8 minutes total | 8.10 | `[ ]` |

**Block 8 Gate:** Pipeline works on 3+ real repos. All 4 features produce correct results. Graceful degradation works when optional services are unconfigured.

---

## Execution Timeline

```
Block 1 ── Foundation ──── Types, migrations, env vars
  |
Block 2 ── Code Graph ──── graph-sitter + madge in E2B, analyzer, API
  |
Block 3 ── Security ────── Semgrep in E2B, SARIF parsing, API
  |
Block 4 ── Quality ─────── SonarCloud setup, API client, API
  |
Block 5 ── Test Gen ────── TestSprite setup, generator, API
  |
Block 6 ── Pipeline ────── Wire all 4 into analyze.ts, health score, SSE
  |
Block 7 ── Frontend ────── Graph viz, security dashboard, quality metrics, test preview
  |
Block 8 ── Testing ─────── Real repos, edge cases, performance
```

---

## Dependency Graph

```
Block 1 (Types + DB)
├──> Block 2 (Graph)
│    └──> Block 6.1, 6.5, 6.6 (graph into pipeline + Gemini)
├──> Block 3 (Security)
│    └──> Block 6.2 (security into pipeline)
├──> Block 4 (Quality) — also needs SonarCloud account
│    └──> Block 6.3 (quality into pipeline)
├──> Block 5 (TestSprite) — also needs TestSprite account
│    └──> Block 6.4 (test gen into pipeline)
└──> Block 6.7-6.10 (health score, fault tolerance, SSE, sandbox reuse)
     └──> Block 7 (frontend) — needs all APIs working
          └──> Block 8 (testing)
```

**Key insight:** Blocks 2-5 are independent of each other. You can work on them in any order, but the recommended order (2→3→4→5) is chosen because:
- Block 2 (Graph) needs no external API keys — fastest to verify
- Block 3 (Security) needs only E2B — no new accounts
- Block 4 (Quality) needs SonarCloud account — can set up while coding Block 3
- Block 5 (TestSprite) needs TestSprite account — can set up while coding Block 4

---

## Sandbox Lifecycle

The E2B sandbox is created once in Step 2 (understand-codebase) and reused across all v2 steps:

```
Step 2: understand-codebase
  ├── Creates sandbox, clones repo, installs project deps
  │
Step 3: build-code-graph
  ├── Installs graph-sitter (pip) + madge (npm) in SAME sandbox
  ├── Runs graph analysis
  │
Step 4: security-scan
  ├── Installs semgrep (pip) in SAME sandbox
  ├── Runs semgrep scan
  │
Step 5: quality-scan
  ├── Installs sonar-scanner in SAME sandbox
  ├── Runs sonar-scanner
  │
Steps 6-8: generate-tests, run-tests, generate-test-files
  ├── Use SAME sandbox
  │
Step 9: complete
  └── Destroys sandbox (cleanup)
```

**Implementation note:** The sandbox instance must be passed between Inngest steps. Since Inngest steps are serializable, pass the `sandboxId` and reconnect via `Sandbox.connect(sandboxId)` in each step.

---

## Critical Path

```
Block 1 (types + migrations)
  → Block 2 (graph builder)
  → Block 6.1 (graph into pipeline)
  → Block 6.5 (graph into Gemini)
  → Block 6.7 (composite health score)
  → Block 6.11 (end-to-end test)
  → Block 7 (frontend)
  → Block 8 (testing)
```

**Bottleneck risk points:**
1. **graph-sitter compatibility** — if it doesn't work in E2B's Python environment, fall back to madge-only
2. **Semgrep install size** — Semgrep is ~100MB, may be slow to install in sandbox. Consider pre-built E2B template
3. **SonarCloud API latency** — scan results may take 2-5 minutes. Implement polling with timeout
4. **TestSprite API availability** — if API is down, skip gracefully
5. **Sandbox memory** — running graph-sitter + semgrep + sonar-scanner in one sandbox may hit E2B memory limits. Monitor and split if needed

---

## How to Update Progress

1. Open `shared/v2-analysis-suite/workflow.md`
2. Find your task in the Progress Tracker tables
3. Change `[ ]` to `[x]`
4. Commit with message: `[v2] Mark step N.N complete — <brief description>`

Example:
```bash
git add shared/v2-analysis-suite/workflow.md
git commit -m "[v2] Mark step 2.2 complete — graph builder with graph-sitter in E2B"
git push
```
