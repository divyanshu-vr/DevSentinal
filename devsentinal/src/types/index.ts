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
  status:
    | 'pending' | 'parsing_prd' | 'understanding_code'
    | 'building_graph' | 'scanning_security' | 'scanning_quality'
    | 'generating_tests' | 'running_tests' | 'generating_test_files'
    | 'complete' | 'error';
  health_score: number | null;
  total_tests: number;
  passed: number;
  failed: number;
  error_message: string | null;
  pipeline_options: PipelineOptions | null;
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
  test_type: 'happy_path' | 'error_case' | 'auth_guard' | 'validation' | 'edge_case' | 'security' | 'quality';
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
  status: 'pending' | 'sandboxing' | 'coding' | 'formatting' | 'linting' | 'testing' | 'opening_pr' | 'complete' | 'error';
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

export interface PipelineLogEvent {
  id: string;
  step: string;
  sub_step: string | null;
  message: string;
  level: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AnalysisSSEEvent {
  type: 'status_change' | 'finding' | 'complete' | 'error' | 'log';
  status?: AnalysisRun['status'];
  finding?: Finding;
  health_score?: number;
  error?: string;
  log?: PipelineLogEvent;
}

export interface FixSSEEvent {
  type: 'status_change' | 'agent_log' | 'complete' | 'error' | 'log';
  status?: FixJob['status'];
  log_entry?: AgentLogEntry;
  pr_url?: string;
  error?: string;
  log?: PipelineLogEvent;
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

// ============================================================
// V2 — PIPELINE OPTIONS
// ============================================================

export interface PipelineOptions {
  security_scan: boolean;
  quality_scan: boolean;
  generate_tests: boolean;
  auto_fix: boolean;
}

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
// V2 — API RESPONSE TYPES
// ============================================================

export interface GraphResponse {
  graph: CodeGraph | null;
  summary: GraphSummary | null;
}

export interface SecurityResponse {
  findings: SecurityFinding[];
  total: number;
  by_severity: { ERROR: number; WARNING: number; INFO: number };
}

export interface QualityResponse {
  metrics: QualityMetrics | null;
  issues: CodeSmell[];
  quality_gate: 'PASS' | 'FAIL' | null;
}

export interface GeneratedTestsResponse {
  test_files: GeneratedTestFile[];
  total_files: number;
  total_tests: number;
}

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
