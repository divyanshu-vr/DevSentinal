import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import type { TriggerFixResponse } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; findingId: string } }
) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id: projectId, findingId } = params;
    const supabase = createServerClient();

    // 1. Fetch the finding and verify it belongs to the user's project
    const { data: finding, error: findingError } = await supabase
      .from('findings')
      .select(`
        *,
        analysis_runs!inner (
          project_id,
          projects!inner (
            id,
            user_id
          )
        )
      `)
      .eq('id', findingId)
      .single();

    if (findingError || !finding) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    // Verify the finding belongs to the user's project
    const analysisRun = finding.analysis_runs as { project_id: string; projects: { id: string; user_id: string } };
    if (analysisRun.projects.id !== projectId || analysisRun.projects.user_id !== user.id) {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 });
    }

    // 2. Check if finding already has an active fix job
    const { data: existingJob } = await supabase
      .from('fix_jobs')
      .select('id, status')
      .eq('finding_id', findingId)
      .not('status', 'in', '("error","complete")')
      .maybeSingle();

    if (existingJob) {
      return NextResponse.json(
        { error: 'Finding already has an active fix job' },
        { status: 400 }
      );
    }

    // 3. Create fix_jobs row with status 'pending'
    const { data: job, error: jobError } = await supabase
      .from('fix_jobs')
      .insert({
        finding_id: findingId,
        status: 'pending',
        agent_log: [],
        retry_count: 0,
      })
      .select()
      .single();

    if (jobError || !job) {
      console.error('[POST /api/projects/[id]/fix/[findingId]] Failed to create fix job:', jobError);
      return NextResponse.json({ error: 'Failed to create fix job' }, { status: 500 });
    }

    // 4. Trigger Inngest event fix.trigger
    // TODO: Replace stub with real Inngest client when Person A delivers src/lib/inngest/client.ts (task 2A.5)
    try {
      const { inngest } = await import('@/lib/inngest/client');
      await inngest.send({
        name: 'fix.trigger',
        data: {
          finding_id: findingId,
          job_id: job.id,
        },
      });
    } catch {
      // Inngest client not yet available — stub: log and continue
      console.warn('[POST /api/projects/[id]/fix/[findingId]] Inngest client not available, skipping event send. job_id:', job.id);
    }

    // 5. Return TriggerFixResponse
    const response: TriggerFixResponse = {
      job_id: job.id,
      sse_url: `/api/sse/fix/${job.id}`,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[POST /api/projects/[id]/fix/[findingId]]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
