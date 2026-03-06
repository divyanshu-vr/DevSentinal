# Developer C — AI/Agent Lead: TASKS.md

> **Before writing any code, read `shared/rules.md` completely.**

## Your Scope

You own the Claude Sonnet fix agent (tool-use loop), the fix Inngest job orchestration, SSE streaming endpoints, prompt engineering for the fix agent, and the audit-to-fix data bridge.

### Files You Own
- `src/lib/ai/claude.ts`
- `src/lib/ai/prompts/fix-code.ts`
- `src/lib/inngest/fix.ts`
- `src/lib/sse/emitter.ts`
- `src/app/api/sse/analysis/[runId]/route.ts`
- `src/app/api/sse/fix/[jobId]/route.ts`

### Env Vars You Need
```
ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

---

## Task 1: Claude Client + Tool Definitions (Block 2B, ~2h)

### Goal: Claude Sonnet client configured with exactly 4 tools

- [ ] Create `src/lib/ai/claude.ts`:
  ```typescript
  import Anthropic from '@anthropic-ai/sdk';
  import type { AgentContext, AgentLogEntry } from '@/types';

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Define exactly 4 tools as Claude tool-use schemas
  const AGENT_TOOLS = [
    {
      name: 'read_file',
      description: 'Read a file from the repository by its path',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to repo root' } },
        required: ['path']
      }
    },
    {
      name: 'write_file',
      description: 'Write or overwrite a file in the sandbox',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to repo root' },
          content: { type: 'string', description: 'Full file content to write' }
        },
        required: ['path', 'content']
      }
    },
    {
      name: 'run_bash',
      description: 'Execute a shell command in the sandbox. Returns stdout, stderr, and exit code.',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string', description: 'Bash command to execute' } },
        required: ['command']
      }
    },
    {
      name: 'search_codebase',
      description: 'Search for a pattern in the codebase. Returns matching file paths and line numbers.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Grep pattern to search for' },
          path: { type: 'string', description: 'Optional directory to scope search' }
        },
        required: ['pattern']
      }
    }
  ];
  ```

- [ ] Implement `runAgentLoop(context: AgentContext, sandbox)`:
  - Build system prompt from `fix-code.ts` with finding context
  - Call Claude Sonnet with system prompt + tools
  - Enter tool-use loop:
    1. If Claude returns tool_use blocks, execute each tool via Person B's sandbox functions:
       - `read_file` -> `readFile(sandbox, path)`
       - `write_file` -> `writeFile(sandbox, path, content)` + track changed files
       - `run_bash` -> `runInSandbox(sandbox, command)`
       - `search_codebase` -> `runInSandbox(sandbox, "grep -rn '{pattern}' {path || '.'}")`
    2. Feed tool results back to Claude
    3. Repeat until Claude returns a text response (no more tool calls) or max 15 iterations
  - Return `{ files_changed: string[], agent_log: AgentLogEntry[] }`

---

## Task 2: Fix Agent Prompt (Block 2B, ~1.5h)

### Goal: System prompt that makes Claude reliably fix code

- [ ] Create `src/lib/ai/prompts/fix-code.ts`:
  ```typescript
  import type { AgentContext } from '@/types';

  export function buildFixPrompt(context: AgentContext): string {
    return `You are a senior software engineer fixing a bug in a codebase.

  CONTEXT:
  - Feature: ${context.finding.feature_name}
  - What is broken: ${context.finding.explanation}
  - File: ${context.finding.file_path}, lines ${context.finding.line_start}-${context.finding.line_end}
  - Broken code:
  \`\`\`
  ${context.finding.code_snippet}
  \`\`\`
  - PRD requirement: ${context.requirement.description}
  - Expected behavior: ${context.requirement.expected_behavior}
  - Repository: ${context.repo_owner}/${context.repo_name} (branch: ${context.branch})

  INSTRUCTIONS:
  1. First, read the broken file to understand full context
  2. Search the codebase for related files (imports, tests, types)
  3. Write the fix — change as few lines as possible
  4. Run the linter to verify your fix compiles
  5. Run tests if they exist
  6. If tests fail, read the error and fix again (max 1 retry)
  7. When done, respond with a summary of what you changed and why

  RULES:
  - Only modify files directly related to the bug
  - Do not refactor unrelated code
  - Do not add new dependencies
  - Keep changes minimal and focused
  - Always verify your fix compiles before finishing`;
  }
  ```

---

## Task 3: Fix Inngest Job (Block 2B, ~3h) — YOUR CORE DELIVERABLE

### Goal: Inngest function that orchestrates the full fix pipeline

- [ ] Create `src/lib/inngest/fix.ts`:
  ```typescript
  import { inngest } from './client'; // Person A's shared Inngest instance
  ```

  Inngest function `fix.run`, triggered by event `fix.trigger`:

  **Step 1 — Context Pack** (~1s):
  - Read finding + requirement from DB (join on `requirement_id`)
  - Read project for repo details (repo_url, branch, etc.)
  - Read user for GitHub token
  - Build `AgentContext` object
  - Update `fix_jobs.status` to `'sandboxing'`

  **Step 2 — Sandbox** (~10s):
  - Call Person B's `createSandbox(repoUrl, branch)`
  - Update `fix_jobs.status` to `'coding'`

  **Step 3 — Agent Loop** (~30s):
  - Call `runAgentLoop(context, sandbox)` from your `claude.ts`
  - Store `agent_log` in `fix_jobs.agent_log`
  - Update `fix_jobs.status` to `'linting'`

  **Step 4 — Lint** (~5s):
  - Call Person B's `runLint(sandbox, files_changed)`
  - If lint fails with auto-fixable issues: `runInSandbox(sandbox, "npx eslint --fix ...")`
  - Store `lint_result` in `fix_jobs`
  - Update `fix_jobs.status` to `'testing'`

  **Step 5 — Test** (~15s):
  - Call Person B's `runTests(sandbox)`
  - If tests fail AND `retry_count < 1`:
    - Feed error back to Claude with one more `runAgentLoop()` call
    - Re-run tests
    - Increment `retry_count`
  - Store `test_result` in `fix_jobs`
  - Update `fix_jobs.status` to `'opening_pr'`

  **Step 6 — PR Creation** (~5s):
  - Generate branch name: `devsentinel/fix-${finding.id.slice(0, 8)}`
  - Read all changed files from sandbox using `readFile()`
  - Call Person B's `createBranch()`, `commitFiles()`, `openPR()`
  - PR title: `[DevSentinel] Fix: ${finding.feature_name}`
  - PR body: Include finding explanation + what was changed
  - Store `pr_url`, `pr_number`, `branch_name` in `fix_jobs`
  - Update `fix_jobs.status` to `'complete'`

  **Step 7 — Cleanup**:
  - Call Person B's `destroySandbox()`
  - Set `completed_at` timestamp

  **Error handling**: Any step failure -> update status to `'error'`, store error_message, destroy sandbox

---

## Task 4: SSE Streaming Endpoints (Block 2B, ~2h)

### Goal: Real-time progress streaming to the browser

- [ ] Create `src/lib/sse/emitter.ts`:
  ```typescript
  export function createSSEStream(): { stream: ReadableStream; controller: ReadableStreamDefaultController } {
    let controller: ReadableStreamDefaultController;
    const stream = new ReadableStream({
      start(c) { controller = c; },
      cancel() { /* cleanup */ }
    });
    return { stream, controller: controller! };
  }

  export function sendSSEEvent(controller: ReadableStreamDefaultController, data: unknown): void {
    const encoded = new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
    controller.enqueue(encoded);
  }

  export function closeSSE(controller: ReadableStreamDefaultController): void {
    controller.close();
  }
  ```

- [ ] Create `src/app/api/sse/analysis/[runId]/route.ts`:
  - `GET` — returns SSE stream (Response with `Content-Type: text/event-stream`)
  - Poll `analysis_runs` table every 1s for status changes
  - When status changes, emit `AnalysisSSEEvent` with new status
  - When new findings appear, emit them one by one
  - When status = `'complete'`: emit final event with health_score, then close stream
  - When status = `'error'`: emit error event, then close stream
  - Set headers: `Cache-Control: no-cache`, `Connection: keep-alive`

- [ ] Create `src/app/api/sse/fix/[jobId]/route.ts`:
  - `GET` — returns SSE stream
  - Poll `fix_jobs` table every 1s for status changes
  - When status changes, emit `FixSSEEvent` with current stage
  - When `agent_log` grows (array length increases), emit new log entries
  - When status = `'complete'`: emit final event with `pr_url`, then close stream
  - When status = `'error'`: emit error event, then close stream

### Design Note:
Polling Supabase every 1s is acceptable for the hackathon. In production, use Supabase Realtime subscriptions instead.

---

## Task 5: Integration (Block 3, ~2h)

- [ ] Wire fix Inngest job to receive events from Person B's fix trigger route
- [ ] Verify the Inngest serve endpoint (Person A's `src/app/api/inngest/route.ts`) registers your `fix.run` function
- [ ] Test full flow: finding in DB -> trigger fix -> agent loop runs -> PR opens
- [ ] Test SSE streams work end-to-end:
  - Analysis SSE: status updates flow correctly through all stages
  - Fix SSE: agent log entries stream in real time
- [ ] Verify with Person D that the frontend can connect to SSE endpoints

---

## Integration Points

### You Depend On:
- **Person A** stores findings + requirements in DB (you read them in Step 1 of fix job)
- **Person A** provides shared `inngest` client from `src/lib/inngest/client.ts`
- **Person B** provides ALL sandbox + GitHub functions:
  - `createSandbox()`, `destroySandbox()` from `src/lib/e2b/sandbox.ts`
  - `readFile()`, `writeFile()`, `runInSandbox()`, `runLint()`, `runTests()` from `src/lib/e2b/runner.ts`
  - `createBranch()`, `commitFiles()`, `openPR()` from `src/lib/github/pr.ts`
  - **If B is not ready:** Stub sandbox operations with local filesystem operations for testing the agent loop

### Others Depend On You:
- **Person D** connects to your SSE endpoints — deliver these early so D can build the live progress UI
- **Person A** may need to coordinate on Inngest event names and payload shapes

> **Priority:** Deliver `src/lib/sse/emitter.ts` and the SSE route stubs early so Person D can start building the streaming UI against them.
