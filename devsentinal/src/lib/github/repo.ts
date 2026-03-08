import { Octokit } from 'octokit';
import { RepoTreeNode } from '@/types';

export async function fetchRepoTree(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string
): Promise<RepoTreeNode[]> {
  const { data } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: '1',
  });

  if (data.truncated) {
    console.warn(`[fetchRepoTree] Tree for ${owner}/${repo} was truncated — large repo may have incomplete file list`);
  }

  return data.tree.map((node) => ({
    path: node.path ?? '',
    type: node.type === 'tree' ? 'tree' : 'blob',
    size: node.size,
  })) as RepoTreeNode[];
}

export async function fetchFileContent(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string> {
  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
    ref: branch,
  });

  if (Array.isArray(data) || data.type !== 'file') {
    throw new Error(`Path "${path}" is not a file`);
  }

  if (!data.content) {
    throw new Error(`No content returned for "${path}"`);
  }

  return Buffer.from(data.content, 'base64').toString('utf-8');
}

const TECH_STACK_MAP: Record<string, string> = {
  'package.json': 'Node.js',
  'requirements.txt': 'Python',
  'Pipfile': 'Python',
  'pyproject.toml': 'Python',
  'go.mod': 'Go',
  'Cargo.toml': 'Rust',
  'pom.xml': 'Java',
  'build.gradle': 'Java',
  'build.gradle.kts': 'Kotlin',
  'Gemfile': 'Ruby',
  'composer.json': 'PHP',
  'Package.swift': 'Swift',
  'pubspec.yaml': 'Dart',
  'mix.exs': 'Elixir',
  'tsconfig.json': 'TypeScript',
  'next.config.js': 'Next.js',
  'next.config.mjs': 'Next.js',
  'next.config.ts': 'Next.js',
  'nuxt.config.ts': 'Nuxt',
  'angular.json': 'Angular',
  'vue.config.js': 'Vue',
  'svelte.config.js': 'Svelte',
  'tailwind.config.js': 'Tailwind CSS',
  'tailwind.config.ts': 'Tailwind CSS',
  'docker-compose.yml': 'Docker',
  'docker-compose.yaml': 'Docker',
  'Dockerfile': 'Docker',
  '.prisma': 'Prisma',
  'schema.prisma': 'Prisma',
};

export async function detectTechStack(tree: RepoTreeNode[]): Promise<string[]> {
  const detected = new Set<string>();

  for (const node of tree) {
    if (node.type !== 'blob') continue;

    const filename = node.path.split('/').pop() ?? '';
    const tech = TECH_STACK_MAP[filename];
    if (tech) {
      detected.add(tech);
    }
  }

  return Array.from(detected);
}
