# Developer B — API Integrations: TASKS.md

> **Before writing any code, read `shared/rules.md` completely.**

## Your Scope

You own all external service integrations: GitHub REST API (Octokit), E2B sandbox lifecycle, CI runner (lint + test in sandbox), PR creation, the fix trigger API route, and the `fix_jobs` migration.

### Files You Own
- `supabase/migrations/007_create_fix_jobs.sql`
- `src/lib/github/client.ts`
- `src/lib/github/repo.ts`
- `src/lib/github/pr.ts`
- `src/lib/e2b/sandbox.ts`
- `src/lib/e2b/runner.ts`
- `src/app/api/projects/[id]/fix/[findingId]/route.ts`
- `src/app/api/github/repo-tree/route.ts`
- `src/app/api/github/file-content/route.ts`

### Env Vars You Need
```
NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2B_API_KEY
```
(GitHub tokens come from user's OAuth session, not env vars)

---

## Task 1: fix_jobs Migration (Block 1, ~15min)

### Goal: Create the fix_jobs table in Supabase

- [x] Create `supabase/migrations/007_create_fix_jobs.sql` — exact SQL from `shared/rules.md` Section 5
- [x] Run migration against Supabase project
- [x] Verify table exists with correct columns and RLS policy

---

## Task 2: GitHub Client Library (Block 2B, ~2h)

### Goal: Reusable GitHub API functions that A and C can call

- [x] Create `src/lib/github/client.ts`:
  ```typescript
  import { Octokit } from 'octokit';

  export function createOctokit(token: string): Octokit {
    return new Octokit({ auth: token });
  }
  ```

- [x] Create `src/lib/github/repo.ts`:
  - `fetchRepoTree(octokit, owner, repo, branch)` -> `RepoTreeNode[]`
    - Uses: `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
    - Maps response to `RepoTreeNode[]` type
  - `fetchFileContent(octokit, owner, repo, path, branch)` -> `string`
    - Uses: `GET /repos/{owner}/{repo}/contents/{path}`
    - Handles base64 decoding of content
  - `detectTechStack(tree: RepoTreeNode[])` -> `string[]`
    - Checks for: `package.json` (Node.js), `requirements.txt` (Python), `go.mod` (Go), `Cargo.toml` (Rust), `pom.xml` (Java), etc.
    - Returns array of detected technologies

- [x] Create `src/lib/github/pr.ts`:
  - `createBranch(octokit, owner, repo, baseBranch, newBranch)` -> `void`
    - Gets base branch SHA via `GET /repos/{owner}/{repo}/git/ref/heads/{baseBranch}`
    - Creates new ref via `POST /repos/{owner}/{repo}/git/refs`
  - `commitFiles(octokit, owner, repo, branch, files: {path, content}[], message)` -> `string` (commit SHA)
    - Creates blobs for each file
    - Creates tree referencing the blobs
    - Creates commit with the tree
    - Updates branch ref to point to new commit
  - `openPR(octokit, owner, repo, head, base, title, body)` -> `{ url: string; number: number }`
    - Creates pull request via `POST /repos/{owner}/{repo}/pulls`

---

## Task 3: GitHub API Routes (Block 2B, ~1h)

### Goal: API routes that the frontend can call to preview repo data

- [x] Create `src/app/api/github/repo-tree/route.ts`:
  - `GET` with query params `owner`, `repo`, `branch`
  - Gets user's GitHub token from session (via Person D's `requireAuth()`)
  - Calls `fetchRepoTree()`, returns `{ tree: RepoTreeNode[] }`
  - Validate query params, return 400 if missing

- [x] Create `src/app/api/github/file-content/route.ts`:
  - `GET` with query params `owner`, `repo`, `path`, `branch`
  - Gets user's GitHub token from session
  - Calls `fetchFileContent()`, returns `{ content: string }`

---

## Task 4: E2B Sandbox Library (Block 2B, ~3h)

### Goal: Create, use, and destroy sandboxed VMs for code fixing

- [ ] Create `src/lib/e2b/sandbox.ts`:
  ```typescript
  import { Sandbox } from '@e2b/code-interpreter';

  export async function createSandbox(repoUrl: string, branch: string): Promise<{ sandboxId: string; sandbox: Sandbox }> {
    // 1. Create E2B sandbox instance
    // 2. Clone the repo inside the sandbox: git clone --branch {branch} --depth 1 {repoUrl}
    // 3. Detect package manager and install dependencies
    // 4. Return sandbox handle
  }

  export async function destroySandbox(sandboxId: string): Promise<void> {
    // Kill and clean up the sandbox
  }
  ```

- [ ] Create `src/lib/e2b/runner.ts`:
  ```typescript
  export async function runInSandbox(sandbox: Sandbox, command: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
  export async function runLint(sandbox: Sandbox, changedFiles: string[]): Promise<LintResult>
  export async function runTests(sandbox: Sandbox, testCommand?: string): Promise<TestResult>
  export async function readFile(sandbox: Sandbox, path: string): Promise<string>
  export async function writeFile(sandbox: Sandbox, path: string, content: string): Promise<void>
  ```
  - `runLint`: Detect linter from tech stack (eslint for JS/TS, ruff for Python). Run on changed files only. Return structured `LintResult`.
  - `runTests`: Detect test runner (npm test / pytest / go test). Run tests. Return structured `TestResult`.
  - `readFile` / `writeFile`: Read/write files inside the sandbox filesystem.

---

## Task 5: Fix Trigger API Route (Block 2B, ~1h)

### Goal: API route that Person D's UI calls when user clicks "Auto-Fix"

- [ ] Create `src/app/api/projects/[id]/fix/[findingId]/route.ts`:
  - `POST` handler:
    1. Authenticate user via `requireAuth()`
    2. Fetch the finding from DB, verify it belongs to user's project
    3. Create `fix_jobs` row with status `'pending'`
    4. Trigger Inngest event `fix.trigger` with `{ finding_id, job_id }`
    5. Return `TriggerFixResponse` with `job_id` and `sse_url`
  - Error cases: 404 if finding not found, 400 if finding already has an active fix job

---

## Task 6: End-to-End Fix Test (Block 3, ~2h)

- [ ] Test: manually create a finding JSON in DB -> trigger fix via API -> sandbox spins up -> agent writes fix (coordinate with Person C) -> lint passes -> PR opens on test repo
- [ ] Verify PR appears on GitHub with correct branch name (`devsentinel/fix-{finding_id_prefix}`) and meaningful diff
- [ ] Verify sandbox is destroyed after completion (no resource leaks)
- [ ] Verify `fix_jobs` row is updated through all status stages correctly

---

## Integration Points

### You Depend On:
- **Person A** stores findings in DB that your fix route reads
  - **If A is not ready:** Manually insert a test finding row into Supabase for testing
- **Person D** provides `requireAuth()` from `src/lib/auth/middleware.ts`
  - **If D is not ready:** Stub with a function returning a hardcoded user with a GitHub token

### Others Depend On You:
- **Person A** calls your `fetchRepoTree()`, `fetchFileContent()`, `detectTechStack()` — **deliver these first (Task 2)**
- **Person C** calls your `createSandbox()`, `destroySandbox()`, `runInSandbox()`, `runLint()`, `runTests()`, `readFile()`, `writeFile()`, `createBranch()`, `commitFiles()`, `openPR()`
- **Person D** calls your fix trigger API route

> **Priority:** Deliver `src/lib/github/repo.ts` (Task 2) as early as possible — Person A's entire analysis pipeline depends on it.
