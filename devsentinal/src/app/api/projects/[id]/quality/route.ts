import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import type { QualityResponse } from '@/types';

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

    // Get latest quality report
    const { data: report, error } = await supabase
      .from('quality_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !report) {
      return NextResponse.json({ metrics: null, issues: [], quality_gate: null } as QualityResponse);
    }

    const response: QualityResponse = {
      metrics: report.metrics,
      issues: report.issues ?? [],
      quality_gate: report.quality_gate,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/projects/[id]/quality]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
