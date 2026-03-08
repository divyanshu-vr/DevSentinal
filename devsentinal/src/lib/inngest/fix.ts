// ============================================================
// Inngest Function — Fix Pipeline
// ============================================================

import { inngest } from '@/lib/inngest/client';
import { createServerClient } from '@/lib/supabase/server';
import { createAppOctokit } from '@/lib/github/client';
import { createBranch, commitFiles, openPR } from '@/lib/github/pr';
import { createSandbox, destroySandbox } from '@/lib/e2b/sandbox';
import { readFile, runInSandbox, runLint, runTests, runFormat } from '@/lib/e2b/runner';
import { VultrSandbox } from '@/lib/vultr/sandbox';
import { runAgentLoop } from '@/lib/ai/gemini';
import { createPipelineLogger } from '@/lib/logger';
import type { AgentContext, Finding, Requirement, Project, FixJob, AgentLogEntry } from '@/types';

// ============================================================
// Helper: update fix_jobs status in DB
// ============================================================

async function updateJobStatus(
  jobId: string,
  status: FixJob['status'],
  extra: Record<string, unknown> = {}
) {
  const supabase = createServerClient();
  const MAX_RETRIES = 2;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase
      .from('fix_jobs')
      .update({ status, ...extra })
      .eq('id', jobId);

    if (!error) {
      console.log(`[fix.run] Job ${jobId} -> ${status}`);
      return;
    }

    console.error(`[fix.run] Status update failed (attempt ${attempt}/${MAX_RETRIES}):`, error.message);
    if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 500));
  }

  throw new Error(`Failed to update job ${jobId} to status "${status}" after ${MAX_RETRIES} attempts`);
}

// ============================================================
// Inngest function: fix.run
// ============================================================

export const fixRun = inngest.createFunction(
  { id: 'fix-run', retries: 0 },
  { event: 'fix.trigger' },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string };
    const logger = createPipelineLogger({ runId: jobId, pipelineType: 'fix' });

    let sandboxId: string | null = null;
    let sandboxIp: string | null = null;
    let sandboxPassword: string | null = null;

    try {
      // =======================================================
      // Step 1 — Context Pack
      // =======================================================
      const context = await step.run('context-pack', async () => {
        logger.setStep('context-pack');
        logger.info('Loading fix job context');
        await updateJobStatus(jobId, 'sandboxing');
        const supabase = createServerClient();

        const { data: job, error: jobError } = await supabase
          .from('fix_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobError || !job) {
          throw new Error(`Fix job not found: ${jobId}`);
        }

        const { data: finding, error: findingError } = await supabase
          .from('findings')
          .select('*')
          .eq('id', job.finding_id)
          .single();

        if (findingError || !finding) {
          throw new Error(`Finding not found: ${job.finding_id}`);
        }

        const { data: requirement, error: requirementError } = await supabase
          .from('requirements')
          .select('*')
          .eq('id', finding.requirement_id)
          .single();

        if (requirementError || !requirement) {
          throw new Error(`Requirement not found: ${finding.requirement_id}`);
        }

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', requirement.project_id)
          .single();

        if (projectError || !project) {
          throw new Error(`Project not found: ${requirement.project_id}`);
        }

        const { data: user, error: userError } = await supabase
          .from('users')
          .select('github_token')
          .eq('id', project.user_id)
          .single();

        if (userError || !user) {
          throw new Error(`User not found: ${project.user_id}`);
        }

        const agentContext: AgentContext = {
          finding: finding as Finding,
          requirement: requirement as Requirement,
          project: project as Project,
          repo_owner: project.repo_owner,
          repo_name: project.repo_name,
          branch: project.branch,
        };

        logger.info(`Context loaded: fixing "${finding.feature_name}"`, 'loaded', {
          finding_id: finding.id, project: project.repo_name,
        });

        return {
          agentContext,
          job: job as FixJob,
          project: project as Project,
          finding: finding as Finding,
          githubToken: user.github_token || (process.env.GITHUB_TOKEN as string) || '',
        };
      });

      // =======================================================
      // Step 2 — Create Sandbox
      // =======================================================
      const sandboxResult = await step.run('create-sandbox', async () => {
        logger.setStep('create-sandbox');
        const repoUrl = `https://github.com/${context.project.repo_owner}/${context.project.repo_name}.git`;
        const branch = context.project.branch;

        const { sandboxId: sid, sandbox } = await logger.timed('Provisioning sandbox VM', 'provision', () =>
          createSandbox(repoUrl, branch, (msg) => logger.info(msg, 'vm-boot'))
        );
        await updateJobStatus(jobId, 'coding');

        return { sid, ip: sandbox.instanceIp, password: sandbox.defaultPassword };
      });

      sandboxId = sandboxResult.sid;
      sandboxIp = sandboxResult.ip;
      sandboxPassword = sandboxResult.password;

      // =======================================================
      // Step 3 — Run AI Agent
      // =======================================================
      const agentResult = await step.run('run-ai-agent', async () => {
        logger.setStep('run-ai-agent');
        logger.info('Running AI fix agent');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);

        const result = await logger.timed('AI agent loop', 'agent-loop', () => runAgentLoop(context.agentContext, {
          readFile: async (path: string) => {
            return await readFile(sandbox, `/home/user/repo/${path}`);
          },
          writeFile: async (path: string, content: string) => {
            await sandbox.files.write(`/home/user/repo/${path}`, content);
          },
          runCommand: async (command: string) => {
            const result = await runInSandbox(sandbox, `cd /home/user/repo && ${command}`);
            return result.stdout + result.stderr;
          },
        }));

        logger.info(`Agent completed: ${result.files_changed.length} files changed, ${result.agent_log.length} steps`, 'result', {
          files_changed: result.files_changed.length, steps: result.agent_log.length,
        });

        await updateJobStatus(jobId, 'formatting', {
          agent_log: result.agent_log,
        });

        return result;
      });

      // =======================================================
      // Step 4 — Run Formatter (Prettier / Ruff)
      // =======================================================
      await step.run('run-formatter', async () => {
        logger.setStep('run-formatter');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);
        await logger.timed('Formatting code', 'format', () => runFormat(sandbox, agentResult.files_changed));
        await updateJobStatus(jobId, 'linting');
      });

      // =======================================================
      // Step 5 — Run Linter
      // =======================================================
      const lintResult = await step.run('run-linter', async () => {
        logger.setStep('run-linter');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);
        const result = await logger.timed('Running linter', 'lint', () => runLint(sandbox, agentResult.files_changed));

        if (!result.passed && result.errors > 0) {
          logger.warn(`Lint failed with ${result.errors} errors, attempting auto-fix`, 'auto-fix');
          const hasEslint = await sandbox.files.exists('/home/user/repo/node_modules/.bin/eslint');
          if (hasEslint) {
            await runInSandbox(sandbox, 'cd /home/user/repo && npx eslint --fix ' + agentResult.files_changed.join(' '));
            const fixedResult = await runLint(sandbox, agentResult.files_changed);
            await updateJobStatus(jobId, 'testing', { lint_result: fixedResult });
            return fixedResult;
          }
        }

        await updateJobStatus(jobId, 'testing', { lint_result: result });
        return result;
      });

      // =======================================================
      // Step 6 — Run Tests
      // =======================================================
      const testResult = await step.run('run-tests', async () => {
        logger.setStep('run-tests');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);
        let result = await logger.timed('Running tests', 'test', () => runTests(sandbox));
        let retryCount = context.job.retry_count;

        if (!result.passed && retryCount < 1) {
          logger.warn('Tests failed, retrying with error context', 'retry');

          const retryContext: AgentContext = {
            ...context.agentContext,
            finding: {
              ...context.agentContext.finding,
              explanation: `${context.agentContext.finding.explanation}\n\nTest Failure:\n${result.output}`,
            },
          };

          const retryResult = await runAgentLoop(retryContext, {
            readFile: async (path: string) => {
              return await readFile(sandbox, `/home/user/repo/${path}`);
            },
            writeFile: async (path: string, content: string) => {
              await sandbox.files.write(`/home/user/repo/${path}`, content);
            },
            runCommand: async (command: string) => {
              const r = await runInSandbox(sandbox, `cd /home/user/repo && ${command}`);
              return r.stdout + r.stderr;
            },
          });

          const supabase = createServerClient();
          const { data: currentJob } = await supabase
            .from('fix_jobs')
            .select('agent_log')
            .eq('id', jobId)
            .single();

          const combinedLog = [
            ...(currentJob?.agent_log as AgentLogEntry[] || []),
            ...retryResult.agent_log,
          ];

          await updateJobStatus(jobId, 'testing', {
            agent_log: combinedLog,
            retry_count: retryCount + 1,
          });

          retryCount++;

          // Re-format and re-run tests
          await runFormat(sandbox, retryResult.files_changed);
          result = await runTests(sandbox);
        }

        await updateJobStatus(jobId, 'opening_pr', {
          test_result: result,
          retry_count: retryCount,
        });

        return result;
      });

      // =======================================================
      // Step 7 — Create Pull Request (via GitHub App bot)
      // =======================================================
      const prResult = await step.run('create-pull-request', async () => {
        logger.setStep('create-pull-request');
        logger.info('Creating pull request');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);
        const octokit = await createAppOctokit(context.githubToken);
        const { repo_owner, repo_name, branch: baseBranch } = context.project;
        const branchName = `devsentinel/fix-${context.finding.id}`;

        await createBranch(octokit, repo_owner, repo_name, baseBranch, branchName);

        const files = await Promise.all(
          agentResult.files_changed.map(async (filePath: string) => {
            const content = await readFile(sandbox, `/home/user/repo/${filePath}`);
            return { path: filePath, content };
          })
        );

        const commitMessage = `fix: ${context.finding.feature_name}`;
        await commitFiles(octokit, repo_owner, repo_name, branchName, files, commitMessage);

        const prBody = `## DevSentinel Automated Fix

**Bug**: ${context.finding.feature_name}

**Explanation**: ${context.finding.explanation}

**Files Changed**:
${agentResult.files_changed.map((f: string) => `- \`${f}\``).join('\n')}

**Agent Summary**:
- Total steps: ${agentResult.agent_log.length}
- Lint result: ${lintResult.passed ? 'Passed' : `${lintResult.errors} errors, ${lintResult.warnings} warnings`}
- Test result: ${testResult.passed ? 'Passed' : `${testResult.failed_count}/${testResult.total} failed`}

---
*Generated by DevSentinel AI Fix Agent*`;

        const pr = await openPR(
          octokit,
          repo_owner,
          repo_name,
          branchName,
          baseBranch,
          `[DevSentinel] Fix: ${context.finding.feature_name}`,
          prBody
        );

        await updateJobStatus(jobId, 'complete', {
          pr_url: pr.url,
          pr_number: pr.number,
          branch_name: branchName,
          completed_at: new Date().toISOString(),
        });

        logger.info(`PR created: #${pr.number}`, 'result', { pr_number: pr.number, pr_url: pr.url });
        return pr;
      });

      // =======================================================
      // Step 8 — Cleanup
      // =======================================================
      await step.run('cleanup', async () => {
        logger.setStep('cleanup');
        if (sandboxId) {
          logger.info('Cleaning up sandbox', 'destroy');
          try { await destroySandbox(sandboxId); } catch { /* reaper will clean up */ }
        }
        logger.info('Fix pipeline complete', 'done');
      });

      return {
        success: true,
        jobId,
        pr_url: prResult.url,
        pr_number: prResult.number,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.setStep('error');
      logger.error(`Pipeline failed: ${errorMessage}`, 'fatal');

      await updateJobStatus(jobId, 'error', { error_message: errorMessage });

      if (sandboxId) {
        try { await destroySandbox(sandboxId); } catch { /* reaper will clean up */ }
      }

      throw error;
    }
  }
);
