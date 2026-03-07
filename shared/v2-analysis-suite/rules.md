# DevSentinel v2 — Analysis Suite: Master Rules & Architecture

> **Read this file before writing any v2 code.**
> This extends the original rules (`shared/rules.md`). All v1 conventions, coding standards, and patterns still apply.
> All v2 features are owned by a single developer.
>
> **ALSO READ:** `shared/v2-analysis-suite/PRD.md` for feature specs and `shared/v2-analysis-suite/workflow.md` for execution order.

---

## 1. Scope

v2 adds four new capabilities to DevSentinel's analysis pipeline:

1. **Code Graph Builder** — structural dependency/import/call graphs
2. **Security Scanner** — Semgrep SAST in E2B sandbox
3. **Code Quality Analyzer** — SonarCloud API integration
4. **Test File Generator** — TestSprite MCP integration

All four integrate into the existing Inngest analysis pipeline as new steps.

---

## 2. New Dependencies

Install these in the existing `devsentinal/` project:

```bash
# Frontend — graph visualization
npm install react-force-graph-2d

# TestSprite MCP server (for Claude Code integration)
npm install -g @testsprite/testsprite-mcp@latest
```

**In-sandbox dependencies** (installed at runtime inside E2B, NOT in the Next.js project):

```bash
# These run INSIDE the E2B sandbox during analysis:
pip install graph-sitter semgrep    # Python tools
npm install -g madge                # JS/TS dependency graph (fallback)
# sonar-scanner installed via: npm install -g sonarqube-scanner
```

---

## 3. Source Tree — New Files

> All new files are owned by a single developer. v1 file ownership rules still apply — do not modify v1 files owned by others without coordination.

```
devsentinal/
├── src/
│   ├── types/
│   │   └── index.ts                                    # [MODIFY] Add v2 types
│   │
│   ├── app/api/
│   │   └── projects/[id]/
│   │       ├── graph/
│   │       │   └── route.ts                            # [NEW] GET — code graph
│   │       ├── security/
│   │       │   └── route.ts                            # [NEW] GET — security findings
│   │       ├── quality/
│   │       │   └── route.ts                            # [NEW] GET — quality metrics
│   │       └── tests/
│   │           └── route.ts                            # [NEW] GET — generated test files
│   │
│   ├── lib/
│   │   ├── graph/
│   │   │   ├── types.ts                                # [NEW] GraphNode, GraphEdge, CodeGraph
│   │   │   ├── builder.ts                              # [NEW] Build graph in E2B sandbox
│   │   │   └── analyzer.ts                             # [NEW] Cycle detection, coupling analysis
│   │   │
│   │   ├── security/
│   │   │   ├── types.ts                                # [NEW] SecurityFinding types
│   │   │   └── semgrep.ts                              # [NEW] Semgrep execution + SARIF parsing
│   │   │
│   │   ├── quality/
│   │   │   ├── types.ts                                # [NEW] QualityMetrics, CodeSmell types
│   │   │   └── sonarcloud.ts                           # [NEW] SonarCloud API client
│   │   │
│   │   ├── testing/
│   │   │   ├── types.ts                                # [NEW] GeneratedTestFile types
│   │   │   └── testsprite.ts                           # [NEW] TestSprite integration
│   │   │
│   │   ├── e2b/
│   │   │   └── sandbox.ts                              # [MODIFY] Add installAnalysisTools()
│   │   │
│   │   ├── ai/
│   │   │   ├── gemini.ts                               # [MODIFY] Accept graph data in Pass 2
│   │   │   └── prompts/
│   │   │       └── analyze-codebase.ts                 # [MODIFY] Reference graph in prompt
│   │   │
│   │   └── inngest/
│   │       └── analyze.ts                              # [MODIFY] Add 4 new pipeline steps
│   │
│   └── components/
│       ├── graph/
│       │   ├── graph-viewer.tsx                         # [NEW] Force-directed graph component
│       │   └── graph-insights.tsx                       # [NEW] Insights sidebar
│       │
│       ├── security/
│       │   ├── security-finding-card.tsx                # [NEW] Security finding card
│       │   └── severity-badge.tsx                       # [NEW] ERROR/WARNING/INFO badge
│       │
│       ├── quality/
│       │   ├── rating-card.tsx                          # [NEW] A-E rating display
│       │   ├── quality-gate-badge.tsx                   # [NEW] PASS/FAIL badge
│       │   └── code-smell-card.tsx                      # [NEW] Code smell issue card
│       │
│       └── testing/
│           ├── test-file-card.tsx                       # [NEW] Generated test file card
│           └── test-code-preview.tsx                    # [NEW] Syntax-highlighted preview
│
├── supabase/migrations/
│   ├── 008_create_code_graphs.sql                      # [NEW]
│   ├── 009_create_security_findings.sql                # [NEW]
│   ├── 010_create_quality_reports.sql                  # [NEW]
│   ├── 011_create_generated_tests.sql                  # [NEW]
│   └── 012_update_analysis_run_status.sql              # [NEW] Add new status values
```

---

## 4. Database Schema

All tables use UUID primary keys, timestamptz defaults, and have RLS enabled. Follow v1 patterns exactly.

### Table 8: code_graphs

```sql
CREATE TABLE code_graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  graph_data JSONB NOT NULL,
  summary JSONB,
  node_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE code_graphs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project graphs" ON code_graphs
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Table 9: security_findings

```sql
CREATE TABLE security_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  rule_id TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
  message TEXT NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  code_snippet TEXT,
  category TEXT,
  cwe TEXT[],
  owasp TEXT[],
  fix_suggestion TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE security_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project security findings" ON security_findings
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Table 10: quality_reports

```sql
CREATE TABLE quality_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  metrics JSONB NOT NULL,
  issues JSONB,
  quality_gate TEXT CHECK (quality_gate IN ('PASS', 'FAIL')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE quality_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project quality reports" ON quality_reports
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Table 11: generated_tests

```sql
CREATE TABLE generated_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  run_id UUID REFERENCES analysis_runs(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  content TEXT NOT NULL,
  test_count INTEGER DEFAULT 0,
  test_types TEXT[],
  framework TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE generated_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can access own project generated tests" ON generated_tests
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );
```

### Migration 12: Update analysis_runs status

```sql
-- Drop existing check constraint and add new values
ALTER TABLE analysis_runs DROP CONSTRAINT IF EXISTS analysis_runs_status_check;
ALTER TABLE analysis_runs ADD CONSTRAINT analysis_runs_status_check
  CHECK (status IN (
    'pending', 'parsing_prd', 'understanding_code',
    'building_graph', 'scanning_security', 'scanning_quality',
    'generating_tests', 'running_tests', 'generating_test_files',
    'complete', 'error'
  ));
```

---

## 5. New TypeScript Types

Add these to `src/types/index.ts` below the existing types:

```typescript
// ============================================================
// V2 — CODE GRAPH TYPES
// ============================================================

export interface GraphNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'module';
  file_path: string;
  name: string;
  line_start?: number;
  line_end?: number;
  metrics?: {
    lines: number;
    complexity?: number;
    exports?: number;
  };
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'imports' | 'calls' | 'extends' | 'implements' | 'uses';
}

export interface CodeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    total_files: number;
    total_symbols: number;
    languages: string[];
    generated_at: string;
  };
}

export interface GraphSummary {
  circular_dependencies: { cycle: string[]; files: string[] }[];
  high_coupling: { file: string; importers: number; imports: number }[];
  orphan_files: string[];
  deep_chains: { root: string; depth: number }[];
  god_modules: { file: string; exports: number }[];
}

export interface CodeGraphRow {
  id: string;
  project_id: string;
  run_id: string;
  graph_data: CodeGraph;
  summary: GraphSummary | null;
  node_count: number;
  edge_count: number;
  created_at: string;
}

// ============================================================
// V2 — SECURITY TYPES
// ============================================================

export interface SecurityFinding {
  id: string;
  run_id: string;
  project_id: string;
  rule_id: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  file_path: string;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  category: string | null;
  cwe: string[];
  owasp: string[];
  fix_suggestion: string | null;
  created_at: string;
}

// ============================================================
// V2 — CODE QUALITY TYPES
// ============================================================

export interface QualityMetrics {
  reliability_rating: string;
  security_rating: string;
  maintainability_rating: string;
  coverage: number;
  duplicated_lines_density: number;
  code_smells: number;
  bugs: number;
  vulnerabilities: number;
  technical_debt: string;
  complexity: number;
}

export interface CodeSmell {
  key: string;
  rule: string;
  severity: 'BLOCKER' | 'CRITICAL' | 'MAJOR' | 'MINOR' | 'INFO';
  message: string;
  file_path: string;
  line: number;
  effort: string;
  type: 'CODE_SMELL' | 'BUG' | 'VULNERABILITY';
}

export interface QualityReportRow {
  id: string;
  project_id: string;
  run_id: string;
  metrics: QualityMetrics;
  issues: CodeSmell[];
  quality_gate: 'PASS' | 'FAIL' | null;
  created_at: string;
}

// ============================================================
// V2 — TEST GENERATION TYPES
// ============================================================

export interface GeneratedTestFile {
  id: string;
  project_id: string;
  run_id: string;
  file_path: string;
  content: string;
  test_count: number;
  test_types: string[];
  framework: string | null;
  created_at: string;
}

export interface TestGenerationResult {
  files: GeneratedTestFile[];
  summary: {
    total_tests: number;
    frameworks_used: string[];
    coverage_areas: string[];
  };
}

// ============================================================
// V2 — API REQUEST / RESPONSE TYPES
// ============================================================

// GET /api/projects/[id]/graph
export interface GraphResponse {
  graph: CodeGraph;
  summary: GraphSummary | null;
}

// GET /api/projects/[id]/security?run_id=...&severity=...
export interface SecurityResponse {
  findings: SecurityFinding[];
  summary: {
    total: number;
    by_severity: { ERROR: number; WARNING: number; INFO: number };
    top_cwes: string[];
  };
}

// GET /api/projects/[id]/quality?run_id=...
export interface QualityResponse {
  metrics: QualityMetrics;
  issues: CodeSmell[];
  quality_gate: 'PASS' | 'FAIL' | null;
}

// GET /api/projects/[id]/tests?run_id=...
export interface GeneratedTestsResponse {
  tests: GeneratedTestFile[];
  summary: {
    total_files: number;
    total_tests: number;
    frameworks: string[];
  };
}

// ============================================================
// V2 — UPDATED ANALYSIS RUN STATUS
// ============================================================

// Update AnalysisRun.status to include new steps:
// 'pending' | 'parsing_prd' | 'understanding_code' |
// 'building_graph' | 'scanning_security' | 'scanning_quality' |
// 'generating_tests' | 'running_tests' | 'generating_test_files' |
// 'complete' | 'error'

// ============================================================
// V2 — COMPOSITE HEALTH SCORE
// ============================================================

export interface CompositeHealthScore {
  overall: number;
  compliance: { score: number; weight: number; passed: number; total: number };
  security: { score: number; weight: number; critical: number; warning: number; info: number };
  quality: { score: number; weight: number; rating: string };
  structural: { score: number; weight: number; circular_deps: number };
}
```

---

## 6. API Contracts

New endpoints added by v2. All require authentication (same `requireAuth()` pattern as v1).

| Method | Path | Request | Response | Description |
|--------|------|---------|----------|-------------|
| GET | `/api/projects/[id]/graph` | `?run_id=uuid&depth=file\|symbol` | `GraphResponse` | Returns code graph for project |
| GET | `/api/projects/[id]/security` | `?run_id=uuid&severity=ERROR` | `SecurityResponse` | Returns security findings |
| GET | `/api/projects/[id]/quality` | `?run_id=uuid` | `QualityResponse` | Returns quality metrics + issues |
| GET | `/api/projects/[id]/tests` | `?run_id=uuid` | `GeneratedTestsResponse` | Returns generated test files |

### API Route Pattern (same as v1)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = createServerClient();
    // ... fetch data, verify project ownership
    return NextResponse.json(data);
  } catch (error) {
    console.error('[GET /api/projects/[id]/graph]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

---

## 7. Updated Analysis Pipeline

The Inngest analysis function (`src/lib/inngest/analyze.ts`) expands from 5 steps to 9:

```typescript
// Step 1: parse-prd           (existing — no change)
// Step 2: understand-codebase (existing — no change)
// Step 3: build-code-graph    (NEW)
// Step 4: security-scan       (NEW)
// Step 5: quality-scan        (NEW)
// Step 6: generate-tests      (existing — no change)
// Step 7: run-tests           (existing — modified: pass graph to Gemini)
// Step 8: generate-test-files (NEW)
// Step 9: complete            (existing — modified: composite health score)
```

### Step 3: build-code-graph

```typescript
const graph = await step.run('build-code-graph', async () => {
  await updateRunStatus(run_id, 'building_graph');
  // 1. Create E2B sandbox (or reuse if already created)
  // 2. Install graph-sitter: pip install graph-sitter
  // 3. Run analysis script in sandbox
  // 4. Parse output into CodeGraph
  // 5. Run analyzer (cycles, coupling, orphans)
  // 6. Store in code_graphs table
  return { graph, summary };
});
```

### Step 4: security-scan

```typescript
const securityResults = await step.run('security-scan', async () => {
  await updateRunStatus(run_id, 'scanning_security');
  // 1. Install Semgrep in sandbox: pip install semgrep
  // 2. Run: semgrep scan --config auto --json --output /tmp/results.json .
  // 3. Parse SARIF JSON output
  // 4. Map to SecurityFinding[]
  // 5. Store in security_findings table
  return securityFindings;
});
```

### Step 5: quality-scan

```typescript
const qualityResults = await step.run('quality-scan', async () => {
  await updateRunStatus(run_id, 'scanning_quality');
  // 1. Generate sonar-project.properties in sandbox
  // 2. Run sonar-scanner in sandbox
  // 3. Poll SonarCloud API for completion
  // 4. Fetch metrics and issues via SonarCloud REST API
  // 5. Store in quality_reports table
  return qualityMetrics;
});
```

### Step 8: generate-test-files

```typescript
const testFiles = await step.run('generate-test-files', async () => {
  await updateRunStatus(run_id, 'generating_test_files');
  // 1. Call TestSprite API with codebase context
  // 2. Pass: framework, routes, models, failing findings
  // 3. Receive generated test file content
  // 4. Store in generated_tests table
  return generatedTests;
});
```

### Step 9: complete (modified)

Calculate composite health score using all 4 dimensions instead of simple pass/fail percentage.

---

## 8. Integration Contracts

### Graph Builder exports:

```typescript
// src/lib/graph/builder.ts
export async function buildCodeGraph(
  sandbox: Sandbox,
  repoDir: string,
  languages: string[]
): Promise<CodeGraph>

// src/lib/graph/analyzer.ts
export function analyzeGraph(graph: CodeGraph): GraphSummary
```

### Security Scanner exports:

```typescript
// src/lib/security/semgrep.ts
export async function runSemgrepScan(
  sandbox: Sandbox,
  repoDir: string
): Promise<SecurityFinding[]>
```

### Quality Analyzer exports:

```typescript
// src/lib/quality/sonarcloud.ts
export async function triggerSonarScan(
  sandbox: Sandbox,
  repoDir: string,
  projectKey: string,
  organization: string
): Promise<void>

export async function fetchQualityMetrics(
  projectKey: string
): Promise<QualityMetrics>

export async function fetchQualityIssues(
  projectKey: string,
  maxResults?: number
): Promise<CodeSmell[]>
```

### Test Generator exports:

```typescript
// src/lib/testing/testsprite.ts
export async function generateTestFiles(
  context: {
    framework: string;
    language: string;
    routes: { path: string; method: string }[];
    models: { name: string; fields: string[] }[];
    requirements: Requirement[];
    failingFindings: Finding[];
  }
): Promise<GeneratedTestFile[]>
```

### Sandbox extension:

```typescript
// src/lib/e2b/sandbox.ts — ADD this function
export async function installAnalysisTools(
  sandbox: Sandbox,
  tools: ('graph-sitter' | 'semgrep' | 'sonar-scanner' | 'madge')[]
): Promise<void>
```

---

## 9. Environment Variables

Add these to `.env.local` and `.env.example`:

```bash
# ============================================================
# V2 — New Environment Variables
# ============================================================

# SonarCloud (required for quality analysis)
SONAR_TOKEN=                    # Get from: sonarcloud.io → My Account → Security → Tokens
SONAR_ORGANIZATION=             # Your SonarCloud organization key

# TestSprite (required for test generation)
TESTSPRITE_API_KEY=             # Get from: testsprite.com → Settings → API Keys
```

---

## 10. Coding Standards (v2 additions)

All v1 coding standards still apply. Additional rules for v2:

### Sandbox Tool Installation

Always check if a tool is already installed before reinstalling:

```typescript
// Good
const semgrepCheck = await sandbox.commands.run('which semgrep');
if (semgrepCheck.exitCode !== 0) {
  await sandbox.commands.run('pip install semgrep', { timeoutMs: 60_000 });
}

// Bad — reinstalls every time
await sandbox.commands.run('pip install semgrep');
```

### SARIF/JSON Parsing

Always validate external tool output before parsing:

```typescript
// Good
const rawOutput = await sandbox.files.read('/tmp/semgrep-results.json');
let results: unknown;
try {
  results = JSON.parse(rawOutput);
} catch {
  console.error('[security-scan] Semgrep output was not valid JSON');
  return [];
}

// Bad — crashes on malformed output
const results = JSON.parse(rawOutput);
```

### Timeout Handling

All sandbox operations must have explicit timeouts:

| Operation | Timeout |
|-----------|---------|
| `pip install semgrep` | 60s |
| `pip install graph-sitter` | 60s |
| `npm install -g madge` | 60s |
| `semgrep scan` | 120s |
| graph-sitter analysis | 120s |
| `sonar-scanner` | 180s |

### Error Isolation

If one v2 step fails, the pipeline continues with remaining steps:

```typescript
// Each step wrapped in try-catch — failure returns empty results, not pipeline abort
try {
  const graph = await buildCodeGraph(sandbox, repoDir, languages);
} catch (error) {
  console.error('[build-code-graph] Failed, continuing:', error);
  // Store empty graph, pipeline continues to security-scan
}
```

### Error Logging

v2 log prefixes:

```typescript
console.error('[build-code-graph] ...');
console.error('[security-scan] ...');
console.error('[quality-scan] ...');
console.error('[generate-test-files] ...');
```

---

## 11. Composite Health Score Calculation

```typescript
export function calculateCompositeHealthScore(
  compliance: { passed: number; total: number },
  security: { critical: number; warning: number },
  quality: { maintainability_rating: string },
  structural: { circular_deps: number }
): CompositeHealthScore {
  const ratingToPercent: Record<string, number> = {
    A: 100, B: 80, C: 60, D: 40, E: 20,
  };

  const compliancePct = compliance.total > 0
    ? compliance.passed / compliance.total
    : 1;

  const securityPct = Math.max(0, 1 - (security.critical / 10));

  const qualityPct = (ratingToPercent[quality.maintainability_rating] ?? 50) / 100;

  const structuralPct = Math.max(0, 1 - (structural.circular_deps / 10));

  // Weights
  const w = { compliance: 0.40, security: 0.25, quality: 0.20, structural: 0.15 };

  const overall = Math.round(
    (w.compliance * compliancePct +
     w.security * securityPct +
     w.quality * qualityPct +
     w.structural * structuralPct) * 100
  );

  return {
    overall,
    compliance: { score: Math.round(compliancePct * 100), weight: w.compliance, ...compliance },
    security: { score: Math.round(securityPct * 100), weight: w.security, ...security, info: 0 },
    quality: { score: Math.round(qualityPct * 100), weight: w.quality, rating: quality.maintainability_rating },
    structural: { score: Math.round(structuralPct * 100), weight: w.structural, ...structural },
  };
}
```

---

## 12. Important Rules (v2 additions)

1. **v2 steps are fault-tolerant** — if graph, security, quality, or test generation fails, the pipeline continues. Never abort the entire analysis because one v2 step failed.
2. **Sandbox reuse** — the E2B sandbox created in step 2 (understand-codebase) should be reused for graph building, security scanning, and quality scanning. Do not create a new sandbox per step.
3. **Tool installation is idempotent** — always check if a tool exists before installing. The sandbox may be reused across steps.
4. **SonarCloud is optional** — if `SONAR_TOKEN` is not set, skip the quality scan step gracefully. The health score redistributes weights.
5. **TestSprite is optional** — if `TESTSPRITE_API_KEY` is not set, skip test file generation. The existing Gemini test generation (findings) still runs.
6. **Graph data can be large** — for repos with 5,000+ files, the graph JSON may be several MB. Store in JSONB (Postgres handles this well), but paginate API responses if needed.
7. **Security findings are NOT the same as v1 findings** — security findings go in `security_findings` table, not the existing `findings` table. They have different schemas (CWE/OWASP vs requirement_id).
8. **Never log Semgrep output to console** — it may contain source code snippets. Log only counts and rule IDs.
9. **SonarCloud API rate limit** — 10,000 requests/day on free tier. Cache metrics for at least 5 minutes.
10. **TestSprite API key is per-project** — store in environment variables, never in database or client-side code.
