# DevSentinel v2 — Analysis Suite PRD

> **This document extends the original DevSentinel PRD (see `shared/PRD.md`).**
> It defines four new capabilities that transform DevSentinel from a compliance-only auditor into a full-spectrum code intelligence platform.
>
> **Single developer owns all v2 features.** No A/B/C/D split.

---

## 1. Problem Statement

DevSentinel v1 compares code against PRD requirements using AI-semantic analysis. It answers: "Does this codebase implement what the spec says?" But it cannot answer:

- **"What does this codebase structurally look like?"** — No import graph, no call graph, no dependency visualization. Large repos are a black box.
- **"Is this codebase secure?"** — No SAST scanning. SQL injection, XSS, hardcoded secrets, and OWASP Top 10 vulnerabilities go undetected.
- **"Is this codebase maintainable?"** — No code smell detection, no complexity metrics, no duplication analysis. Technical debt accumulates silently.
- **"Where are the actual test files?"** — DevSentinel generates findings (pass/fail verdicts), but never produces real, runnable test files that can be committed to the repo.

v2 closes all four gaps.

---

## 2. Product Overview

### v2 Feature Summary

| Feature | What It Does | Tool Used | Runs In |
|---------|-------------|-----------|---------|
| Code Graph Builder | Builds structural dependency, import, and call graphs from source code | graph-sitter + madge | E2B Sandbox |
| Security Scanner | Detects OWASP Top 10 vulnerabilities, hardcoded secrets, insecure patterns | Semgrep (SAST) | E2B Sandbox |
| Code Quality Analyzer | Measures maintainability, complexity, duplication, code smells | SonarCloud API | SonarCloud (hosted) |
| Test File Generator | Produces real, committable test files (unit, integration, e2e) | TestSprite MCP | TestSprite Cloud |

### How v2 Fits Into the Existing Pipeline

v1 pipeline:
```
parse-prd → understand-codebase → generate-tests → run-tests → complete
```

v2 pipeline (4 new steps inserted):
```
parse-prd → understand-codebase → build-code-graph → security-scan → quality-scan → generate-tests → run-tests → generate-test-files → complete
```

All v2 features produce data that feeds into the existing report. The health score becomes a composite of compliance + security + quality + structural health.

### Updated Core User Flow

| Phase | v1 | v2 Addition |
|-------|----|----|
| 1. Auth | Sign in via Auth0 | No change |
| 2. Connect | Paste repo URL + upload PRD | No change |
| 3. Analyse | AI compares PRD to codebase | + Code graph built + Semgrep security scan + SonarCloud quality analysis |
| 4. Report | Pass/fail per requirement | + Graph visualization + Security findings (CWE/OWASP) + Quality metrics (A-E ratings) + Generated test files |
| 5. Auto-Fix | Agent fixes failing features | + Can fix security vulnerabilities + Commits generated test files in PR |

---

## 3. Detailed Feature Specification

### 3.1 Code Graph Builder

The Code Graph Builder creates a structural representation of the codebase — mapping every file, function, class, and import relationship as a traversable graph.

**What It Builds:**

| Graph Type | Nodes | Edges | Example |
|-----------|-------|-------|---------|
| Import Graph | Files | `imports` | `auth.ts` → imports → `jwt-utils.ts` |
| Call Graph | Functions | `calls` | `loginHandler()` → calls → `validateToken()` |
| Class Hierarchy | Classes | `extends`, `implements` | `AdminUser` → extends → `BaseUser` |
| Module Dependency | Directories | `depends_on` | `src/api/` → depends_on → `src/lib/` |

**How It Works:**

1. Codebase is cloned in the E2B sandbox (already done by existing pipeline)
2. For Python + TypeScript repos: install `graph-sitter` (`pip install graph-sitter`) in the sandbox
3. Run a Python analysis script that uses graph-sitter to parse all source files
4. graph-sitter outputs structured data: functions, classes, imports, and their relationships
5. For JS/TS repos (fallback): install `madge` (`npm install -g madge`) and run `madge --json src/`
6. Combine outputs into a unified `CodeGraph` JSON structure
7. Run graph analysis: detect circular dependencies, identify high-coupling modules, find orphan files
8. Store graph + analysis summary in `code_graphs` table

**Graph Insights Generated:**

| Insight | What It Means | Why It Matters |
|---------|--------------|----------------|
| Circular Dependencies | Module A imports B, B imports A | Build failures, tight coupling, hard to test in isolation |
| High Coupling | A single file is imported by 20+ others | Fragile — changes here break everything downstream |
| Orphan Files | Files with zero imports and zero importers | Dead code, forgotten utilities, bloated repo |
| Deep Dependency Chains | File → 10+ levels of transitive imports | Slow builds, hard to reason about, testing nightmare |
| God Modules | Files with 50+ exported symbols | Too many responsibilities, violates single-responsibility |

**Integration with Existing Analysis:**

The graph summary is injected into Gemini's Pass 2 prompt. This gives the AI structural context it previously lacked:
- "This route handler has a circular dependency with the auth middleware"
- "This database model is an orphan — it exists but nothing imports it"
- "This utility file is the most-coupled module in the repo (imported by 25 files)"

**Standalone Visualization:**

A dedicated API endpoint returns the full graph JSON. The frontend renders it as an interactive force-directed graph using `react-force-graph-2d`:
- Nodes colored by type (file=blue, function=green, class=purple)
- Edge thickness proportional to coupling strength
- Click a node to see its dependencies
- Highlight circular dependency cycles in red
- Filter by directory, file type, or relationship type

**Performance for Large Repos:**

- graph-sitter handles repos with 10,000+ files efficiently (tree-sitter based parsing)
- For very large repos (>5,000 files): chunk by top-level directory, build partial graphs, merge
- File-level graph (faster) vs symbol-level graph (deeper) — user can choose via query param
- Graph generation timeout: 120 seconds. If exceeded, return partial graph with warning.

---

### 3.2 Security Vulnerability Scanner (Semgrep)

Semgrep is a lightweight, open-source SAST (Static Application Security Testing) tool that supports 30+ languages. It runs inside the E2B sandbox alongside the existing analysis pipeline.

**What Semgrep Detects:**

| Vulnerability Category | OWASP | CWE | Example |
|----------------------|-------|-----|---------|
| SQL Injection | A03:2021 | CWE-89 | String concatenation in SQL queries |
| Cross-Site Scripting (XSS) | A03:2021 | CWE-79 | Unsanitized user input in HTML |
| Command Injection | A03:2021 | CWE-78 | `exec()` with user-controlled input |
| Hardcoded Secrets | A02:2021 | CWE-798 | API keys, passwords in source code |
| Insecure Cryptography | A02:2021 | CWE-327 | MD5/SHA1 for password hashing |
| Path Traversal | A01:2021 | CWE-22 | `../` in file path without sanitization |
| SSRF | A10:2021 | CWE-918 | User-controlled URL in HTTP requests |
| Open Redirect | A01:2021 | CWE-601 | Redirect to user-supplied URL |
| Insecure Deserialization | A08:2021 | CWE-502 | `pickle.loads()` on untrusted data |
| Missing Authentication | A07:2021 | CWE-306 | Unprotected API endpoints |

**How It Works:**

1. In the E2B sandbox (repo already cloned): `pip install semgrep`
2. Run: `semgrep scan --config auto --json --output /tmp/semgrep-results.json /home/user/repo`
3. `--config auto` uses Semgrep's curated community ruleset (3,000+ rules, OWASP/CWE coverage)
4. Parse the JSON output (SARIF format) into `SecurityFinding[]`
5. Filter noise: exclude INFO-level findings in test files, vendor directories
6. Map Semgrep severity (ERROR/WARNING/INFO) to confidence scores
7. Store in `security_findings` table with CWE and OWASP tags

**Security Finding Output:**

Each finding includes:
- Rule ID (e.g., `javascript.express.security.audit.xss.mustache-escape`)
- Severity: ERROR (critical), WARNING (medium), INFO (low)
- OWASP category (e.g., A03:2021 Injection)
- CWE ID (e.g., CWE-79)
- Exact file path + line range
- Code snippet showing the vulnerable code
- Fix suggestion from Semgrep's rule metadata

**Integration with Auto-Fix:**

Security findings can be passed to the existing fix agent (Claude/Gemini). The agent receives:
- The vulnerability type and CWE reference
- The exact code snippet
- Semgrep's suggested fix pattern
- The agent writes a secure version and opens a PR

**Language Support:**

Semgrep auto-detects languages. Relevant for DevSentinel's target repos:
- JavaScript/TypeScript (Express, Next.js, React)
- Python (FastAPI, Django, Flask)
- Go, Java, Ruby, PHP, C#, Rust, and more

---

### 3.3 Code Quality Analyzer (SonarCloud)

SonarCloud is a hosted code quality platform that measures maintainability, reliability, security, and test coverage. It provides letter-grade ratings (A-E) and actionable issue lists.

**What SonarCloud Measures:**

| Metric | What It Means | Rating Scale |
|--------|--------------|-------------|
| Reliability | Bugs in the code | A (0 bugs) → E (>1 blocker) |
| Security | Vulnerabilities | A (0 vulns) → E (>1 blocker) |
| Maintainability | Code smells, tech debt | A (<5% debt ratio) → E (>50%) |
| Coverage | Test coverage % | 0-100% |
| Duplications | Duplicated lines % | 0-100% |
| Complexity | Cyclomatic complexity | Absolute number |
| Technical Debt | Estimated fix time | e.g., "2d 4h" |

**How It Works:**

1. During analysis, generate a `sonar-project.properties` file dynamically in the E2B sandbox:
   ```properties
   sonar.projectKey={org}_{repo_name}
   sonar.organization={org}
   sonar.sources=.
   sonar.host.url=https://sonarcloud.io
   sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/.next/**
   ```
2. Run `sonar-scanner` CLI in the sandbox (or trigger via SonarCloud API)
3. Wait for analysis to complete (poll SonarCloud API: `GET /api/ce/task?id={taskId}`)
4. Fetch metrics: `GET /api/measures/component?component={key}&metricKeys=reliability_rating,security_rating,sqale_rating,coverage,duplicated_lines_density,code_smells,bugs,vulnerabilities,sqale_debt_ratio,complexity`
5. Fetch issues: `GET /api/issues/search?componentKeys={key}&types=CODE_SMELL,BUG,VULNERABILITY&ps=100`
6. Store metrics + top issues in `quality_reports` table

**Code Smell Types Detected:**

| Category | Example | Impact |
|----------|---------|--------|
| Cognitive Complexity | Deeply nested if/else chains | Hard to understand and maintain |
| Duplicated Code | Same 20 lines copied across 3 files | Bug fixes must be applied in multiple places |
| Long Methods | Function with 200+ lines | Hard to test, hard to reuse |
| Dead Code | Unreachable branches, unused variables | Confusing for new developers |
| Magic Numbers | `if (status === 3)` instead of a constant | Intent unclear, error-prone changes |
| God Classes | Class with 50+ methods | Too many responsibilities |

**Quality Gate:**

SonarCloud provides a pass/fail quality gate. Default conditions:
- No new bugs (reliability)
- No new vulnerabilities (security)
- Code smells maintained below threshold
- Coverage >= 80% on new code
- Duplication <= 3% on new code

The quality gate status is included in the DevSentinel report.

**Prerequisites:**

- SonarCloud account (free for public repos)
- Organization created on sonarcloud.io
- `SONAR_TOKEN` and `SONAR_ORGANIZATION` environment variables

---

### 3.4 Test File Generator (TestSprite MCP)

TestSprite is an AI-first testing platform that generates comprehensive, runnable test files. Its MCP server integrates directly with Claude Code for interactive use and can also be triggered programmatically.

**What TestSprite Generates:**

| Test Type | Framework | Example Output |
|-----------|-----------|---------------|
| Unit Tests | Jest / Vitest / pytest | `tests/unit/auth.test.ts` — tests for `validateToken()`, `hashPassword()` |
| Integration Tests | Supertest / httpx | `tests/integration/api-users.test.ts` — tests for `POST /api/users` |
| E2E Tests | Playwright / Cypress | `tests/e2e/login-flow.spec.ts` — full login → dashboard flow |
| API Tests | REST assertions | `tests/api/endpoints.test.ts` — status codes, response shapes, error cases |

**How It Works:**

**Path A — MCP Integration (Interactive Claude Code Use):**
1. TestSprite MCP server is configured in Claude Code settings:
   ```json
   {
     "mcpServers": {
       "TestSprite": {
         "command": "npx",
         "args": ["@testsprite/testsprite-mcp@latest"],
         "env": { "API_KEY": "<testsprite-api-key>" }
       }
     }
   }
   ```
2. During a Claude Code session, user can ask: "Generate comprehensive tests for this project using TestSprite"
3. TestSprite analyzes the codebase, generates test files, writes them to the repo
4. Tests are committed alongside code changes

**Path B — Pipeline Integration (Automated Analysis):**
1. After Gemini generates findings (existing step), trigger TestSprite via its API
2. Pass the codebase analysis context (framework, routes, models) to TestSprite
3. TestSprite generates test files tailored to the detected framework
4. Store generated test file content in `generated_tests` table
5. When the fix agent creates a PR, include generated test files in the commit
6. Generated tests validate that the fix actually works

**Test Generation Context:**

TestSprite receives:
- The full file tree (from existing GitHub fetch)
- Framework detection (from existing codebase analysis)
- PRD requirements (from existing extraction)
- Failing findings (to generate regression tests)

This context ensures generated tests are relevant, not generic boilerplate.

**Prerequisites:**

- TestSprite account (free tier available)
- `TESTSPRITE_API_KEY` environment variable
- `@testsprite/testsprite-mcp@latest` npm package

---

## 4. Updated Screen Specification

### 4.1 Analysis Running Page — Updated

| UI Element | v1 | v2 Addition |
|-----------|----|----|
| Progress Stages | parsing_prd → understanding_code → generating_tests → running_tests → complete | + building_graph → scanning_security → scanning_quality → ... → generating_test_files |
| Stage Count | 5 stages | 9 stages |
| New Indicators | None | Graph nodes/edges count, security vulns found, quality grade preview |

### 4.2 Results Report Page — New Tabs

| Tab | Content | Data Source |
|-----|---------|------------|
| Compliance (existing) | Pass/fail per requirement | `findings` table |
| Code Graph (new) | Interactive force-directed graph + insights table | `code_graphs` table |
| Security (new) | Vulnerability list with CWE/OWASP tags, severity badges | `security_findings` table |
| Quality (new) | A-E ratings, code smell list, duplication %, tech debt estimate | `quality_reports` table |
| Tests (new) | Generated test files with syntax highlighting, download button | `generated_tests` table |

### 4.3 New: Code Graph Visualization Page

| Route | `/project/[id]/graph` |
|-------|----------------------|
| Layout | Full-width interactive graph canvas |
| Controls | Zoom, pan, filter by type, depth toggle (file/symbol), highlight cycles |
| Node Colors | File=blue, Function=green, Class=purple, Module=gray |
| Edge Colors | imports=gray, calls=blue, extends=orange, circular=red (animated) |
| Sidebar | Insights panel: circular deps count, coupling hotspots, orphan files |
| Click Behavior | Click node → sidebar shows file path, line count, connections list |

### 4.4 New: Security Dashboard

| Route | `/project/[id]/security` |
|-------|-------------------------|
| Layout | Severity breakdown chart + scrollable findings list |
| Severity Badges | ERROR=red, WARNING=orange, INFO=gray |
| Finding Card | Rule ID, OWASP tag, CWE tag, file:line, code snippet, fix suggestion |
| Filters | By severity, by OWASP category, by file path |
| Actions | "Auto-Fix" button on each finding (triggers existing fix agent) |

### 4.5 New: Quality Metrics Dashboard

| Route | `/project/[id]/quality` |
|-------|------------------------|
| Layout | Rating cards (A-E) at top + issues list below |
| Rating Cards | Reliability, Security, Maintainability — each as letter-grade card |
| Metrics Row | Coverage %, Duplications %, Complexity, Tech Debt |
| Quality Gate | PASS/FAIL badge with conditions breakdown |
| Issues List | Sortable by severity (BLOCKER → INFO), filterable by type |

### 4.6 New: Generated Tests Page

| Route | `/project/[id]/tests` |
|-------|----------------------|
| Layout | File tree of generated tests + code preview panel |
| File List | Each generated test file with test count badge and framework tag |
| Code Preview | Syntax-highlighted test file content (read-only) |
| Actions | "Download All" (zip), "Copy to Clipboard", "Include in PR" toggle |

---

## 5. Updated Tech Stack

| Layer | v1 Service | v2 Addition | Why |
|-------|-----------|-------------|-----|
| Code Graph | — | graph-sitter + madge | Structural analysis via tree-sitter AST parsing |
| Security | — | Semgrep (open-source SAST) | 3,000+ rules, OWASP/CWE coverage, 30+ languages |
| Code Quality | — | SonarCloud API | Industry-standard metrics, hosted (no infra to manage) |
| Test Generation | — | TestSprite MCP | AI-first test generation, MCP-native, real test files |
| Graph Visualization | — | react-force-graph-2d | Lightweight, interactive, works with Next.js |

### New Dependencies

```bash
# Graph visualization (frontend)
npm install react-force-graph-2d

# TestSprite MCP (global or project)
npm install -g @testsprite/testsprite-mcp@latest

# No new backend npm deps — Semgrep, graph-sitter, sonar-scanner
# are installed inside E2B sandbox at runtime via pip/npm
```

### New Environment Variables

```bash
# SonarCloud
SONAR_TOKEN=                    # SonarCloud API token
SONAR_ORGANIZATION=             # SonarCloud organization key

# TestSprite
TESTSPRITE_API_KEY=             # TestSprite API key for MCP server
```

---

## 6. Updated Data Model

> Extends the v1 data model (see `shared/rules.md` Section 5). All new tables follow the same conventions: UUID PKs, timestamptz defaults, RLS enforced.

### Table 8: code_graphs

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| run_id | UUID FK → analysis_runs | |
| graph_data | JSONB | Full CodeGraph (nodes + edges) |
| summary | JSONB | Analysis insights (cycles, hotspots, orphans) |
| node_count | INTEGER | Total graph nodes |
| edge_count | INTEGER | Total graph edges |
| created_at | TIMESTAMPTZ | |

### Table 9: security_findings

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| run_id | UUID FK → analysis_runs | |
| project_id | UUID FK → projects | |
| rule_id | TEXT | Semgrep rule identifier |
| severity | TEXT | ERROR, WARNING, INFO |
| message | TEXT | Human-readable vulnerability description |
| file_path | TEXT | File where vulnerability was found |
| line_start | INTEGER | |
| line_end | INTEGER | |
| code_snippet | TEXT | Vulnerable code |
| category | TEXT | Vulnerability category |
| cwe | TEXT[] | CWE identifiers |
| owasp | TEXT[] | OWASP categories |
| fix_suggestion | TEXT | Suggested fix from Semgrep metadata |
| created_at | TIMESTAMPTZ | |

### Table 10: quality_reports

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| run_id | UUID FK → analysis_runs | |
| metrics | JSONB | QualityMetrics (ratings, coverage, debt, etc.) |
| issues | JSONB | CodeSmell[] (top issues by severity) |
| quality_gate | TEXT | PASS or FAIL |
| created_at | TIMESTAMPTZ | |

### Table 11: generated_tests

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| project_id | UUID FK → projects | |
| run_id | UUID FK → analysis_runs | |
| file_path | TEXT | Generated test file path (e.g., `tests/api/users.test.ts`) |
| content | TEXT | Full test file source code |
| test_count | INTEGER | Number of test cases in file |
| test_types | TEXT[] | e.g., `['unit', 'integration']` |
| framework | TEXT | e.g., `jest`, `pytest`, `playwright` |
| created_at | TIMESTAMPTZ | |

---

## 7. Updated Health Score

v1 health score: `passed_tests / total_tests * 100`

v2 composite health score:

| Dimension | Weight | Calculation | Cap |
|-----------|--------|-------------|-----|
| Compliance | 40% | `passed_findings / total_findings` | — |
| Security | 25% | `1 - (critical_vulns / 10)` | Floored at 0 |
| Quality | 20% | SonarCloud maintainability % (A=100, B=80, C=60, D=40, E=20) | — |
| Structural | 15% | `1 - (circular_deps / 10)` | Floored at 0 |

```
health_score = round(
  0.40 * compliance_pct +
  0.25 * security_pct +
  0.20 * quality_pct +
  0.15 * structural_pct
) * 100
```

If any dimension is unavailable (e.g., SonarCloud not configured), its weight is redistributed proportionally among the remaining dimensions.

---

## 8. Non-Functional Requirements

| Requirement | v1 Spec | v2 Spec |
|------------|---------|---------|
| Analysis Speed | 500-file repo + 20-page PRD < 5 min | < 8 min (includes graph + security + quality) |
| Graph Generation | — | 5,000-file repo < 120 seconds |
| Security Scan | — | 10,000-file repo < 90 seconds |
| Quality Analysis | — | SonarCloud results available < 5 minutes after trigger |
| Test Generation | — | 10+ test files generated < 60 seconds |
| Pipeline Steps | 5 | 9 (all sequential, each streams progress via SSE) |
| Health Score | Simple pass/fail % | Composite score with 4 weighted dimensions |
| Sandbox Resources | E2B default | E2B with Semgrep + graph-sitter + sonar-scanner installed |

---

## 9. Out of Scope — v2.0

| Feature | Deferred To |
|---------|------------|
| Custom Semgrep rule authoring | v2.1 |
| SonarQube self-hosted option | v2.1 |
| Graph diff between commits (structural changes over time) | v2.1 |
| Test file auto-execution in sandbox before PR | v2.1 |
| DAST (Dynamic Application Security Testing) | v3.0 |
| SCA (Software Composition Analysis) for dependencies | v2.1 |
| Custom quality gate configuration per project | v2.1 |
| Multi-repo graph analysis (cross-repo dependencies) | v3.0 |

---

## 10. Success Criteria

| Metric | Target |
|--------|--------|
| Code graph accuracy | Graph correctly identifies 90%+ of import relationships |
| Security scan precision | < 20% false positive rate on ERROR-level findings |
| SonarCloud integration | Metrics fetched and displayed within 5 minutes of trigger |
| Test file quality | Generated tests have > 70% pass rate when run against target repo |
| Health score accuracy | Composite score directionally correlates with repo quality |
| Pipeline reliability | 9-step pipeline completes without error on 8/10 test repos |
| Large repo support | Graph + security scan completes for repos with 5,000+ files |
