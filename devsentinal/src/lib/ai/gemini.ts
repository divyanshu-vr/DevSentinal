import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration } from '@google/generative-ai';
import type { Requirement, Finding, RepoTreeNode } from '@/types';
import {
  CODEBASE_UNDERSTANDING_PROMPT,
  REQUIREMENT_ANALYSIS_PROMPT,
} from '@/lib/ai/prompts/analyze-codebase';
import { GENERATE_TESTS_PROMPT } from '@/lib/ai/prompts/generate-tests';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);

// ============================================================
// Shared model factory — always uses JSON mode
// ============================================================

function getJsonModel() {
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });
}

// ============================================================
// Extracted requirement type (used by upload route)
// ============================================================

interface ExtractedRequirement {
  category: Requirement['category'];
  feature_name: string;
  description: string;
  endpoint: string | null;
  http_method: string | null;
  expected_behavior: string | null;
  priority: Requirement['priority'];
}

// ============================================================
// Codebase understanding result (Pass 1 output)
// ============================================================

interface CodebaseAnalysis {
  framework: string | null;
  language: string | null;
  api_routes: {
    path: string;
    method: string;
    file_path: string;
    description: string;
  }[];
  frontend_pages: {
    path: string;
    file_path: string;
    description: string;
  }[];
  auth_middleware: {
    file_path: string;
    mechanism: string;
    description: string;
  }[];
  database_models: {
    name: string;
    file_path: string;
    fields: string[];
  }[];
  key_dependencies: string[];
  architecture_notes: string | null;
}

// ============================================================
// Generated test case type
// ============================================================

interface GeneratedTestCase {
  requirement_id: string;
  feature_name: string;
  test_description: string;
  test_type: Finding['test_type'];
  priority: Requirement['priority'];
  steps: string[];
  expected_result: string;
  relevant_files: string[];
  relevant_endpoints: string[];
}

// ============================================================
// Raw finding from Gemini (Pass 2 output)
// ============================================================

interface RawFinding {
  requirement_id: string;
  status: 'pass' | 'fail';
  feature_name: string;
  test_description: string;
  test_type: Finding['test_type'];
  confidence: number;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  code_snippet: string | null;
  explanation: string;
  fix_confidence: number;
}

// ============================================================
// Large repo handling — prioritize key files (~50 max)
// ============================================================

const MAX_KEY_FILES = 50;

/** File patterns that are most relevant for analysis */
const PRIORITY_PATTERNS = [
  /\broute\.ts$/,
  /\broute\.js$/,
  /\bapi\//,
  /\bmiddleware\.ts$/,
  /\bschema/,
  /\bmigration/,
  /\bmodel/,
  /\bcontroller/,
  /\bservice/,
  /\bauth/,
  /\bconfig/,
  /package\.json$/,
  /\.env\.example$/,
  /\bpage\.tsx$/,
  /\bpage\.ts$/,
  /\blayout\.tsx$/,
];

/**
 * Given a full file tree and a set of requirements, pick the most relevant
 * file paths to send to Gemini. Prioritizes files matching:
 * 1. Endpoints mentioned in requirements
 * 2. Common route/model/config patterns
 * 3. Alphabetical order as fallback
 */
export function prioritizeFiles(
  tree: RepoTreeNode[],
  requirements: Requirement[],
  availableContents: Record<string, string>
): string[] {
  const blobs = tree
    .filter((n) => n.type === 'blob')
    .map((n) => n.path);

  // Extract endpoint keywords from requirements to match against file paths
  const endpointKeywords: string[] = requirements
    .filter((r) => r.endpoint)
    .map((r) => {
      // "/api/users" -> "users"
      const parts = r.endpoint!.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    })
    .filter(Boolean);

  // Score each file
  const scored = blobs.map((path) => {
    let score = 0;

    // Boost files whose content we actually have
    if (availableContents[path]) score += 5;

    // Boost files matching priority patterns
    for (const pattern of PRIORITY_PATTERNS) {
      if (pattern.test(path)) {
        score += 10;
        break;
      }
    }

    // Boost files matching endpoint keywords from requirements
    for (const kw of endpointKeywords) {
      if (path.toLowerCase().includes(kw.toLowerCase())) {
        score += 15;
        break;
      }
    }

    // Slight penalty for test files (less relevant for compliance audit)
    if (/\b(test|spec|__tests__)\b/i.test(path)) {
      score -= 5;
    }

    // Slight penalty for node_modules, .next, dist, build
    if (/node_modules|\.next|dist\/|build\//.test(path)) {
      score -= 100;
    }

    return { path, score };
  });

  // Sort descending by score, then alphabetically for tie-breaking
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

  // Take top N files that we have content for
  const selected = scored
    .filter((s) => availableContents[s.path])
    .slice(0, MAX_KEY_FILES)
    .map((s) => s.path);

  return selected;
}

// ============================================================
// extractRequirements — PRD -> structured requirements
// ============================================================

export async function extractRequirements(
  prdText: string
): Promise<ExtractedRequirement[]> {
  const model = getJsonModel();

  const prompt = `You are a senior software engineer. Analyze the following Product Requirements Document (PRD) and extract ALL structured requirements.

For each requirement, determine:
- category: one of "feature", "endpoint", "acceptance_criteria", or "edge_case"
- feature_name: short name for the feature or requirement
- description: detailed description of what is required
- endpoint: the API endpoint path if this is an endpoint requirement (null otherwise)
- http_method: the HTTP method (GET, POST, PUT, DELETE, PATCH) if this is an endpoint requirement (null otherwise)
- expected_behavior: what the expected behavior should be (null if not specified)
- priority: one of "critical", "high", "medium", or "low"

Return a JSON array of requirement objects. Be thorough — extract every feature, endpoint, acceptance criteria, and edge case mentioned in the PRD.

PRD Text:
${prdText}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const requirements: ExtractedRequirement[] = JSON.parse(text);

  return requirements;
}

// ============================================================
// generateTestCases — requirements + codebase -> test cases
// ============================================================

export async function generateTestCases(
  codebaseAnalysis: CodebaseAnalysis,
  fileContents: Record<string, string>,
  keyFiles: string[],
  requirements: Requirement[]
): Promise<GeneratedTestCase[]> {
  const model = getJsonModel();

  const fileContentsStr = keyFiles
    .map((fp) => `--- ${fp} ---\n${fileContents[fp] ?? '(content not available)'}`)
    .join('\n\n');

  const requirementsStr = requirements
    .map(
      (r) =>
        `[${r.id}] (${r.category}/${r.priority}) ${r.feature_name}: ${r.description}` +
        (r.endpoint ? ` | Endpoint: ${r.http_method} ${r.endpoint}` : '') +
        (r.expected_behavior ? ` | Expected: ${r.expected_behavior}` : '')
    )
    .join('\n');

  const prompt = `${GENERATE_TESTS_PROMPT}

## Codebase Analysis
${JSON.stringify(codebaseAnalysis, null, 2)}

## Key Source Files
${fileContentsStr}

## Requirements
${requirementsStr}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const testCases: GeneratedTestCase[] = JSON.parse(text);

  return testCases;
}

// ============================================================
// understandCodebase — Pass 1: file tree + contents -> analysis
// ============================================================

export async function understandCodebase(
  fileTree: RepoTreeNode[],
  fileContents: Record<string, string>,
  keyFiles: string[]
): Promise<CodebaseAnalysis> {
  const model = getJsonModel();

  const treeStr = fileTree.map((n) => `${n.type === 'tree' ? 'd' : 'f'} ${n.path}`).join('\n');

  const fileContentsStr = keyFiles
    .map((fp) => `--- ${fp} ---\n${fileContents[fp] ?? '(content not available)'}`)
    .join('\n\n');

  const prompt = `${CODEBASE_UNDERSTANDING_PROMPT}

## File Tree
${treeStr}

## Key Source Files
${fileContentsStr}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const analysis: CodebaseAnalysis = JSON.parse(text);

  return analysis;
}

// ============================================================
// analyzeCodebase — full pipeline (Pass 1 + test gen + Pass 2)
// ============================================================

export async function analyzeCodebase(
  fileTree: RepoTreeNode[],
  fileContents: Record<string, string>,
  requirements: Requirement[]
): Promise<Finding[]> {
  // Step 1: Prioritize files to send to Gemini (max ~50 key files)
  const keyFiles = prioritizeFiles(fileTree, requirements, fileContents);

  // Step 2: Pass 1 — Understand the codebase structure
  const codebaseAnalysis = await understandCodebase(fileTree, fileContents, keyFiles);

  // Step 3: Pass 2 — Compare requirements against codebase and generate findings
  const model = getJsonModel();

  const treeStr = fileTree.map((n) => `${n.type === 'tree' ? 'd' : 'f'} ${n.path}`).join('\n');

  const fileContentsStr = keyFiles
    .map((fp) => `--- ${fp} ---\n${fileContents[fp] ?? '(content not available)'}`)
    .join('\n\n');

  const requirementsStr = requirements
    .map(
      (r) =>
        `[${r.id}] (${r.category}/${r.priority}) ${r.feature_name}: ${r.description}` +
        (r.endpoint ? ` | Endpoint: ${r.http_method} ${r.endpoint}` : '') +
        (r.expected_behavior ? ` | Expected: ${r.expected_behavior}` : '')
    )
    .join('\n');

  const prompt = `${REQUIREMENT_ANALYSIS_PROMPT}

## Codebase Analysis (from Pass 1)
${JSON.stringify(codebaseAnalysis, null, 2)}

## File Tree
${treeStr}

## Key Source Files
${fileContentsStr}

## Requirements to Verify
${requirementsStr}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const rawFindings: RawFinding[] = JSON.parse(text);

  // Map raw findings to the Finding type shape (without id, run_id, created_at — those are set by DB)
  const findings: Finding[] = rawFindings.map((rf) => ({
    id: '', // will be set by database
    run_id: '', // will be set by caller
    requirement_id: rf.requirement_id,
    status: rf.status,
    feature_name: rf.feature_name,
    test_description: rf.test_description,
    test_type: rf.test_type,
    confidence: Math.max(0, Math.min(1, rf.confidence)),
    file_path: rf.file_path,
    line_start: rf.line_start,
    line_end: rf.line_end,
    code_snippet: rf.code_snippet,
    explanation: rf.explanation,
    fix_confidence: rf.status === 'fail' ? Math.max(0, Math.min(1, rf.fix_confidence)) : null,
    created_at: '', // will be set by database
  }));

  return findings;
}

// ============================================================
// runAgentLoop — AI Fix Agent with tool calling
// ============================================================

import type { AgentContext, AgentLogEntry } from '@/types';
import { buildFixPrompt } from '@/lib/ai/prompts/fix-code';

/**
 * Sandbox interface — provided by another developer
 * These functions interact with the sandboxed repository
 */
interface Sandbox {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  runCommand: (command: string) => Promise<string>;
}

/**
 * Tool definitions for Gemini function calling
 */
const AGENT_TOOLS: FunctionDeclaration[] = [
  {
    name: 'read_file',
    description: 'Read a file from the repository by path',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        path: {
          type: SchemaType.STRING,
          description: 'File path relative to repo root',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file (overwrites existing content)',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        path: {
          type: SchemaType.STRING,
          description: 'File path relative to repo root',
        },
        content: {
          type: SchemaType.STRING,
          description: 'New file content',
        },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'run_bash',
    description: 'Execute a bash command in the repository root',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        command: {
          type: SchemaType.STRING,
          description: 'Bash command to execute',
        },
      },
      required: ['command'],
    },
  },
  {
    name: 'search_codebase',
    description: 'Search for patterns in the codebase using grep',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        pattern: {
          type: SchemaType.STRING,
          description: 'Search pattern (regex)',
        },
        path: {
          type: SchemaType.STRING,
          description: 'Optional path to search in (defaults to entire repo)',
        },
      },
      required: ['pattern'],
    },
  },
];

/**
 * Execute a single tool call
 */
async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  sandbox: Sandbox
): Promise<string> {
  try {
    switch (toolName) {
      case 'read_file': {
        const path = toolInput.path as string;
        const content = await sandbox.readFile(path);
        return content;
      }

      case 'write_file': {
        const path = toolInput.path as string;
        const content = toolInput.content as string;
        await sandbox.writeFile(path, content);
        return `Successfully wrote to ${path}`;
      }

      case 'run_bash': {
        const command = toolInput.command as string;
        const output = await sandbox.runCommand(command);
        return output;
      }

      case 'search_codebase': {
        const pattern = toolInput.pattern as string;
        const path = toolInput.path as string | undefined;
        const grepCommand = `grep -rn "${pattern}" ${path || '.'}`;
        const output = await sandbox.runCommand(grepCommand);
        return output;
      }

      default:
        return `Error: Unknown tool ${toolName}`;
    }
  } catch (error) {
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Main agent loop — runs Gemini with tool calling until completion
 */
export async function runAgentLoop(
  context: AgentContext,
  sandbox: Sandbox
): Promise<{
  files_changed: string[];
  agent_log: AgentLogEntry[];
}> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-flash',
    tools: [{ functionDeclarations: AGENT_TOOLS }],
  });

  const systemPrompt = buildFixPrompt(context);
  const chat = model.startChat({
    history: [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [{ text: 'Understood. I will fix the bug following the workflow. Let me start by reading the broken file.' }],
      },
    ],
  });

  const filesChanged = new Set<string>();
  const agentLog: AgentLogEntry[] = [];
  const MAX_ITERATIONS = 15;

  let iteration = 0;
  let lastMessage = 'Begin fixing the bug.';

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const result = await chat.sendMessage(lastMessage);
    const response = result.response;

    // Check if Gemini wants to call a function
    const functionCalls = response.functionCalls();

    if (!functionCalls || functionCalls.length === 0) {
      // No more tool calls — agent is done
      break;
    }

    // Execute all function calls
    const functionResponses = await Promise.all(
      functionCalls.map(async (call) => {
        const toolName = call.name;
        const toolInput = (call.args ?? {}) as Record<string, unknown>;
        const startTime = Date.now();

        const output = await executeTool(toolName, toolInput, sandbox);
        const duration = Date.now() - startTime;

        // Track files changed
        if (toolName === 'write_file' && toolInput.path) {
          filesChanged.add(toolInput.path as string);
        }

        // Log the tool execution
        agentLog.push({
          timestamp: new Date().toISOString(),
          tool: toolName as AgentLogEntry['tool'],
          input: toolInput,
          output,
          duration_ms: duration,
        });

        return {
          name: call.name,
          response: { output },
        };
      })
    );

    // Send function results back to Gemini
    lastMessage = JSON.stringify(functionResponses);
  }

  return {
    files_changed: Array.from(filesChanged),
    agent_log: agentLog,
  };
}
