import { VultrSandbox } from '@/lib/vultr/sandbox';

/**
 * Create a Vultr sandbox instance, clone the repo, and install dependencies.
 */
export async function createSandbox(
  repoUrl: string,
  branch: string
): Promise<{ sandboxId: string; sandbox: VultrSandbox }> {
  const sandbox = await VultrSandbox.create({ timeoutMs: 300_000 });

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
 */
export async function destroySandbox(sandboxId: string): Promise<void> {
  const sandbox = await VultrSandbox.connect(sandboxId);
  await sandbox.kill();
}
