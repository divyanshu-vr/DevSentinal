import { inngest } from '@/lib/inngest/client';
import { createServerClient } from '@/lib/supabase/server';
import { cloneRepoLocally } from '@/lib/github/local-repo';
import { runAnalysisAgentLoop } from '@/lib/ai/gemini';
import { readFile, runInSandbox } from '@/lib/e2b/runner';
import { createSandbox, destroySandbox, installAnalysisTools } from '@/lib/e2b/sandbox';
import { VultrSandbox } from '@/lib/vultr/sandbox';
import { buildCodeGraph } from '@/lib/graph/builder';
import { analyzeGraph } from '@/lib/graph/analyzer';
import { runSemgrepScan } from '@/lib/security/semgrep';
import { triggerSonarScan, fetchQualityMetrics, fetchQualityIssues } from '@/lib/quality/sonarcloud';
import { calculateCompositeHealthScore } from '@/lib/utils/health-score';
import { createPipelineLogger } from '@/lib/logger';
import type { Requirement, RepoTreeNode, PipelineOptions, SecurityFinding as SecurityFindingType } from '@/types';

// ============================================================
// Helper: update analysis_runs status in DB
// ============================================================

async function updateRunStatus(
  runId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const supabase = createServerClient();
  const MAX_RETRIES = 2;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('analysis_runs')
      .update({ status, ...extra })
      .eq('id', runId);

    if (!error) {
      console.log(`[analysis.run] Run ${runId} -> ${status}`);
      return;
    }

    console.error(`[analysis.run] Status update failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
    if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Failed to update run ${runId} to status "${status}" after ${MAX_RETRIES} attempts`);
}

const DEFAULT_OPTIONS: PipelineOptions = {
  security_scan: true,
  quality_scan: true,
  generate_tests: false,
  auto_fix: false,
};

// ============================================================
// Inngest function: analysis.run
// ============================================================

export const analysisRun = inngest.createFunction(
  { id: 'analysis-run', retries: 0 },
  { event: 'analysis.trigger' },
  async ({ event, step }) => {
    const { run_id, project_id, options: rawOptions } = event.data as {
      run_id: string;
      project_id: string;
      options?: Partial<PipelineOptions>;
    };

    const options: PipelineOptions = { ...DEFAULT_OPTIONS, ...rawOptions };
    console.log(`[analysis.run] Pipeline starting run=${run_id} project=${project_id} options=${JSON.stringify(options)}`);
    const logger = createPipelineLogger({ runId: run_id, pipelineType: 'analysis' });
    let sandboxId: string | null = null;
    let sandboxIp: string | null = null;
    let sandboxPassword: string | null = null;

    try {
      // =======================================================
      // Step 1 — Parse PRD (SKIP if generate_tests is off)
      // =======================================================
      const { requirements, project } = await step.run('parse-prd', async () => {
        logger.setStep('parse-prd');
        logger.info('Fetching project details', 'fetch-project');
        const supabase = createServerClient();

        const { data: proj, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .single();

        if (projError || !proj) {
          throw new Error(`Project not found: ${project_id}`);
        }

        if (options.generate_tests) {
          await updateRunStatus(run_id, 'parsing_prd');

          const { data: reqs, error: reqsError } = await supabase
            .from('requirements')
            .select('*')
            .eq('project_id', project_id);

          if (reqsError) {
            throw new Error(`Failed to fetch requirements: ${reqsError.message}`);
          }

          if (!reqs || reqs.length === 0) {
            throw new Error('No requirements found. Upload a PRD when Generate Tests is enabled.');
          }

          logger.info(`Found ${reqs.length} requirements`, 'requirements', { count: reqs.length });
          return {
            requirements: reqs as Requirement[],
            project: proj as { id: string; repo_owner: string; repo_name: string; branch: string; user_id: string; tech_stack: string[] },
          };
        }

        logger.info('No test generation requested, skipping PRD parse');
        return {
          requirements: [] as Requirement[],
          project: proj as { id: string; repo_owner: string; repo_name: string; branch: string; user_id: string; tech_stack: string[] },
        };
      });

      // =======================================================
      // Step 2 — Create Sandbox + Clone Repo
      // =======================================================
      const step2 = await step.run('understand-codebase', async () => {
        logger.setStep('understand-codebase');
        await updateRunStatus(run_id, 'understanding_code');

        const repoUrl = `https://github.com/${project.repo_owner}/${project.repo_name}.git`;

        // Clone repo locally to get the file tree
        const localRepo = await logger.timed('Cloning repo locally', 'local-clone', async () =>
          cloneRepoLocally(repoUrl, project.branch, (msg) => logger.info(msg, 'local-clone'))
        );

        const tree: RepoTreeNode[] = localRepo.tree;
        logger.info(`Repo tree: ${tree.length} files`, 'fetch-tree', { file_count: tree.length });
        localRepo.cleanup();

        // Provision sandbox VM (repo cloned inside by createSandbox)
        const { sandboxId: sid, sandbox } = await logger.timed('Provisioning sandbox VM', 'create-sandbox', () =>
          createSandbox(repoUrl, project.branch, (msg) => logger.info(msg, 'vm-boot'))
        );
        logger.info('VM ready', 'vm-ready');

        // Run AI analysis agent — explores codebase via tool calling (no token limits)
        const sandboxForAgent = {
          readFile: async (path: string) => readFile(sandbox, `/home/user/repo/${path}`),
          writeFile: async (_path: string, _content: string) => { /* read-only */ },
          runCommand: async (command: string) => {
            const r = await runInSandbox(sandbox, `cd /home/user/repo && ${command}`);
            return r.stdout + r.stderr;
          },
        };

        const agentResult = await logger.timed('Running AI analysis agent', 'ai-analysis', () =>
          runAnalysisAgentLoop(tree, requirements, sandboxForAgent)
        );

        logger.info(`Analysis complete: ${agentResult.findings.length} findings`, 'ai-result', {
          findings: agentResult.findings.length,
          framework: agentResult.analysis.framework,
        });

        return {
          sandboxIdResult: sid,
          sandboxIpResult: sandbox.instanceIp,
          sandboxPasswordResult: sandbox.defaultPassword,
          cachedAnalysis: agentResult.analysis,
          agentFindings: agentResult.findings,
        };
      });

      const { sandboxIdResult, sandboxIpResult, sandboxPasswordResult, cachedAnalysis, agentFindings } = step2;
      sandboxId = sandboxIdResult;
      sandboxIp = sandboxIpResult;
      sandboxPassword = sandboxPasswordResult;

      // =======================================================
      // Step 3 — Build Code Graph (ALWAYS runs)
      // =======================================================
      const graphResult = await step.run('build-code-graph', async () => {
        logger.setStep('build-code-graph');
        await updateRunStatus(run_id, 'building_graph');

        try {
          const sandbox = await logger.timed('Connecting to sandbox', 'connect', () =>
            VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined)
          );
          await logger.timed('Installing graph tools', 'install-tools', () =>
            installAnalysisTools(sandbox, ['graph-sitter', 'madge'])
          );

          const languages = project.tech_stack ?? [];
          const graph = await logger.timed('Building code graph', 'build', () =>
            buildCodeGraph(sandbox, '/home/user/repo', languages)
          );
          const summary = analyzeGraph(graph);

          const supabase = createServerClient();
          await supabase.from('code_graphs').insert({
            project_id,
            run_id,
            graph_data: graph,
            summary,
            node_count: graph.nodes.length,
            edge_count: graph.edges.length,
          });

          logger.info(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${summary.circular_dependencies.length} cycles`, 'result', {
            nodes: graph.nodes.length, edges: graph.edges.length, cycles: summary.circular_dependencies.length,
          });
          return { graph, summary };
        } catch (error) {
          logger.error(`Failed: ${error instanceof Error ? error.message : error}`, 'error');
          return { graph: null, summary: null };
        }
      });

      // =======================================================
      // Step 4 — Security Scan (SKIP if toggled off)
      // =======================================================
      const securityResults = await step.run('security-scan', async () => {
        logger.setStep('security-scan');
        if (!options.security_scan) {
          logger.info('Skipped — toggled off');
          return [] as SecurityFindingType[];
        }

        await updateRunStatus(run_id, 'scanning_security');

        try {
          const sandbox = await logger.timed('Connecting to sandbox', 'connect', () =>
            VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined)
          );
          await logger.timed('Installing semgrep', 'install-tools', () =>
            installAnalysisTools(sandbox, ['semgrep'])
          );

          const findings = await logger.timed('Running semgrep scan', 'scan', () =>
            runSemgrepScan(sandbox, '/home/user/repo')
          );

          if (findings.length > 0) {
            const supabase = createServerClient();
            const rows = findings.map((f) => ({
              run_id,
              project_id,
              rule_id: f.rule_id,
              severity: f.severity,
              message: f.message,
              file_path: f.file_path,
              line_start: f.line_start,
              line_end: f.line_end,
              code_snippet: f.code_snippet,
              category: f.category,
              cwe: f.cwe,
              owasp: f.owasp,
              fix_suggestion: f.fix_suggestion,
            }));

            const { error } = await supabase.from('security_findings').insert(rows);
            if (error) console.error('[security-scan] Failed to store findings:', error);
          }

          logger.info(`Found ${findings.length} findings (${findings.filter(f => f.severity === 'ERROR').length} critical)`, 'result', {
            total: findings.length, critical: findings.filter(f => f.severity === 'ERROR').length,
          });
          return findings;
        } catch (error) {
          logger.error(`Failed: ${error instanceof Error ? error.message : error}`, 'error');
          return [] as SecurityFindingType[];
        }
      });

      // =======================================================
      // Step 5 — Quality Scan (SKIP if toggled off or no token)
      // =======================================================
      const qualityResult = await step.run('quality-scan', async () => {
        logger.setStep('quality-scan');
        if (!options.quality_scan) {
          logger.info('Skipped — toggled off');
          return null;
        }
        if (!process.env.SONAR_TOKEN) {
          logger.info('Skipped — SONAR_TOKEN not set');
          return null;
        }

        await updateRunStatus(run_id, 'scanning_quality');

        try {
          const sandbox = await logger.timed('Connecting to sandbox', 'connect', () =>
            VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined)
          );
          await logger.timed('Installing sonar-scanner', 'install-tools', () =>
            installAnalysisTools(sandbox, ['sonar-scanner'])
          );

          const org = process.env.SONAR_ORGANIZATION ?? '';
          const projectKey = `${org}_${project.repo_name}`;

          await logger.timed('Running SonarCloud scan', 'sonar-scan', () =>
            triggerSonarScan(sandbox, '/home/user/repo', projectKey, org)
          );
          const metrics = await fetchQualityMetrics(projectKey);
          const issues = await fetchQualityIssues(projectKey);

          const qualityGate = (metrics.bugs === 0 && metrics.vulnerabilities === 0) ? 'PASS' : 'FAIL';
          logger.info(`Quality gate: ${qualityGate}`, 'result', { quality_gate: qualityGate, bugs: metrics.bugs });

          const supabase = createServerClient();
          await supabase.from('quality_reports').insert({
            project_id,
            run_id,
            metrics,
            issues,
            quality_gate: qualityGate,
          });

          return { metrics, issues, quality_gate: qualityGate as 'PASS' | 'FAIL' };
        } catch (error) {
          logger.error(`Failed: ${error instanceof Error ? error.message : error}`, 'error');
          return null;
        }
      });

      // =======================================================
      // Step 6 — Use Agent Findings (analysis agent already ran in Step 2)
      // =======================================================
      const findings = await step.run('run-tests', async () => {
        logger.setStep('run-tests');
        if (!options.generate_tests || requirements.length === 0) {
          logger.info('Skipped — no requirements');
          return [];
        }

        await updateRunStatus(run_id, 'running_tests');
        logger.info(`Using ${agentFindings.length} findings from analysis agent`, 'result');
        return agentFindings;
      });

      // =======================================================
      // Step 7 — Generate Test Files via TestSprite MCP (SKIP if toggled off or no key)
      // =======================================================
      await step.run('generate-test-files', async () => {
        logger.setStep('generate-test-files');
        if (!options.generate_tests) {
          logger.info('Skipped — toggled off');
          return;
        }
        if (!process.env.TESTSPRITE_API_KEY) {
          logger.info('Skipped — TESTSPRITE_API_KEY not set');
          return;
        }

        await updateRunStatus(run_id, 'generating_test_files');

        try {
          const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);

          // Run TestSprite MCP in the sandbox — it analyzes the repo directly
          logger.info('Installing TestSprite MCP in sandbox', 'install');
          await sandbox.commands.run('npm install -g @testsprite/testsprite-mcp@latest', { timeoutMs: 60_000 });

          logger.info('Running TestSprite test generation', 'generate');
          const result = await sandbox.commands.run([
            `cd /home/user/repo`,
            `TESTSPRITE_API_KEY=${process.env.TESTSPRITE_API_KEY}`,
            `npx @testsprite/testsprite-mcp@latest generate --output json`,
          ].join(' && '), { timeoutMs: 120_000 });

          // Try to parse test files from TestSprite output
          let testFiles: { file_path: string; content: string; test_count: number; test_types: string[]; framework: string }[] = [];
          try {
            const output = result.stdout.trim();
            const jsonMatch = output.match(/\[[\s\S]*\]/) || output.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              testFiles = Array.isArray(parsed) ? parsed : (parsed.test_files ?? []);
            }
          } catch {
            // If MCP output isn't JSON, check if it wrote test files to disk
            logger.info('Checking for generated test files on disk', 'fallback');
            const findResult = await runInSandbox(sandbox, 'find /home/user/repo -name "*.test.*" -newer /home/user/repo/.git/HEAD -type f 2>/dev/null');
            const testPaths = findResult.stdout.trim().split('\n').filter(Boolean);

            for (const absPath of testPaths.slice(0, 20)) {
              const relPath = absPath.replace('/home/user/repo/', '');
              try {
                const content = await readFile(sandbox, absPath);
                const testCount = (content.match(/\b(it|test|describe)\s*\(/g) || []).length;
                testFiles.push({
                  file_path: relPath,
                  content,
                  test_count: testCount,
                  test_types: ['generated'],
                  framework: cachedAnalysis?.framework ?? 'unknown',
                });
              } catch { /* skip unreadable files */ }
            }
          }

          if (testFiles.length > 0) {
            const supabase = createServerClient();
            const rows = testFiles.map((tf) => ({
              project_id,
              run_id,
              file_path: tf.file_path,
              content: tf.content,
              test_count: tf.test_count,
              test_types: tf.test_types,
              framework: tf.framework,
            }));

            const { error } = await supabase.from('generated_tests').insert(rows);
            if (error) console.error('[generate-test-files] Failed to store:', error);
          }

          logger.info(`Generated ${testFiles.length} test files`, 'result', { count: testFiles.length });
        } catch (error) {
          logger.error(`TestSprite failed: ${error instanceof Error ? error.message : error}`, 'error');
        }
      });

      // =======================================================
      // Step 9 — Complete
      // =======================================================
      await step.run('complete', async () => {
        logger.setStep('complete');
        const supabase = createServerClient();

        logger.info(`Storing ${findings.length} findings`, 'store-findings', { count: findings.length });
        if (findings.length > 0) {
          const findingRows = findings.map((f) => ({
            run_id,
            requirement_id: f.requirement_id,
            status: f.status,
            feature_name: f.feature_name,
            test_description: f.test_description,
            test_type: f.test_type,
            confidence: f.confidence,
            file_path: f.file_path,
            line_start: f.line_start,
            line_end: f.line_end,
            code_snippet: f.code_snippet,
            explanation: f.explanation,
            fix_confidence: f.fix_confidence,
          }));

          const { error: insertError } = await supabase.from('findings').insert(findingRows);
          if (insertError) {
            console.error('[analysis.run] Failed to insert findings:', insertError);
          }
        }

        // Composite health score
        const total = findings.length;
        const passed = findings.filter((f) => f.status === 'pass').length;

        const compositeScore = calculateCompositeHealthScore(
          total > 0 ? { passed, total } : null,
          options.security_scan
            ? {
                critical: securityResults.filter((f) => f.severity === 'ERROR').length,
                warning: securityResults.filter((f) => f.severity === 'WARNING').length,
                info: securityResults.filter((f) => f.severity === 'INFO').length,
              }
            : null,
          qualityResult
            ? { maintainability_rating: qualityResult.metrics.maintainability_rating }
            : null,
          graphResult.summary
            ? { circular_deps: graphResult.summary.circular_dependencies.length }
            : null
        );

        logger.info(`Health score: ${compositeScore.overall}%`, 'health-score', { score: compositeScore.overall });

        await updateRunStatus(run_id, 'complete', {
          health_score: compositeScore.overall,
          total_tests: total,
          passed,
          failed: total - passed,
          completed_at: new Date().toISOString(),
        });

        const { error: projError } = await supabase
          .from('projects')
          .update({ health_score: compositeScore.overall, status: 'analyzed' })
          .eq('id', project_id);

        if (projError) {
          console.error('[analysis.run] Failed to update project:', projError);
        }

        // Destroy sandbox
        if (sandboxId) {
          logger.info('Cleaning up sandbox', 'cleanup');
          try { await destroySandbox(sandboxId); } catch { /* reaper will clean up */ }
        }

        logger.info('Analysis pipeline complete', 'done');

        // Trigger auto-fix if enabled
        if (options.auto_fix && (securityResults.length > 0 || (qualityResult?.issues?.length ?? 0) > 0)) {
          await inngest.send({
            name: 'auto-fix.trigger',
            data: { run_id, project_id },
          });
        }
      });

      return { success: true, run_id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.setStep('error');
      logger.error(`Pipeline failed: ${errorMessage}`, 'fatal');

      await updateRunStatus(run_id, 'error', { error_message: errorMessage });

      const supabase = createServerClient();
      await supabase.from('projects').update({ status: 'error' }).eq('id', project_id);

      if (sandboxId) {
        try { await destroySandbox(sandboxId); } catch { /* reaper will clean up */ }
      }

      throw error;
    }
  }
);
