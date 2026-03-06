# Developer D — Frontend Lead: TASKS.md

> **Before writing any code, read `shared/rules.md` completely.**

## Your Scope

You own ALL UI pages, Auth0 integration, Next.js middleware, React components, client-side SSE consumption, and the overall user experience. You also lead Block 1 project scaffolding.

### Files You Own
- Root config: `next.config.js`, `tailwind.config.ts`, `tsconfig.json`, `package.json`, `.env.example`, `.gitignore`, `middleware.ts`
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- `src/app/(auth)/*` — all auth pages
- `src/app/dashboard/*` — dashboard pages
- `src/app/project/*` — all project pages (new, running, report, fix, done)
- `src/app/api/auth/*` — auth API routes
- `src/lib/auth/auth0.ts`, `src/lib/auth/middleware.ts`
- `src/components/**/*` — all components

### Env Vars You Need
```
AUTH0_SECRET, AUTH0_BASE_URL, AUTH0_ISSUER_BASE_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Task 1: Project Scaffolding (Block 1, ~2h) — YOU LEAD THIS

### Goal: Next.js project initialized, all devs can start building

- [ ] Initialize Next.js 14 project:
  ```bash
  npx create-next-app@14 . --typescript --tailwind --eslint --app --src-dir
  ```
- [ ] Install ALL dependencies listed in `shared/rules.md` Section 2
- [ ] Initialize shadcn/ui:
  ```bash
  npx shadcn-ui@latest init
  npx shadcn-ui@latest add button card badge tabs progress dialog input textarea dropdown-menu
  ```
- [ ] Set up `tsconfig.json` path alias: `"@/*": ["./src/*"]`
- [ ] Create `.env.example` with all env vars from `shared/rules.md` Section 8
- [ ] Create `.gitignore` (include `.env.local`, `node_modules/`, `.next/`)
- [ ] Create the full directory structure (empty folders as needed):
  ```bash
  mkdir -p src/lib/{supabase,auth,github,ai/prompts,e2b,inngest,sse,parsers}
  mkdir -p src/components/{layout,project,report,fix,shared}
  mkdir -p src/app/{dashboard,project/new,"project/[id]"/{running,report,"fix/[findingId]"/done}}
  mkdir -p src/app/api/{auth/{callback,me,logout},projects/"[id]"/{findings,analyze,"fix/[findingId]"},upload,"github/repo-tree","github/file-content",sse/{"analysis/[runId]","fix/[jobId]"},inngest}
  mkdir -p src/app/"(auth)"/{login,callback,logout}
  mkdir -p supabase/migrations
  ```
- [ ] Deploy to Vercel, verify blank page loads
- [ ] Push to `main` so all devs can pull the scaffolding

---

## Task 2: Auth0 Integration (Block 1, ~2h)

### Goal: GitHub OAuth login works end-to-end

- [ ] Install `@auth0/nextjs-auth0`

- [ ] Create `src/lib/auth/auth0.ts`:
  - Configure Auth0 SDK with env vars
  - Export session helpers

- [ ] Create `src/lib/auth/middleware.ts`:
  ```typescript
  import { NextRequest } from 'next/server';
  import type { User } from '@/types';

  export async function requireAuth(req: NextRequest): Promise<User | null> {
    // 1. Extract session/JWT from request
    // 2. If no session, return null
    // 3. Get user from session
    // 4. Fetch/create user record in Supabase (upsert on github_id)
    // 5. Return User object
  }
  ```

- [ ] Create auth pages:
  - `src/app/(auth)/login/page.tsx` — redirects to Auth0 Universal Login
  - `src/app/(auth)/callback/route.ts` — handles Auth0 callback, creates session
  - `src/app/(auth)/logout/route.ts` — clears session, redirects to `/`

- [ ] Create auth API routes:
  - `src/app/api/auth/callback/route.ts` — Auth0 API callback handler
  - `src/app/api/auth/me/route.ts` — `GET` returns current user JSON or 401
  - `src/app/api/auth/logout/route.ts` — API logout handler

- [ ] Create `middleware.ts` (root level):
  - Protect `/dashboard/*` and `/project/*` routes
  - Redirect unauthenticated users to `/login`
  - Allow public access to `/`, `/login`, `/api/auth/*`

---

## Task 3: Landing Page (Block 2, ~1.5h)

### Goal: Compelling landing page that converts visitors to sign up

- [ ] Create `src/app/page.tsx`:
  - Hero section: headline + subheadline explaining DevSentinel's value
  - "Get Started" CTA button -> `/login`
  - 4-step "How It Works" visual: Auth -> Connect -> Analyze -> Fix
  - Zero-cost callout section
  - Clean, modern design with Tailwind + shadcn components

- [ ] Create `src/app/layout.tsx`:
  - Root layout with Tailwind, fonts, metadata
  - Auth0 UserProvider wrapper
  - Dark/light theme support (optional)

---

## Task 4: Dashboard Page (Block 2, ~1.5h)

### Goal: List of user's projects with status

- [ ] Create `src/app/dashboard/page.tsx`:
  - Fetch projects from `GET /api/projects`
  - Display as card grid using `ProjectCard` component
  - Status chips: `analyzing` (yellow), `analyzed` (green), `fixing` (blue), `error` (red)
  - "New Project" button -> `/project/new`
  - Empty state for first-time users (illustration + "Create your first project" CTA)
  - Health score badge on each card

- [ ] Create `src/app/dashboard/loading.tsx` — skeleton card grid

- [ ] Create `src/components/project/project-card.tsx`:
  - Project name, repo URL, status chip, health score, created date
  - Click navigates to `/project/[id]/report`

- [ ] Create `src/components/layout/header.tsx`:
  - App logo/name
  - User avatar + username from session
  - Logout button

---

## Task 5: New Project Page (Block 2, ~2h)

### Goal: Repo URL input + PRD file upload + Run Analysis trigger

- [ ] Create `src/app/project/new/page.tsx`:
  - **Step 1**: GitHub repo URL input
    - On paste/submit: call `POST /api/projects` with repo_url
    - Show loading state during fetch
    - Display detected tech stack and file count from response
  - **Step 2**: PRD file upload
    - Drag-and-drop zone (accept `.pdf`, `.md`, `.docx`)
    - On upload: call `POST /api/upload` with FormData (file + project_id)
    - Display extracted requirements for user preview/confirmation
  - **Step 3**: "Run Analysis" button
    - Call `POST /api/projects/[id]/analyze`
    - Redirect to `/project/[id]/running`

- [ ] Create `src/components/project/repo-url-input.tsx`:
  - Input field with URL validation
  - "Connect" button
  - Success state showing repo metadata

- [ ] Create `src/components/project/prd-upload.tsx`:
  - Drag-and-drop zone with file type hints
  - Upload progress indicator
  - Preview of extracted requirements (list of feature names)

---

## Task 6: Analysis Running Page (Block 4, ~1.5h)

### Goal: Live progress display during analysis via SSE

- [ ] Create `src/app/project/[id]/running/page.tsx`:
  - Connect to SSE endpoint: `GET /api/sse/analysis/[runId]`
  - Display 4-stage progress bar:
    1. Parsing PRD
    2. Understanding Code
    3. Generating Tests
    4. Running Tests
  - Current stage highlighted with spinner, completed stages with checkmark
  - Progress message text for each stage
  - When SSE sends `type: 'complete'`, redirect to `/project/[id]/report`
  - When SSE sends `type: 'error'`, show error message with retry button

  **SSE consumption pattern:**
  ```typescript
  useEffect(() => {
    const eventSource = new EventSource(`/api/sse/analysis/${runId}`);
    eventSource.onmessage = (event) => {
      const data: AnalysisSSEEvent = JSON.parse(event.data);
      // Update state based on data.type
    };
    eventSource.onerror = () => { /* handle connection error */ };
    return () => eventSource.close();
  }, [runId]);
  ```

---

## Task 7: Results Report Page (Block 4, ~3h) — YOUR CORE DELIVERABLE

### Goal: The main value screen — health score + findings with Auto-Fix buttons

- [ ] Create `src/app/project/[id]/report/page.tsx`:
  - Fetch findings from `GET /api/projects/[id]/findings?run_id=latest`
  - Health score circle at top
  - Feature tabs: one tab per unique `feature_name`
  - Under each tab: list of FindingCards (PASS and FAIL)

- [ ] Create `src/components/report/health-score.tsx`:
  - Large circular progress indicator with percentage number
  - Color-coded: green >= 80%, yellow 50-79%, red < 50%
  - Animated on mount (count up effect)

- [ ] Create `src/components/report/feature-tab.tsx`:
  - Tab label: feature name + "3/5 passing" badge
  - Green/red badge count

- [ ] Create `src/components/report/finding-card.tsx`:
  - **PASS variant**: Green badge, test description, confidence score
  - **FAIL variant**: Red badge, plain-English explanation, file path + line numbers (displayed as clickable text), code snippet with syntax highlighting, "Auto-Fix This" button
  - "Auto-Fix This" button: calls `POST /api/projects/[id]/fix/[findingId]`, then navigates to fix page

- [ ] Create `src/components/report/code-snippet.tsx`:
  - Syntax-highlighted code block with line numbers
  - Highlight broken lines in red/pink background
  - Use a lightweight syntax highlighter (consider `prism-react-renderer` or just styled `<pre>`)

---

## Task 8: Fix Running + Fix Done Pages (Block 4, ~2h)

### Goal: Live agent log + PR confirmation

- [ ] Create `src/app/project/[id]/fix/[findingId]/page.tsx`:
  - On mount: call `POST /api/projects/[id]/fix/[findingId]` to trigger fix (if not already triggered)
  - Connect to SSE: `GET /api/sse/fix/[jobId]`
  - Display stage progress: Sandboxing -> Coding -> Linting -> Testing -> Opening PR
  - Real-time agent log: scrolling terminal-style display of tool calls
  - When SSE sends `type: 'complete'`, show success and link to done page

- [ ] Create `src/app/project/[id]/fix/[findingId]/done/page.tsx`:
  - "PR Opened Successfully" confirmation with checkmark
  - Link to GitHub PR (opens in new tab)
  - Diff viewer showing what the agent changed
  - "Back to Report" button (navigates to report page)

- [ ] Create `src/components/fix/fix-progress.tsx`:
  - Horizontal stage progress indicator (5 stages)
  - Current stage with spinner, completed stages with checkmark

- [ ] Create `src/components/fix/agent-log.tsx`:
  - Terminal-style dark background with monospace font
  - Auto-scrolls to bottom as new entries appear
  - Each entry shows: tool name, input summary, output summary, duration

- [ ] Create `src/components/fix/diff-viewer.tsx`:
  - Show file changes in unified diff format
  - Green for additions, red for deletions
  - File path headers

---

## Task 9: Shared UI Components (Block 2, ~1h)

- [ ] Create `src/components/shared/loading-spinner.tsx` — reusable spinner with size prop
- [ ] Create `src/components/shared/error-boundary.tsx` — error boundary with retry button

---

## Integration Points

### You Depend On:
- **Person A**: `GET/POST /api/projects`, `POST /api/upload`, `POST /api/projects/[id]/analyze`, `GET /api/projects/[id]/findings`
  - **If A is not ready:** Create mock API responses in your pages for UI development. Use static JSON matching the type shapes from `shared/rules.md`.
- **Person B**: `POST /api/projects/[id]/fix/[findingId]` — returns `job_id` and SSE URL
  - **If B is not ready:** Mock the fix trigger to return a fake job_id
- **Person C**: SSE endpoints at `/api/sse/analysis/[runId]` and `/api/sse/fix/[jobId]`
  - **If C is not ready:** Build UI with mock data first, wire up SSE when C delivers

### Others Depend On You:
- **ALL**: You own project scaffolding (Block 1) — **everyone needs this done first**
- **ALL**: Auth middleware — other devs' API routes use your `requireAuth()` helper
- Deliver `requireAuth()` and project scaffolding ASAP in Block 1

> **Priority:** Block 1 scaffolding + `requireAuth()` are blocking everyone else. These are your #1 priority.
