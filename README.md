# DevSentinel

PRD-Driven Test Generation & Autonomous Auto-Fix Platform

Connect your GitHub repo + upload your PRD. DevSentinel generates test cases from your spec, runs them against your codebase, tells you exactly what is broken, and opens a GitHub PR to fix it — automatically.

## How It Works

1. **Auth** — Sign in with GitHub via Auth0
2. **Connect** — Paste your GitHub repo URL + upload your PRD (PDF/MD/DOCX)
3. **Analyse** — AI generates test cases from your PRD and checks them against the codebase
4. **Auto-Fix** — Click "Fix" on any failing test. An agent writes the fix and opens a GitHub PR.

## Tech Stack

| Layer | Service |
|-------|---------|
| Frontend + API | Next.js 14, Vercel |
| Auth | Auth0 (GitHub OAuth) |
| Database | Supabase (Postgres + RLS) |
| Audit AI | Google Gemini Flash |
| Fix AI | Claude Sonnet (Anthropic) |
| Sandbox | Vultr |
| Job Queue | Inngest |
| UI | shadcn/ui + Tailwind CSS |

## Project Structure

```
devSentinal/
├── shared/                        # Shared documentation for all developers
│   ├── rules.md                   # Master architecture, types, schema, conventions
│   └── PRD.md                     # Full PRD with ownership annotations
│
├── developer-a-backend/           # Person A — Backend Lead
│   └── TASKS.md                   # Analysis engine, Gemini, DB, Inngest
│
├── developer-b-integrations/      # Person B — API Integrations
│   └── TASKS.md                   # GitHub API, Vultr sandbox, PR creation
│
├── developer-c-ai-agent/          # Person C — AI/Agent
│   └── TASKS.md                   # Claude agent loop, SSE streaming
│
├── developer-d-frontend/          # Person D — Frontend Lead
│   └── TASKS.md                   # Next.js UI, Auth0, all pages
│
├── src/                           # Application source code (created in Block 1)
├── supabase/                      # Database migrations
└── DevSentinel_PRD_v1.docx        # Original PRD document
```

## Getting Started

1. Read `shared/rules.md` — this is the master architecture document
2. Find your developer folder (`developer-a/b/c/d`) and read your `TASKS.md`
3. Set up your `.env.local` with the required environment variables
4. Follow your task list step by step

## Team

| Person | Role | Scope |
|--------|------|-------|
| A | Backend Lead | Analysis engine, Gemini prompts, DB, Inngest |
| B | API Integrations | GitHub API, Vultr sandbox, PR creation |
| C | AI/Agent | Claude agent loop, SSE streaming, fix orchestration |
| D | Frontend Lead | Next.js UI, Auth0, all pages and components |


Key Design Decisions
Single src/types/index.ts prevents type drift across all 4 developers
Every file has exactly one owner — no merge conflicts
Each TASKS.md includes stub instructions so devs can work independently even if dependencies aren't ready
Integration points documented bidirectionally — each dev knows what they provide and what they consume
Person D leads Block 1 (scaffolding) since everyone depends on the Next.js project being initialized
