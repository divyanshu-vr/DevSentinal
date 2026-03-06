import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createOctokit } from '@/lib/github/client';
import { fetchFileContent } from '@/lib/github/repo';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const path = searchParams.get('path');
    const branch = searchParams.get('branch');

    if (!owner || !repo || !path || !branch) {
      return NextResponse.json(
        { error: 'Missing required query params: owner, repo, path, branch' },
        { status: 400 }
      );
    }

    if (!user.github_token) {
      return NextResponse.json({ error: 'No GitHub token available' }, { status: 401 });
    }

    const octokit = createOctokit(user.github_token);
    const content = await fetchFileContent(octokit, owner, repo, path, branch);

    return NextResponse.json({ content });
  } catch (error) {
    console.error('[GET /api/github/file-content]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
