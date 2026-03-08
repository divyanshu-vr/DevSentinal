import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { RepoTreeNode } from '@/types';

const CLONE_BASE = path.join(process.cwd(), '.tmp-repos');

export interface LocalRepo {
  dir: string;
  branch: string;
  tree: RepoTreeNode[];
  readFile(filePath: string): string;
  cleanup(): void;
}

/**
 * Clone a repo locally and provide tree + file reading without GitHub API calls.
 * Uses a temp directory under .tmp-repos/ in the project root.
 */
export function cloneRepoLocally(
  repoUrl: string,
  branch?: string,
  onProgress?: (msg: string) => void
): LocalRepo {
  const id = `repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = path.join(CLONE_BASE, id);

  // Ensure base dir exists
  fs.mkdirSync(CLONE_BASE, { recursive: true });

  onProgress?.('Cloning repository locally...');
  const branchArgs = branch ? `--branch ${branch} --single-branch` : '';
  execSync(
    `git clone ${branchArgs} --depth 1 ${repoUrl} ${dir}`,
    { stdio: 'pipe', timeout: 120_000 }
  );
  onProgress?.('Repository cloned');

  // Detect the actual branch name (useful when no branch was specified)
  const detectedBranch = branch || execSync('git rev-parse --abbrev-ref HEAD', { cwd: dir, encoding: 'utf-8' }).trim();

  // Walk the directory tree
  const tree: RepoTreeNode[] = [];
  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(dir, fullPath);
      if (entry.isDirectory()) {
        tree.push({ path: relPath, type: 'tree' });
        walk(fullPath);
      } else if (entry.isFile()) {
        const stat = fs.statSync(fullPath);
        tree.push({ path: relPath, type: 'blob', size: stat.size });
      }
    }
  }
  walk(dir);

  return {
    dir,
    branch: detectedBranch,
    tree,
    readFile(filePath: string): string {
      const full = path.join(dir, filePath);
      return fs.readFileSync(full, 'utf-8');
    },
    cleanup() {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}
