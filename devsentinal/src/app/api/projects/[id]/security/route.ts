import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import type { SecurityResponse } from '@/types';

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

    // Verify ownership
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', projectId)
      .single();

    if (!project || project.user_id !== user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Optional severity filter
    const url = new URL(req.url);
    const severity = url.searchParams.get('severity');

    let query = supabase
      .from('security_findings')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (severity) {
      query = query.eq('severity', severity.toUpperCase());
    }

    const { data: findings, error } = await query;

    if (error) {
      console.error('[GET /api/projects/[id]/security]', error);
      return NextResponse.json({ error: 'Failed to fetch findings' }, { status: 500 });
    }

    const response: SecurityResponse = {
      findings: findings ?? [],
      total: findings?.length ?? 0,
      by_severity: {
        ERROR: findings?.filter((f) => f.severity === 'ERROR').length ?? 0,
        WARNING: findings?.filter((f) => f.severity === 'WARNING').length ?? 0,
        INFO: findings?.filter((f) => f.severity === 'INFO').length ?? 0,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/projects/[id]/security]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
