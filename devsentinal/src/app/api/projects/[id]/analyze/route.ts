import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';
import type { TriggerAnalysisResponse } from '@/types';

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

    // Check that the project has requirements (PRD must be uploaded first)
    const { count } = await supabase
      .from('requirements')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (!count || count === 0) {
      return NextResponse.json(
        { error: 'No requirements found. Upload a PRD first.' },
        { status: 400 }
      );
    }

    // Create analysis_runs row with status 'pending'
    const { data: run, error: runError } = await supabase
      .from('analysis_runs')
      .insert({
        project_id: projectId,
        status: 'pending',
        total_tests: 0,
        passed: 0,
        failed: 0,
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

    // Trigger Inngest event
    await inngest.send({
      name: 'analysis.trigger',
      data: {
        run_id: run.id,
        project_id: projectId,
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
