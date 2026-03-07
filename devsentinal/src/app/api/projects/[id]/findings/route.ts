import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import type { FindingsResponse } from '@/types';

export async function GET(
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
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Get run_id from query params — supports UUID or "latest"
    const { searchParams } = new URL(req.url);
    const runIdParam = searchParams.get('run_id');

    if (!runIdParam) {
      return NextResponse.json(
        { error: 'run_id query parameter is required (UUID or "latest")' },
        { status: 400 }
      );
    }

    let runQuery = supabase
      .from('analysis_runs')
      .select('*')
      .eq('project_id', projectId);

    if (runIdParam === 'latest') {
      runQuery = runQuery.order('created_at', { ascending: false }).limit(1);
    } else {
      runQuery = runQuery.eq('id', runIdParam);
    }

    const { data: runs, error: runError } = await runQuery;

    if (runError || !runs || runs.length === 0) {
      return NextResponse.json({ error: 'Analysis run not found' }, { status: 404 });
    }

    const run = runs[0];

    // Fetch all findings for this run
    const { data: findings, error: findingsError } = await supabase
      .from('findings')
      .select('*')
      .eq('run_id', run.id)
      .order('created_at', { ascending: true });

    if (findingsError) {
      console.error('[GET /api/projects/[id]/findings]', findingsError);
      return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 });
    }

    const response: FindingsResponse = {
      run,
      findings: findings ?? [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/projects/[id]/findings]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
