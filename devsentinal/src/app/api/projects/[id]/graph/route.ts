import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import type { GraphResponse } from '@/types';

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

    // Get latest code graph
    const { data: graph, error } = await supabase
      .from('code_graphs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !graph) {
      return NextResponse.json({ graph: null, summary: null } as GraphResponse);
    }

    const response: GraphResponse = {
      graph: graph.graph_data,
      summary: graph.summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/projects/[id]/graph]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
