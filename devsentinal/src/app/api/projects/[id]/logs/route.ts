import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = params;
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('run_id');
  const after = searchParams.get('after') || '1970-01-01T00:00:00Z';

  if (!runId) {
    return NextResponse.json({ error: 'run_id required' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();

    // Verify project ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: logs } = await supabase
      .from('pipeline_logs')
      .select('id, step, sub_step, message, level, metadata, created_at')
      .eq('run_id', runId)
      .gt('created_at', after)
      .order('created_at', { ascending: true })
      .limit(50);

    return NextResponse.json({ logs: logs || [] });
  } catch (error) {
    console.error('[GET /api/projects/[id]/logs]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
