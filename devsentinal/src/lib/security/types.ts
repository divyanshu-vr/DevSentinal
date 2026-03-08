/** Semgrep JSON output format (subset of SARIF) */

export interface SemgrepResult {
  results: SemgrepFinding[];
  errors: unknown[];
  version: string;
}

export interface SemgrepFinding {
  check_id: string;
  path: string;
  start: { line: number; col: number };
  end: { line: number; col: number };
  extra: {
    message: string;
    severity: string;
    metadata?: {
      cwe?: string[];
      owasp?: string[];
      category?: string;
      confidence?: string;
      fix_regex?: { regex: string; replacement: string };
      references?: string[];
    };
    fix?: string;
    lines?: string;
  };
}
