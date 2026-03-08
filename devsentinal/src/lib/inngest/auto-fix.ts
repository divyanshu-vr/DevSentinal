// ============================================================
// Inngest Function — Auto-Fix Pipeline
// Batch fixes security + quality issues, creates a single PR
// ============================================================

import { inngest } from '@/lib/inngest/client';
import { createServerClient } from '@/lib/supabase/server';
import { createAppOctokit } from '@/lib/github/client';
import { createBranch, commitFiles, openPR } from '@/lib/github/pr';
import { createSandbox, destroySandbox } from '@/lib/e2b/sandbox';
import { readFile, runInSandbox, runFormat } from '@/lib/e2b/runner';
import { VultrSandbox } from '@/lib/vultr/sandbox';
import { runAgentLoop } from '@/lib/ai/gemini';
import { createPipelineLogger } from '@/lib/logger';
import type { AgentContext, Project, SecurityFinding, CodeSmell } from '@/types';

// ============================================================
// Helper: update analysis_runs auto_fix status
// ============================================================

async function updateAutoFixStatus(
  runId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const supabase = createServerClient();
  await supabase
    .from('analysis_runs')
    .update({ auto_fix_status: status, ...extra })
    .eq('id', runId);
}

// ============================================================
// Inngest function: auto-fix.run
// ============================================================

export const autoFixRun = inngest.createFunction(
  { id: 'auto-fix-run', retries: 0 },
  { event: 'auto-fix.trigger' },
  async ({ event, step }) => {
    const { run_id, project_id } = event.data as {
      run_id: string;
      project_id: string;
    };

    const logger = createPipelineLogger({ runId: run_id, pipelineType: 'auto_fix' });
    let sandboxId: string | null = null;
    let sandboxIp: string | null = null;
    let sandboxPassword: string | null = null;

    try {
      // =======================================================
      // Step 1 — Gather findings to fix
      // =======================================================
      const context = await step.run('gather-findings', async () => {
        logger.setStep('gather-findings');
        logger.info('Gathering security and quality findings');
        await updateAutoFixStatus(run_id, 'gathering');
        const supabase = createServerClient();

        // Get project
        const { data: project, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .single();

        if (projError || !project) throw new Error(`Project not found: ${project_id}`);

        // Get user token
        const { data: user } = await supabase
          .from('users')
          .select('github_token')
          .eq('id', project.user_id)
          .single();

        const githubToken = user?.github_token || process.env.GITHUB_TOKEN || '';

        // Get security findings for this run
        const { data: secFindings } = await supabase
          .from('security_findings')
          .select('*')
          .eq('run_id', run_id)
          .in('severity', ['ERROR', 'WARNING']);

        // Get quality issues for this run
        const { data: qualReport } = await supabase
          .from('quality_reports')
          .select('issues')
          .eq('run_id', run_id)
          .single();

        const securityFindings = (secFindings ?? []) as SecurityFinding[];
        const qualityIssues = ((qualReport?.issues as CodeSmell[]) ?? [])
          .filter((i) => i.severity === 'CRITICAL' || i.severity === 'MAJOR' || i.severity === 'BLOCKER');

        logger.info(`Found ${securityFindings.length} security findings, ${qualityIssues.length} quality issues`, 'result', {
          security: securityFindings.length, quality: qualityIssues.length,
        });

        return {
          project: project as Project,
          githubToken,
          securityFindings,
          qualityIssues,
        };
      });

      if (context.securityFindings.length === 0 && context.qualityIssues.length === 0) {
        logger.info('No issues to fix, skipping');
        await updateAutoFixStatus(run_id, 'complete', { auto_fix_pr_url: null });
        return { success: true, run_id, message: 'No issues to fix' };
      }

      // =======================================================
      // Step 2 — Create sandbox
      // =======================================================
      const sandboxResult = await step.run('create-sandbox', async () => {
        logger.setStep('create-sandbox');
        await updateAutoFixStatus(run_id, 'sandboxing');
        const repoUrl = `https://github.com/${context.project.repo_owner}/${context.project.repo_name}.git`;
        const { sandboxId: sid, sandbox } = await logger.timed('Provisioning sandbox VM', 'provision', () =>
          createSandbox(repoUrl, context.project.branch, (msg) => logger.info(msg, 'vm-boot'))
        );
        return { sid, ip: sandbox.instanceIp, password: sandbox.defaultPassword };
      });

      sandboxId = sandboxResult.sid;
      sandboxIp = sandboxResult.ip;
      sandboxPassword = sandboxResult.password;

      // =======================================================
      // Step 3 — Fix ALL issues (single agent call)
      // =======================================================
      const fixResult = await step.run('fix-all-issues', async () => {
        logger.setStep('fix-all-issues');
        await updateAutoFixStatus(run_id, 'fixing_issues');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);

        // Build a single explanation with ALL findings
        const securitySection = context.securityFindings.length > 0
          ? `Security findings (from Semgrep SAST):\n${context.securityFindings.map((f) => {
              const cweStr = f.cwe.length > 0 ? ` (CWE: ${f.cwe.join(', ')})` : '';
              return `- [${f.severity}] ${f.message}${cweStr} in ${f.file_path}:${f.line_start ?? '?'}${f.fix_suggestion ? ` — Fix: ${f.fix_suggestion}` : ''}`;
            }).join('\n')}`
          : '';

        const qualitySection = context.qualityIssues.length > 0
          ? `Quality issues (from SonarCloud):\n${context.qualityIssues.map((i) =>
              `- [${i.severity}/${i.type}] ${i.message} in ${i.file_path}:${i.line}`
            ).join('\n')}`
          : '';

        const allIssuesDescription = [securitySection, qualitySection].filter(Boolean).join('\n\n');

        logger.info(`Fixing ${context.securityFindings.length} security + ${context.qualityIssues.length} quality issues in single agent call`);
        await updateAutoFixStatus(run_id, 'fixing_issues', {
          auto_fix_current_item: `${context.securityFindings.length} security + ${context.qualityIssues.length} quality issues`,
        });

        const agentContext: AgentContext = {
          finding: {
            id: `auto-fix-${run_id}`,
            run_id,
            requirement_id: '',
            status: 'fail',
            feature_name: 'Auto-fix all issues',
            test_description: '',
            test_type: 'security',
            confidence: 1,
            file_path: context.securityFindings[0]?.file_path ?? context.qualityIssues[0]?.file_path ?? '',
            line_start: null,
            line_end: null,
            code_snippet: null,
            explanation: `Fix ALL of the following issues in this codebase. Read each file, apply the fix, and move to the next.\n\n${allIssuesDescription}`,
            fix_confidence: 0.8,
            created_at: '',
          },
          requirement: {
            id: '',
            document_id: '',
            project_id,
            category: 'feature',
            feature_name: 'Security and quality compliance',
            description: 'Fix all security vulnerabilities and code quality issues',
            endpoint: null,
            http_method: null,
            expected_behavior: 'No security vulnerabilities or critical quality issues',
            priority: 'high',
            created_at: '',
          },
          project: context.project,
          repo_owner: context.project.repo_owner,
          repo_name: context.project.repo_name,
          branch: context.project.branch,
        };

        const result = await runAgentLoop(agentContext, {
          readFile: async (path: string) => readFile(sandbox, `/home/user/repo/${path}`),
          writeFile: async (path: string, content: string) => {
            await sandbox.files.write(`/home/user/repo/${path}`, content);
            // Update progress as agent writes files
            await updateAutoFixStatus(run_id, 'fixing_issues', {
              auto_fix_current_item: `Fixed ${path}`,
            });
          },
          runCommand: async (command: string) => {
            const r = await runInSandbox(sandbox, `cd /home/user/repo && ${command}`);
            return r.stdout + r.stderr;
          },
        });

        logger.info(`Agent fixed ${result.files_changed.length} files in ${result.agent_log.length} steps`, 'result');
        return result;
      });

      // =======================================================
      // Step 4 — Format + Create PR
      // =======================================================
      const prResult = await step.run('format-and-pr', async () => {
        logger.setStep('format-and-pr');
        const allFilesChanged = [...new Set(fixResult.files_changed)];

        if (allFilesChanged.length === 0) {
          logger.info('No files changed, skipping PR');
          await updateAutoFixStatus(run_id, 'complete', { auto_fix_pr_url: null });
          return null;
        }

        logger.info(`Formatting and creating PR for ${allFilesChanged.length} files`, 'format');

        await updateAutoFixStatus(run_id, 'formatting');
        const sandbox = await VultrSandbox.connectByIp(sandboxId!, sandboxIp!, sandboxPassword || undefined);

        // Run formatter
        await runFormat(sandbox, allFilesChanged);

        await updateAutoFixStatus(run_id, 'opening_pr');

        try {
          // Create PR via GitHub App bot
          const octokit = await createAppOctokit(context.githubToken);
          const { repo_owner, repo_name, branch: baseBranch } = context.project;
          const branchName = `devsentinel/auto-fix-${run_id.slice(0, 8)}`;

          await createBranch(octokit, repo_owner, repo_name, baseBranch, branchName);

          const files = await Promise.all(
            allFilesChanged.map(async (filePath) => {
              const content = await readFile(sandbox, `/home/user/repo/${filePath}`);
              return { path: filePath, content };
            })
          );

          const commitMessage = `fix: auto-fix security and quality issues\n\nFixed ${context.securityFindings.length} security findings and ${context.qualityIssues.length} quality issues.`;
          await commitFiles(octokit, repo_owner, repo_name, branchName, files, commitMessage);

          // Build PR body
          const secSection = context.securityFindings.length > 0
            ? `### Security Fixes (${context.securityFindings.length})\n${context.securityFindings.map((f) => {
                const cweStr = f.cwe.length > 0 ? ` (${f.cwe.join(', ')})` : '';
                return `- **${f.severity}**: ${f.message}${cweStr} — \`${f.file_path}:${f.line_start ?? '?'}\``;
              }).join('\n')}\n\n`
            : '';

          const qualSection = context.qualityIssues.length > 0
            ? `### Quality Fixes (${context.qualityIssues.length})\n${context.qualityIssues.map((i) =>
                `- **${i.severity}/${i.type}**: ${i.message} — \`${i.file_path}:${i.line}\``
              ).join('\n')}\n\n`
            : '';

          const prBody = `## DevSentinel Auto-Fix

${secSection}${qualSection}### Files Changed
${allFilesChanged.map((f) => `- \`${f}\``).join('\n')}

---
*Generated by DevSentinel Auto-Fix Agent*`;

          const pr = await openPR(
            octokit,
            repo_owner,
            repo_name,
            branchName,
            baseBranch,
            `[DevSentinel] Auto-fix: ${context.securityFindings.length} security + ${context.qualityIssues.length} quality issues`,
            prBody
          );

          await updateAutoFixStatus(run_id, 'complete', {
            auto_fix_pr_url: pr.url,
            auto_fix_pr_number: pr.number,
          });

          logger.info(`PR created: #${pr.number}`, 'result', { pr_number: pr.number, pr_url: pr.url });
          return pr;
        } catch (prError) {
          const msg = prError instanceof Error ? prError.message : String(prError);
          logger.error(`PR creation failed: ${msg}`, 'pr-error');

          // Mark as complete with error note — the fixes were applied but PR couldn't be created
          await updateAutoFixStatus(run_id, 'complete', {
            auto_fix_pr_url: null,
            error_message: `Fixes applied but PR creation failed: ${msg}. Check GitHub App permissions (needs contents:write).`,
          });

          return null;
        }
      });

      // =======================================================
      // Step 6 — Cleanup
      // =======================================================
      await step.run('cleanup', async () => {
        logger.setStep('cleanup');
        if (sandboxId) {
          logger.info('Cleaning up sandbox', 'destroy');
          try { await destroySandbox(sandboxId); } catch { /* reaper will clean up */ }
        }
        logger.info('Auto-fix pipeline complete', 'done');
      });

      return {
        success: true,
        run_id,
        pr_url: prResult?.url ?? null,
        pr_number: prResult?.number ?? null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.setStep('error');
      logger.error(`Pipeline failed: ${errorMessage}`, 'fatal');

      await updateAutoFixStatus(run_id, 'error', { auto_fix_error: errorMessage });

      if (sandboxId) {
        try { await destroySandbox(sandboxId); } catch { /* reaper will clean up */ }
      }

      throw error;
    }
  }
);
