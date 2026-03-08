import type { VultrSandbox } from '@/lib/vultr/sandbox';
import type { SecurityFinding } from '@/types';
import type { SemgrepResult } from './types';

const RESULTS_PATH = '/tmp/semgrep-results.json';

/** Paths to exclude from scan results */
const EXCLUDED_PATTERNS = [
  /node_modules\//,
  /vendor\//,
  /\.next\//,
  /dist\//,
  /build\//,
  /\.min\./,
  /__pycache__\//,
];

/** Test file patterns — downgrade INFO findings in these */
const TEST_PATTERNS = [
  /\b(test|spec|__tests__|__mocks__)\b/i,
  /\.test\./,
  /\.spec\./,
];

function mapSeverity(semgrepSeverity: string): 'ERROR' | 'WARNING' | 'INFO' {
  switch (semgrepSeverity.toUpperCase()) {
    case 'ERROR': return 'ERROR';
    case 'WARNING': return 'WARNING';
    default: return 'INFO';
  }
}

export async function runSemgrepScan(
  sandbox: VultrSandbox,
  repoDir: string
): Promise<SecurityFinding[]> {
  // Run semgrep with auto config
  await sandbox.commands.run(
    `cd ${repoDir} && semgrep scan --config auto --json --output ${RESULTS_PATH} . 2>/dev/null; echo "EXIT:$?"`,
    { timeoutMs: 120_000 }
  );

  // Read results file
  let rawJson: string;
  try {
    rawJson = await sandbox.files.read(RESULTS_PATH);
  } catch {
    console.error('[security-scan] Could not read semgrep results file');
    return [];
  }

  let semgrepOutput: SemgrepResult;
  try {
    semgrepOutput = JSON.parse(rawJson);
  } catch {
    console.error('[security-scan] Semgrep output was not valid JSON');
    return [];
  }

  if (!semgrepOutput.results || !Array.isArray(semgrepOutput.results)) {
    return [];
  }

  // Log only counts, never the actual output (may contain source code)
  console.log(`[security-scan] Semgrep found ${semgrepOutput.results.length} raw findings`);

  const findings: SecurityFinding[] = [];

  for (const finding of semgrepOutput.results) {
    // Skip excluded paths
    if (EXCLUDED_PATTERNS.some((p) => p.test(finding.path))) {
      continue;
    }

    const severity = mapSeverity(finding.extra.severity);
    const isTestFile = TEST_PATTERNS.some((p) => p.test(finding.path));

    // Skip INFO-level findings in test files
    if (severity === 'INFO' && isTestFile) {
      continue;
    }

    findings.push({
      id: '',
      run_id: '',
      project_id: '',
      rule_id: finding.check_id,
      severity,
      message: finding.extra.message,
      file_path: finding.path,
      line_start: finding.start.line,
      line_end: finding.end.line,
      code_snippet: finding.extra.lines ?? null,
      category: finding.extra.metadata?.category ?? null,
      cwe: finding.extra.metadata?.cwe ?? [],
      owasp: finding.extra.metadata?.owasp ?? [],
      fix_suggestion: finding.extra.fix ?? null,
      created_at: '',
    });
  }

  console.log(`[security-scan] ${findings.length} findings after filtering`);
  return findings;
}
