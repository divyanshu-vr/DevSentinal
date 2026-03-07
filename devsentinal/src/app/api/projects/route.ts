import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/middleware';
import { createServerClient } from '@/lib/supabase/server';
import { createOctokit } from '@/lib/github/client';
import { fetchRepoTree, detectTechStack } from '@/lib/github/repo';
import type {
  CreateProjectRequest,
  CreateProjectResponse,
  ListProjectsResponse,
} from '@/types';

export async function GET(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerClient();

    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/projects]', error);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    const response: ListProjectsResponse = {
      projects: projects ?? [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[GET /api/projects]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireAuth(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as CreateProjectRequest;

    if (!body.repo_url) {
      return NextResponse.json({ error: 'repo_url is required' }, { status: 400 });
    }

    // Parse repo URL to extract owner/name
    // Supports: https://github.com/owner/repo, https://github.com/owner/repo.git
    const urlMatch = body.repo_url.match(
      /github\.com\/([^/]+)\/([^/.]+)/
    );

    if (!urlMatch) {
      return NextResponse.json(
        { error: 'Invalid GitHub repo URL. Expected format: https://github.com/owner/repo' },
        { status: 400 }
      );
    }

    const repoOwner = urlMatch[1];
    const repoName = urlMatch[2];

    const supabase = createServerClient();

    // Fetch repo tree and detect tech stack using Person B's functions
    // Use GitHub token if available, otherwise use a public-access Octokit
    const octokit = createOctokit(user.github_token ?? '');

    // Auto-detect default branch instead of hardcoding 'main'
    let branch = 'main';
    try {
      const { data: repoData } = await octokit.rest.repos.get({
        owner: repoOwner,
        repo: repoName,
      });
      branch = repoData.default_branch;
    } catch {
      // Fallback to 'main' if we can't detect
    }

    const tree = await fetchRepoTree(octokit, repoOwner, repoName, branch);
    const techStack = await detectTechStack(tree);

    // Create project in DB
    const { data: project, error: insertError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: `${repoOwner}/${repoName}`,
        repo_url: body.repo_url,
        repo_owner: repoOwner,
        repo_name: repoName,
        branch,
        tech_stack: techStack,
        status: 'created',
      })
      .select()
      .single();

    if (insertError || !project) {
      console.error('[POST /api/projects] Failed to create project:', insertError);
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    const response: CreateProjectResponse = {
      project,
      tree,
      tech_stack: techStack,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[POST /api/projects]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
