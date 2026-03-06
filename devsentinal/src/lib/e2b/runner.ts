import { Sandbox } from '@e2b/code-interpreter';
import type { LintResult, TestResult } from '@/types';

const REPO_DIR = '/home/user/repo';

/**
 * Execute a shell command inside the sandbox.
 */
export async function runInSandbox(
  sandbox: Sandbox,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const result = await sandbox.commands.run(command, { timeoutMs: 120_000 });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}

/**
 * Detect linter and run on changed files only.
 * Supports eslint (JS/TS) and ruff (Python).
 */
export async function runLint(
  sandbox: Sandbox,
  changedFiles: string[]
): Promise<LintResult> {
  if (changedFiles.length === 0) {
    return { passed: true, errors: 0, warnings: 0, output: 'No files to lint.' };
  }

  const fileList = changedFiles.map((f) => `"${f}"`).join(' ');

  // Detect which linter to use
  const hasEslint = await sandbox.files.exists(`${REPO_DIR}/node_modules/.bin/eslint`);
  const hasPackageJson = await sandbox.files.exists(`${REPO_DIR}/package.json`);

  if (hasEslint || hasPackageJson) {
    // JS/TS project — use eslint
    const result = await sandbox.commands.run(
      `cd ${REPO_DIR} && npx eslint ${fileList} --format json 2>&1 || true`,
      { timeoutMs: 60_000 }
    );

    const errors = (result.stdout.match(/"severity":2/g) || []).length;
    const warnings = (result.stdout.match(/"severity":1/g) || []).length;

    return {
      passed: errors === 0,
      errors,
      warnings,
      output: result.stdout + result.stderr,
    };
  }

  // Check for Python project
  const hasRequirements = await sandbox.files.exists(`${REPO_DIR}/requirements.txt`);
  const hasPyprojectToml = await sandbox.files.exists(`${REPO_DIR}/pyproject.toml`);

  if (hasRequirements || hasPyprojectToml) {
    // Python project — use ruff
    const result = await sandbox.commands.run(
      `cd ${REPO_DIR} && pip install ruff -q 2>/dev/null && ruff check ${fileList} 2>&1 || true`,
      { timeoutMs: 60_000 }
    );

    const output = result.stdout + result.stderr;
    const errorMatch = output.match(/Found (\d+) error/);
    const errors = errorMatch ? parseInt(errorMatch[1], 10) : 0;

    return {
      passed: errors === 0,
      errors,
      warnings: 0,
      output,
    };
  }

  return { passed: true, errors: 0, warnings: 0, output: 'No supported linter detected.' };
}

/**
 * Detect test runner and run tests.
 * Supports npm test (JS/TS), pytest (Python), go test (Go).
 */
export async function runTests(
  sandbox: Sandbox,
  testCommand?: string
): Promise<TestResult> {
  let cmd: string;

  if (testCommand) {
    cmd = `cd ${REPO_DIR} && ${testCommand}`;
  } else {
    // Auto-detect test runner
    const hasPackageJson = await sandbox.files.exists(`${REPO_DIR}/package.json`);
    const hasRequirements = await sandbox.files.exists(`${REPO_DIR}/requirements.txt`);
    const hasPyprojectToml = await sandbox.files.exists(`${REPO_DIR}/pyproject.toml`);
    const hasGoMod = await sandbox.files.exists(`${REPO_DIR}/go.mod`);

    if (hasPackageJson) {
      cmd = `cd ${REPO_DIR} && npm test 2>&1 || true`;
    } else if (hasRequirements || hasPyprojectToml) {
      cmd = `cd ${REPO_DIR} && python -m pytest --tb=short 2>&1 || true`;
    } else if (hasGoMod) {
      cmd = `cd ${REPO_DIR} && go test ./... 2>&1 || true`;
    } else {
      return {
        passed: true,
        total: 0,
        passed_count: 0,
        failed_count: 0,
        output: 'No supported test runner detected.',
      };
    }
  }

  const result = await sandbox.commands.run(cmd, { timeoutMs: 180_000 });
  const output = result.stdout + result.stderr;

  // Parse test results from output
  let total = 0;
  let passedCount = 0;
  let failedCount = 0;

  // Try npm/jest/vitest pattern: "Tests: X passed, Y failed, Z total"
  const jestMatch = output.match(/Tests:\s+(?:(\d+)\s+passed)?[,\s]*(?:(\d+)\s+failed)?[,\s]*(\d+)\s+total/);
  if (jestMatch) {
    passedCount = parseInt(jestMatch[1] || '0', 10);
    failedCount = parseInt(jestMatch[2] || '0', 10);
    total = parseInt(jestMatch[3] || '0', 10);
  }

  // Try pytest pattern: "X passed, Y failed" or "X passed"
  const pytestMatch = output.match(/(\d+)\s+passed(?:.*?(\d+)\s+failed)?/);
  if (!jestMatch && pytestMatch) {
    passedCount = parseInt(pytestMatch[1], 10);
    failedCount = parseInt(pytestMatch[2] || '0', 10);
    total = passedCount + failedCount;
  }

  // Try go test pattern: "ok" or "FAIL"
  const goPassMatch = output.match(/^ok\s/gm);
  const goFailMatch = output.match(/^FAIL\s/gm);
  if (!jestMatch && !pytestMatch && (goPassMatch || goFailMatch)) {
    passedCount = goPassMatch ? goPassMatch.length : 0;
    failedCount = goFailMatch ? goFailMatch.length : 0;
    total = passedCount + failedCount;
  }

  return {
    passed: failedCount === 0 && result.exitCode === 0,
    total,
    passed_count: passedCount,
    failed_count: failedCount,
    output,
  };
}

/**
 * Read a file inside the sandbox filesystem.
 */
export async function readFile(
  sandbox: Sandbox,
  path: string
): Promise<string> {
  return await sandbox.files.read(path);
}

/**
 * Write a file inside the sandbox filesystem.
 */
export async function writeFile(
  sandbox: Sandbox,
  path: string,
  content: string
): Promise<void> {
  await sandbox.files.write(path, content);
}
