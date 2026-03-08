import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import type { TriggerAnalysisResponse, PipelineOptions } from '@/types';

const DEFAULT_OPTIONS: PipelineOptions = {
  security_scan: true,
  quality_scan: true,
  generate_tests: false,
  auto_fix: false,
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id: projectId } = params;
    const supabase = createServerClient();

    // Parse pipeline options from request body
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine — use defaults
    }

    const options: PipelineOptions = {
      security_scan: typeof body.security_scan === 'boolean' ? body.security_scan : DEFAULT_OPTIONS.security_scan,
      quality_scan: typeof body.quality_scan === 'boolean' ? body.quality_scan : DEFAULT_OPTIONS.quality_scan,
      generate_tests: typeof body.generate_tests === 'boolean' ? body.generate_tests : DEFAULT_OPTIONS.generate_tests,
      auto_fix: typeof body.auto_fix === 'boolean' ? body.auto_fix : DEFAULT_OPTIONS.auto_fix,
    };

    // Verify the project exists and belongs to the user
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, status')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status === 'analyzing') {
      return NextResponse.json({ error: 'Analysis is already running for this project' }, { status: 409 });
    }

    // Only require PRD when generate_tests is enabled
    if (options.generate_tests) {
      const { count } = await supabase
        .from('requirements')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);

      if (!count || count === 0) {
        return NextResponse.json(
          { error: 'PRD required for test generation. Upload a PRD first.' },
          { status: 400 }
        );
      }
    }

    // Create analysis_runs row with status 'pending' and pipeline options
    const { data: run, error: runError } = await supabase
      .from('analysis_runs')
      .insert({
        project_id: projectId,
        status: 'pending',
        total_tests: 0,
        passed: 0,
        failed: 0,
        pipeline_options: options,
      })
      .select()
      .single();

    if (runError || !run) {
      console.error('[POST /api/projects/[id]/analyze] Failed to create analysis run:', runError);
      return NextResponse.json({ error: 'Failed to create analysis run' }, { status: 500 });
    }

    // Update project status to 'analyzing'
    await supabase
      .from('projects')
      .update({ status: 'analyzing' })
      .eq('id', projectId);

    // Trigger Inngest event with pipeline options
    await inngest.send({
      name: 'analysis.trigger',
      data: {
        run_id: run.id,
        project_id: projectId,
        options,
      },
    });

    // Return TriggerAnalysisResponse
    const response: TriggerAnalysisResponse = {
      run_id: run.id,
      sse_url: `/api/sse/analysis/${run.id}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/projects/[id]/analyze]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
