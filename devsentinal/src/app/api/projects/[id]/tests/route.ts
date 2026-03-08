import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import type { GeneratedTestsResponse } from '@/types';

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

    const { data: testFiles, error } = await supabase
      .from('generated_tests')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/projects/[id]/tests]', error);
      return NextResponse.json({ error: 'Failed to fetch tests' }, { status: 500 });
    }

    const response: GeneratedTestsResponse = {
      test_files: testFiles ?? [],
      total_files: testFiles?.length ?? 0,
      total_tests: testFiles?.reduce((sum, f) => sum + (f.test_count ?? 0), 0) ?? 0,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/projects/[id]/tests]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
