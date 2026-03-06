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
