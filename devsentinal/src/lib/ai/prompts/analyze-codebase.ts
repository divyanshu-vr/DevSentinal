// ============================================================
// Gemini Prompts — Codebase Analysis (Pass 1 + Pass 2)
// ============================================================

/**
 * Pass 1: Understand the codebase structure.
 * Gemini reads the file tree + key source files and identifies
 * framework, API routes, frontend pages, auth middleware, and DB models.
 */
export const CODEBASE_UNDERSTANDING_PROMPT = `You are a senior software engineer performing a codebase audit.

Given the following repository file tree and key source file contents, analyze the codebase and return a structured JSON object with the following fields:

{
  "framework": "string — the primary framework (e.g. Next.js, Express, Django, Rails)",
  "language": "string — primary language (e.g. TypeScript, Python, Go)",
  "api_routes": [
    {
      "path": "string — the route path (e.g. /api/users)",
      "method": "string — HTTP method (GET, POST, PUT, DELETE, PATCH)",
      "file_path": "string — source file that defines this route",
      "description": "string — brief description of what this route does"
    }
  ],
  "frontend_pages": [
    {
      "path": "string — the page path (e.g. /dashboard)",
      "file_path": "string — source file for this page",
      "description": "string — brief description of the page"
    }
  ],
  "auth_middleware": [
    {
      "file_path": "string — file implementing auth",
      "mechanism": "string — e.g. JWT, session, OAuth",
      "description": "string — how auth is enforced"
    }
  ],
  "database_models": [
    {
      "name": "string — model/table name",
      "file_path": "string — file defining the model or schema",
      "fields": ["string — list of key field names"]
    }
  ],
  "key_dependencies": ["string — important libraries/packages detected"],
  "architecture_notes": "string — any notable architectural patterns (monorepo, microservices, serverless, etc.)"
}

Be thorough. Identify every API route, page, and model you can find in the provided files. If you cannot determine a field, use null.

Return ONLY the JSON object, no markdown fences or extra text.`;

/**
 * Pass 2: Compare codebase against PRD requirements.
 * Gemini receives the codebase analysis from Pass 1 plus the PRD requirements,
 * and for each requirement determines if the code satisfies it.
 */
export const REQUIREMENT_ANALYSIS_PROMPT = `You are a senior software engineer performing a compliance audit of a codebase against a Product Requirements Document (PRD).

You are given:
1. A codebase analysis (framework, routes, pages, auth, models)
2. The key source file contents
3. A list of PRD requirements

For EACH requirement, determine whether the codebase satisfies it. Return a JSON array of finding objects:

[
  {
    "requirement_id": "string — the ID of the requirement being tested",
    "status": "pass" or "fail",
    "feature_name": "string — name of the feature being tested",
    "test_description": "string — describe what was checked",
    "test_type": "happy_path" or "error_case" or "auth_guard" or "validation" or "edge_case",
    "confidence": number between 0.0 and 1.0,
    "file_path": "string or null — the most relevant source file",
    "line_start": number or null,
    "line_end": number or null,
    "code_snippet": "string or null — relevant code snippet (max 10 lines)",
    "explanation": "string — detailed explanation of why this passes or fails",
    "fix_confidence": number between 0.0 and 1.0 — how confident you are that an AI agent could fix this if it fails (0.0 if it passes)
  }
]

Rules:
- A requirement PASSES if you can find code that implements the described behavior.
- A requirement FAILS if the code is missing, incomplete, or contradicts the requirement.
- For each finding, cite the specific file and code that supports your determination.
- Be precise with file paths — use the exact paths from the file tree.
- Set confidence based on how certain you are (1.0 = absolutely certain, 0.5 = uncertain).
- Generate multiple test types per requirement when applicable (e.g. a feature may have a happy_path test AND an edge_case test).
- For failed findings, set fix_confidence to estimate how easily an AI agent could write a fix.

Return ONLY the JSON array, no markdown fences or extra text.`;

/**
 * Optional graph context section injected into Pass 2 when available.
 */
export function buildGraphContextSection(graphSummary: {
  circular_dependencies: { files: string[] }[];
  high_coupling: { file: string; importers: number }[];
  orphan_files: string[];
}): string {
  const lines: string[] = ['## Code Structure Analysis'];

  if (graphSummary.circular_dependencies.length > 0) {
    lines.push(`\nCircular Dependencies (${graphSummary.circular_dependencies.length} cycles):`);
    for (const cycle of graphSummary.circular_dependencies.slice(0, 5)) {
      lines.push(`  - ${cycle.files.join(' → ')}`);
    }
  }

  if (graphSummary.high_coupling.length > 0) {
    lines.push(`\nHigh Coupling Modules (imported by 10+ files):`);
    for (const mod of graphSummary.high_coupling.slice(0, 5)) {
      lines.push(`  - ${mod.file} (${mod.importers} importers)`);
    }
  }

  if (graphSummary.orphan_files.length > 0) {
    lines.push(`\nOrphan Files (${graphSummary.orphan_files.length} files with zero imports/importers):`);
    for (const f of graphSummary.orphan_files.slice(0, 10)) {
      lines.push(`  - ${f}`);
    }
  }

  lines.push('\nConsider these structural issues when evaluating requirements.');
  return lines.join('\n');
}
