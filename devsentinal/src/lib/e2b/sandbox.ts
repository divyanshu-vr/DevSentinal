import { VultrSandbox } from '@/lib/vultr/sandbox';
import { deleteVultrInstance } from '@/lib/vultr/client';

/**
 * Create a Vultr sandbox instance, clone the repo, and install dependencies.
 */
export async function createSandbox(
  repoUrl: string,
  branch: string,
  onProgress?: (msg: string) => void
): Promise<{ sandboxId: string; sandbox: VultrSandbox }> {
  const sandbox = await VultrSandbox.create({ timeoutMs: 300_000, onProgress });

  try {
    // Clone the repo inside the sandbox
    const cloneResult = await sandbox.commands.run(
      `git clone --branch ${branch} --depth 1 ${repoUrl} /home/user/repo`,
      { timeoutMs: 120_000 }
    );

    if (cloneResult.exitCode !== 0) {
      throw new Error(`git clone failed: ${cloneResult.stderr}`);
    }

    // Detect package manager and install dependencies
    const hasPackageJson = await sandbox.files.exists('/home/user/repo/package.json');
    const hasRequirementsTxt = await sandbox.files.exists('/home/user/repo/requirements.txt');
    const hasGoMod = await sandbox.files.exists('/home/user/repo/go.mod');

    if (hasPackageJson) {
      const hasYarnLock = await sandbox.files.exists('/home/user/repo/yarn.lock');
      const hasPnpmLock = await sandbox.files.exists('/home/user/repo/pnpm-lock.yaml');

      let installCmd: string;
      if (hasPnpmLock) {
        installCmd = 'cd /home/user/repo && pnpm install --frozen-lockfile';
      } else if (hasYarnLock) {
        installCmd = 'cd /home/user/repo && yarn install --frozen-lockfile';
      } else {
        installCmd = 'cd /home/user/repo && npm install';
      }

      const installResult = await sandbox.commands.run(installCmd, { timeoutMs: 180_000 });
      if (installResult.exitCode !== 0) {
        console.error('[createSandbox] dependency install warning:', installResult.stderr);
      }
    } else if (hasRequirementsTxt) {
      const installResult = await sandbox.commands.run(
        'cd /home/user/repo && pip install -r requirements.txt',
        { timeoutMs: 180_000 }
      );
      if (installResult.exitCode !== 0) {
        console.error('[createSandbox] pip install warning:', installResult.stderr);
      }
    } else if (hasGoMod) {
      const installResult = await sandbox.commands.run(
        'cd /home/user/repo && go mod download',
        { timeoutMs: 180_000 }
      );
      if (installResult.exitCode !== 0) {
        console.error('[createSandbox] go mod download warning:', installResult.stderr);
      }
    }

    return { sandboxId: sandbox.sandboxId, sandbox };
  } catch (error) {
    // Clean up sandbox on failure
    await sandbox.kill().catch(() => {});
    throw error;
  }
}

/**
 * Kill and clean up a Vultr sandbox.
 * Calls the Vultr API directly — no need to SSH reconnect just to delete.
 */
export async function destroySandbox(sandboxId: string): Promise<void> {
  await deleteVultrInstance(sandboxId);
}

/**
 * Idempotently install analysis tools in the sandbox.
 * Tools should be pre-installed in the golden snapshot; this is a safety check.
 */
export async function installAnalysisTools(
  sandbox: VultrSandbox,
  tools: ('graph-sitter' | 'semgrep' | 'sonar-scanner' | 'madge')[]
): Promise<void> {
  await Promise.all(tools.map(async (tool) => {
    switch (tool) {
      case 'graph-sitter': {
        const check = await sandbox.commands.run('pip show graph-sitter', { timeoutMs: 10_000 });
        if (check.exitCode !== 0) {
          await sandbox.commands.run('pip install graph-sitter', { timeoutMs: 60_000 });
        }
        break;
      }
      case 'semgrep': {
        const check = await sandbox.commands.run('which semgrep', { timeoutMs: 10_000 });
        if (check.exitCode !== 0) {
          await sandbox.commands.run('pip install semgrep', { timeoutMs: 60_000 });
        }
        break;
      }
      case 'sonar-scanner': {
        const check = await sandbox.commands.run('which sonar-scanner', { timeoutMs: 10_000 });
        if (check.exitCode !== 0) {
          await sandbox.commands.run('npm install -g sonarqube-scanner', { timeoutMs: 60_000 });
        }
        break;
      }
      case 'madge': {
        const check = await sandbox.commands.run('which madge', { timeoutMs: 10_000 });
        if (check.exitCode !== 0) {
          await sandbox.commands.run('npm install -g madge', { timeoutMs: 60_000 });
        }
        break;
      }
    }
  }));
}
