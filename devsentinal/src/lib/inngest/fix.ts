// ============================================================
// Inngest Function — Fix Pipeline
// ============================================================

import { inngest } from '@/lib/inngest/client';
import { createServerClient } from '@/lib/supabase/server';
import { createOctokit } from '@/lib/github/client';
import { createBranch, commitFiles, openPR } from '@/lib/github/pr';
import { createSandbox, destroySandbox } from '@/lib/e2b/sandbox';
import { readFile, runInSandbox, runLint, runTests } from '@/lib/e2b/runner';
import { runAgentLoop } from '@/lib/ai/gemini';
import type { AgentContext, Finding, Requirement, Project, FixJob, AgentLogEntry, LintResult, TestResult } from '@/types';

// ============================================================
// Helper: update fix_jobs status in DB
// ============================================================

async function updateJobStatus(
  jobId: string,
  status: FixJob['status'],
  extra: Record<string, unknown> = {}
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('fix_jobs')
    .update({ status, ...extra })
    .eq('id', jobId);

  if (error) {
    console.error(`[fix.run] Failed to update job ${jobId} to status ${status}:`, error);
  }
}

// ============================================================
// Inngest function: fix.run
// ============================================================

export const fixRun = inngest.createFunction(
  { id: 'fix-run', retries: 0 },
  { event: 'fix.trigger' },
  async ({ event, step }: { event: any; step: any }) => {
    const { jobId } = event.data as { jobId: string };

    let sandboxId: string | null = null;

    try {
      // =======================================================
      // Step 1 — Context Pack
      // =======================================================
      const context = await step.run('context-pack', async () => {
        await updateJobStatus(jobId, 'sandboxing');

        const supabase = createServerClient();

        // Get fix_job record
        const { data: job, error: jobError } = await supabase
          .from('fix_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (jobError || !job) {
          throw new Error(`Fix job not found: ${jobId}`);
        }

        // Get finding
        const { data: finding, error: findingError } = await supabase
          .from('findings')
          .select('*')
          .eq('id', job.finding_id)
          .single();

        if (findingError || !finding) {
          throw new Error(`Finding not found: ${job.finding_id}`);
        }

        // Get requirement
        const { data: requirement, error: requirementError } = await supabase
          .from('requirements')
          .select('*')
          .eq('id', finding.requirement_id)
          .single();

        if (requirementError || !requirement) {
          throw new Error(`Requirement not found: ${finding.requirement_id}`);
        }

        // Get project
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', requirement.project_id)
          .single();

        if (projectError || !project) {
          throw new Error(`Project not found: ${requirement.project_id}`);
        }

        // Get user for GitHub token
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('github_token')
          .eq('id', project.user_id)
          .single();

        if (userError || !user) {
          throw new Error(`User not found: ${project.user_id}`);
        }

        // Build AgentContext
        const agentContext: AgentContext = {
          finding: finding as Finding,
          requirement: requirement as Requirement,
          project: project as Project,
          repo_owner: project.repo_owner,
          repo_name: project.repo_name,
          branch: project.branch,
        };

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
      const sandbox = await step.run('create-sandbox', async () => {
        const repoUrl = context.project.repo_url;
        const branch = context.project.branch;

        const { sandboxId: sid, sandbox: sb } = await createSandbox(repoUrl, branch);
        sandboxId = sid;

        await updateJobStatus(jobId, 'coding');

        return sb;
      });

      // =======================================================
      // Step 3 — Run AI Agent
      // =======================================================
      const agentResult = await step.run('run-ai-agent', async () => {
        const result = await runAgentLoop(context.agentContext, {
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
        });

        // Store agent_log in database
        await updateJobStatus(jobId, 'linting', {
          agent_log: result.agent_log,
        });

        return result;
      });

      // =======================================================
      // Step 4 — Run Linter
      // =======================================================
      const lintResult = await step.run('run-linter', async () => {
        const result = await runLint(sandbox, agentResult.files_changed);

        // If linter reports auto-fixable issues, try to fix them
        if (!result.passed && result.errors > 0) {
          const hasEslint = await sandbox.files.exists('/home/user/repo/node_modules/.bin/eslint');
          if (hasEslint) {
            await runInSandbox(sandbox, 'cd /home/user/repo && npx eslint --fix ' + agentResult.files_changed.join(' '));
            // Re-run linter to get updated results
            const fixedResult = await runLint(sandbox, agentResult.files_changed);
            await updateJobStatus(jobId, 'testing', {
              lint_result: fixedResult,
            });
            return fixedResult;
          }
        }

        await updateJobStatus(jobId, 'testing', {
          lint_result: result,
        });

        return result;
      });

      // =======================================================
      // Step 5 — Run Tests
      // =======================================================
      const testResult = await step.run('run-tests', async () => {
        let result = await runTests(sandbox);
        let retryCount = context.job.retry_count;

        // If tests fail and retry_count < 1, retry with test error context
        if (!result.passed && retryCount < 1) {
          console.log('[fix.run] Tests failed, retrying with error context...');

          // Re-run agent with test error context
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
              const result = await runInSandbox(sandbox, `cd /home/user/repo && ${command}`);
              return result.stdout + result.stderr;
            },
          });

          // Update agent_log with retry entries
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

          // Re-run tests
          result = await runTests(sandbox);
        }

        await updateJobStatus(jobId, 'opening_pr', {
          test_result: result,
          retry_count: retryCount,
        });

        return result;
      });

      // =======================================================
      // Step 6 — Create Pull Request
      // =======================================================
      const prResult = await step.run('create-pull-request', async () => {
        const octokit = createOctokit(context.githubToken);
        const { repo_owner, repo_name, branch: baseBranch } = context.project;
        const branchName = `devsentinel/fix-${context.finding.id}`;

        // Create new branch
        await createBranch(octokit, repo_owner, repo_name, baseBranch, branchName);

        // Read all changed files from sandbox
        const files = await Promise.all(
          agentResult.files_changed.map(async (filePath: string) => {
            const content = await readFile(sandbox, `/home/user/repo/${filePath}`);
            return { path: filePath, content };
          })
        );

        // Commit files
        const commitMessage = `fix: ${context.finding.feature_name}`;
        await commitFiles(octokit, repo_owner, repo_name, branchName, files, commitMessage);

        // Generate PR body
        const prBody = `## 🤖 DevSentinel Automated Fix

**Bug**: ${context.finding.feature_name}

**Explanation**: ${context.finding.explanation}

**Files Changed**:
${agentResult.files_changed.map((f: string) => `- \`${f}\``).join('\n')}

**Agent Summary**:
- Total steps: ${agentResult.agent_log.length}
- Lint result: ${lintResult.passed ? '✅ Passed' : `❌ ${lintResult.errors} errors, ${lintResult.warnings} warnings`}
- Test result: ${testResult.passed ? '✅ Passed' : `❌ ${testResult.failed_count}/${testResult.total} failed`}

---
*Generated by DevSentinel AI Fix Agent*`;

        // Open PR
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

        return pr;
      });

      // =======================================================
      // Step 7 — Cleanup
      // =======================================================
      await step.run('cleanup', async () => {
        if (sandboxId) {
          await destroySandbox(sandboxId);
        }
      });

      return {
        success: true,
        jobId,
        pr_url: prResult.url,
        pr_number: prResult.number,
      };
    } catch (error) {
      // Error handling: set status to 'error' and cleanup
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[fix.run] Error in job ${jobId}:`, errorMessage);

      await updateJobStatus(jobId, 'error', {
        error_message: errorMessage,
      });

      // Cleanup sandbox if it was created
      if (sandboxId) {
        try {
          await destroySandbox(sandboxId);
        } catch (cleanupError) {
          console.error(`[fix.run] Failed to cleanup sandbox ${sandboxId}:`, cleanupError);
        }
      }

      throw error;
    }
  }
);
