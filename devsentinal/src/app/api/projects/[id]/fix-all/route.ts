import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest/client';

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

    // Verify ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get the latest completed analysis run
    const { data: run } = await supabase
      .from('analysis_runs')
      .select('id, status, auto_fix_status')
      .eq('project_id', projectId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!run) {
      return NextResponse.json(
        { error: 'No completed analysis run found. Run analysis first.' },
        { status: 400 }
      );
    }

    if (run.auto_fix_status && run.auto_fix_status !== 'error') {
      return NextResponse.json(
        { error: 'Auto-fix already in progress or completed for this run.' },
        { status: 409 }
      );
    }

    // Trigger auto-fix
    await inngest.send({
      name: 'auto-fix.trigger',
      data: {
        run_id: run.id,
        project_id: projectId,
      },
    });

    return NextResponse.json({
      run_id: run.id,
      sse_url: `/api/sse/analysis/${run.id}`,
    });
  } catch (error) {
    console.error('[POST /api/projects/[id]/fix-all]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
