import type { VultrSandbox } from '@/lib/vultr/sandbox';
import type { QualityMetrics, CodeSmell } from '@/types';
import type { SonarMeasuresResponse, SonarIssuesResponse } from './types';

const SONAR_API = 'https://sonarcloud.io/api';

async function sonarFetch<T>(path: string): Promise<T> {
  const token = process.env.SONAR_TOKEN;
  if (!token) throw new Error('SONAR_TOKEN not configured');

  const res = await fetch(`${SONAR_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SonarCloud API error: ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`);
  }

  return res.json() as Promise<T>;
}

export async function triggerSonarScan(
  sandbox: VultrSandbox,
  repoDir: string,
  projectKey: string,
  organization: string
): Promise<void> {
  const token = process.env.SONAR_TOKEN;
  if (!token) throw new Error('SONAR_TOKEN not configured');

  // Generate sonar-project.properties
  const config = [
    `sonar.projectKey=${projectKey}`,
    `sonar.organization=${organization}`,
    `sonar.sources=.`,
    `sonar.host.url=https://sonarcloud.io`,
    `sonar.exclusions=**/node_modules/**,**/dist/**,**/build/**,**/.next/**,**/vendor/**`,
  ].join('\n');

  await sandbox.files.write(`${repoDir}/sonar-project.properties`, config);

  // Run sonar-scanner
  const result = await sandbox.commands.run(
    `cd ${repoDir} && SONAR_TOKEN=${token} sonar-scanner 2>&1`,
    { timeoutMs: 180_000 }
  );

  if (result.exitCode !== 0) {
    throw new Error(`sonar-scanner failed: ${result.stderr || result.stdout}`);
  }

  // Poll for completion with exponential backoff (max 2 minutes)
  const taskIdMatch = result.stdout.match(/task\?id=([a-zA-Z0-9_-]+)/);
  if (taskIdMatch) {
    const taskId = taskIdMatch[1];
    let delay = 5_000;
    const pollStart = Date.now();
    const maxPollMs = 120_000;

    while (Date.now() - pollStart < maxPollMs) {
      await new Promise((r) => setTimeout(r, delay));
      const task = await sonarFetch<{ task: { status: string } }>(`/ce/task?id=${taskId}`);
      if (task.task.status === 'SUCCESS') return;
      if (task.task.status === 'FAILED' || task.task.status === 'CANCELED') {
        throw new Error(`SonarCloud analysis ${task.task.status.toLowerCase()}`);
      }
      delay = Math.min(delay * 1.5, 30_000);
    }
    throw new Error('SonarCloud analysis timed out after 2 minutes');
  }
}

export async function fetchQualityMetrics(projectKey: string): Promise<QualityMetrics> {
  const metricKeys = [
    'reliability_rating', 'security_rating', 'sqale_rating',
    'coverage', 'duplicated_lines_density', 'code_smells',
    'bugs', 'vulnerabilities', 'sqale_debt_ratio', 'complexity',
  ].join(',');

  const data = await sonarFetch<SonarMeasuresResponse>(
    `/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${metricKeys}`
  );

  const measures = new Map(data.component.measures.map((m) => [m.metric, m.value]));

  const ratingMap: Record<string, string> = { '1.0': 'A', '2.0': 'B', '3.0': 'C', '4.0': 'D', '5.0': 'E' };

  return {
    reliability_rating: ratingMap[measures.get('reliability_rating') ?? ''] ?? 'N/A',
    security_rating: ratingMap[measures.get('security_rating') ?? ''] ?? 'N/A',
    maintainability_rating: ratingMap[measures.get('sqale_rating') ?? ''] ?? 'N/A',
    coverage: parseFloat(measures.get('coverage') ?? '0'),
    duplicated_lines_density: parseFloat(measures.get('duplicated_lines_density') ?? '0'),
    code_smells: parseInt(measures.get('code_smells') ?? '0', 10),
    bugs: parseInt(measures.get('bugs') ?? '0', 10),
    vulnerabilities: parseInt(measures.get('vulnerabilities') ?? '0', 10),
    technical_debt: `${measures.get('sqale_debt_ratio') ?? '0'}%`,
    complexity: parseInt(measures.get('complexity') ?? '0', 10),
  };
}

export async function fetchQualityIssues(
  projectKey: string,
  maxResults: number = 100
): Promise<CodeSmell[]> {
  const data = await sonarFetch<SonarIssuesResponse>(
    `/issues/search?componentKeys=${encodeURIComponent(projectKey)}&types=CODE_SMELL,BUG,VULNERABILITY&ps=${maxResults}`
  );

  return data.issues.map((issue) => ({
    key: issue.key,
    rule: issue.rule,
    severity: issue.severity as CodeSmell['severity'],
    message: issue.message,
    file_path: issue.component.split(':').slice(1).join(':'),
    line: issue.line ?? 0,
    effort: issue.effort ?? '',
    type: issue.type as CodeSmell['type'],
  }));
}
