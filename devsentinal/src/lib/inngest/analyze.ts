import { inngest } from '@/lib/inngest/client';
import { createServerClient } from '@/lib/supabase/server';
import { createOctokit } from '@/lib/github/client';
import { fetchRepoTree, fetchFileContent } from '@/lib/github/repo';
import { prioritizeFiles, analyzeCodebase } from '@/lib/ai/gemini';
import type { Requirement, RepoTreeNode } from '@/types';

// ============================================================
// Helper: update analysis_runs status in DB
// ============================================================

async function updateRunStatus(
  runId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from('analysis_runs')
    .update({ status, ...extra })
    .eq('id', runId);

  if (error) {
    console.error(`[analysis.run] Failed to update run ${runId} to status ${status}:`, error);
  }
}

// ============================================================
// Inngest function: analysis.run
// ============================================================

export const analysisRun = inngest.createFunction(
  { id: 'analysis-run', retries: 0 },
  { event: 'analysis.trigger' },
  async ({ event, step }) => {
    const { run_id, project_id } = event.data as {
      run_id: string;
      project_id: string;
    };

    try {
      // =======================================================
      // Step 1 — Parse PRD (status: parsing_prd)
      // =======================================================
      const { requirements, project } = await step.run('parse-prd', async () => {
        await updateRunStatus(run_id, 'parsing_prd');

        const supabase = createServerClient();

        // Fetch the project
        const { data: proj, error: projError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', project_id)
          .single();

        if (projError || !proj) {
          throw new Error(`Project not found: ${project_id}`);
        }

        // Fetch all requirements for this project
        const { data: reqs, error: reqsError } = await supabase
          .from('requirements')
          .select('*')
          .eq('project_id', project_id);

        if (reqsError) {
          throw new Error(`Failed to fetch requirements: ${reqsError.message}`);
        }

        if (!reqs || reqs.length === 0) {
          throw new Error('No requirements found for this project. Upload a PRD first.');
        }

        return {
          requirements: reqs as Requirement[],
          project: proj as { id: string; repo_owner: string; repo_name: string; branch: string; user_id: string },
        };
      });

      // =======================================================
      // Step 2 — Understand Codebase (status: understanding_code)
      // =======================================================
      const { fileTree, fileContents } = await step.run('understand-codebase', async () => {
        await updateRunStatus(run_id, 'understanding_code');

        const supabase = createServerClient();

        // Get user's GitHub token for API calls
        const { data: user } = await supabase
          .from('users')
          .select('github_token')
          .eq('id', project.user_id)
          .single();

        const token = user?.github_token || process.env.GITHUB_TOKEN || '';
        const octokit = createOctokit(token);

        // Fetch the full repo file tree
        const tree: RepoTreeNode[] = await fetchRepoTree(
          octokit,
          project.repo_owner,
          project.repo_name,
          project.branch
        );

        // Prioritize key files (max ~50) based on requirements
        const keyFiles = prioritizeFiles(tree, requirements, {});

        // Fetch content for each key file
        const contents: Record<string, string> = {};
        for (const filePath of keyFiles) {
          try {
            const content = await fetchFileContent(
              octokit,
              project.repo_owner,
              project.repo_name,
              filePath,
              project.branch
            );
            contents[filePath] = content;
          } catch {
            // Skip files that can't be fetched (binary, too large, etc.)
            console.warn(`[analysis.run] Could not fetch ${filePath}, skipping`);
          }
        }

        // If we got fewer files than expected, do a second pass with the ones we have
        if (Object.keys(contents).length < keyFiles.length) {
          const refilteredKeys = prioritizeFiles(tree, requirements, contents);
          // Only use files we actually have content for
          const finalContents: Record<string, string> = {};
          for (const fp of refilteredKeys) {
            if (contents[fp]) {
              finalContents[fp] = contents[fp];
            }
          }
          return { fileTree: tree, fileContents: finalContents };
        }

        return { fileTree: tree, fileContents: contents };
      });

      // =======================================================
      // Step 3 — Generate Tests (status: generating_tests)
      // =======================================================
      await step.run('generate-tests', async () => {
        await updateRunStatus(run_id, 'generating_tests');
        // The analyzeCodebase function internally handles:
        // 1. Understanding codebase (Pass 1)
        // 2. Generating test cases
        // 3. Running analysis (Pass 2)
        // We update status here for progress tracking
      });

      // =======================================================
      // Step 4 — Run Tests (status: running_tests)
      // =======================================================
      const findings = await step.run('run-tests', async () => {
        await updateRunStatus(run_id, 'running_tests');

        // Run the full Gemini analysis pipeline
        const results = await analyzeCodebase(fileTree, fileContents, requirements);
        return results;
      });

      // =======================================================
      // Step 5 — Complete
      // =======================================================
      await step.run('complete', async () => {
        const supabase = createServerClient();

        // Store each finding in the findings table
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

        if (findingRows.length > 0) {
          const { error: insertError } = await supabase
            .from('findings')
            .insert(findingRows);

          if (insertError) {
            console.error('[analysis.run] Failed to insert findings:', insertError);
            throw new Error(`Failed to store findings: ${insertError.message}`);
          }
        }

        // Calculate health score
        const total = findings.length;
        const passed = findings.filter((f) => f.status === 'pass').length;
        const failed = total - passed;
        const healthScore = total > 0 ? Math.round((passed / total) * 100) : 0;

        // Update analysis_runs with final stats
        await updateRunStatus(run_id, 'complete', {
          health_score: healthScore,
          total_tests: total,
          passed,
          failed,
          completed_at: new Date().toISOString(),
        });

        // Update project health_score and status to 'analyzed'
        const { error: projError } = await supabase
          .from('projects')
          .update({
            health_score: healthScore,
            status: 'analyzed',
          })
          .eq('id', project_id);

        if (projError) {
          console.error('[analysis.run] Failed to update project:', projError);
        }
      });

      return { success: true, run_id };
    } catch (error) {
      // Error handling: set status to 'error' and store the message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[analysis.run] Error in run ${run_id}:`, errorMessage);

      await updateRunStatus(run_id, 'error', {
        error_message: errorMessage,
      });

      // Also update project status to 'error'
      const supabase = createServerClient();
      await supabase
        .from('projects')
        .update({ status: 'error' })
        .eq('id', project_id);

      throw error;
    }
  }
);
