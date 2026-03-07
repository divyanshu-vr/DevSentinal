import OpenAI from 'openai';
import type { Requirement, Finding, RepoTreeNode } from '@/types';
import {
  CODEBASE_UNDERSTANDING_PROMPT,
  REQUIREMENT_ANALYSIS_PROMPT,
} from '@/lib/ai/prompts/analyze-codebase';
import { GENERATE_TESTS_PROMPT } from '@/lib/ai/prompts/generate-tests';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: 'https://api.groq.com/openai/v1',
});

const MODEL = 'qwen/qwen3-32b';

// ============================================================
// Helper: call Groq and return parsed JSON
// ============================================================

async function callJsonModel(prompt: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });
  return response.choices[0]?.message?.content ?? '{}';
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
// Raw finding from LLM (Pass 2 output)
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

export function prioritizeFiles(
  tree: RepoTreeNode[],
  requirements: Requirement[],
  availableContents: Record<string, string>
): string[] {
  const blobs = tree
    .filter((n) => n.type === 'blob')
    .map((n) => n.path);

  const endpointKeywords: string[] = requirements
    .filter((r) => r.endpoint)
    .map((r) => {
      const parts = r.endpoint!.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    })
    .filter(Boolean);

  const scored = blobs.map((path) => {
    let score = 0;

    if (availableContents[path]) score += 5;

    for (const pattern of PRIORITY_PATTERNS) {
      if (pattern.test(path)) {
        score += 10;
        break;
      }
    }

    for (const kw of endpointKeywords) {
      if (path.toLowerCase().includes(kw.toLowerCase())) {
        score += 15;
        break;
      }
    }

    if (/\b(test|spec|__tests__)\b/i.test(path)) {
      score -= 5;
    }

    if (/node_modules|\.next|dist\/|build\//.test(path)) {
      score -= 100;
    }

    return { path, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.path.localeCompare(b.path);
  });

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
  const prompt = `You are a senior software engineer. Analyze the following Product Requirements Document (PRD) and extract ALL structured requirements.

For each requirement, determine:
- category: one of "feature", "endpoint", "acceptance_criteria", or "edge_case"
- feature_name: short name for the feature or requirement
- description: detailed description of what is required
- endpoint: the API endpoint path if this is an endpoint requirement (null otherwise)
- http_method: the HTTP method (GET, POST, PUT, DELETE, PATCH) if this is an endpoint requirement (null otherwise)
- expected_behavior: what the expected behavior should be (null if not specified)
- priority: one of "critical", "high", "medium", or "low"

Return a JSON object with a single key "requirements" containing an array of requirement objects. Be thorough — extract every feature, endpoint, acceptance criteria, and edge case mentioned in the PRD.

PRD Text:
${prdText}`;

  const text = await callJsonModel(prompt);
  const parsed = JSON.parse(text);
  const requirements: ExtractedRequirement[] = parsed.requirements ?? parsed;

  return Array.isArray(requirements) ? requirements : [];
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
${requirementsStr}

Return a JSON object with a single key "test_cases" containing an array of test case objects.`;

  const text = await callJsonModel(prompt);
  const parsed = JSON.parse(text);
  const testCases: GeneratedTestCase[] = parsed.test_cases ?? parsed;

  return Array.isArray(testCases) ? testCases : [];
}

// ============================================================
// understandCodebase — Pass 1: file tree + contents -> analysis
// ============================================================

export async function understandCodebase(
  fileTree: RepoTreeNode[],
  fileContents: Record<string, string>,
  keyFiles: string[]
): Promise<CodebaseAnalysis> {
  const treeStr = fileTree.map((n) => `${n.type === 'tree' ? 'd' : 'f'} ${n.path}`).join('\n');

  const fileContentsStr = keyFiles
    .map((fp) => `--- ${fp} ---\n${fileContents[fp] ?? '(content not available)'}`)
    .join('\n\n');

  const prompt = `${CODEBASE_UNDERSTANDING_PROMPT}

## File Tree
${treeStr}

## Key Source Files
${fileContentsStr}

Return your analysis as a JSON object.`;

  const text = await callJsonModel(prompt);
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
  const keyFiles = prioritizeFiles(fileTree, requirements, fileContents);

  const codebaseAnalysis = await understandCodebase(fileTree, fileContents, keyFiles);

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
${requirementsStr}

Return a JSON object with a single key "findings" containing an array of finding objects.`;

  const text = await callJsonModel(prompt);
  const parsed = JSON.parse(text);
  const rawFindings: RawFinding[] = parsed.findings ?? parsed;

  const findings: Finding[] = (Array.isArray(rawFindings) ? rawFindings : []).map((rf) => ({
    id: '',
    run_id: '',
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
    created_at: '',
  }));

  return findings;
}

// ============================================================
// runAgentLoop — AI Fix Agent with tool calling
// ============================================================

import type { AgentContext, AgentLogEntry } from '@/types';
import { buildFixPrompt } from '@/lib/ai/prompts/fix-code';

interface Sandbox {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  runCommand: (command: string) => Promise<string>;
}

const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a file from the repository by path',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to repo root' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Write content to a file (overwrites existing content)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to repo root' },
          content: { type: 'string', description: 'New file content' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_bash',
      description: 'Execute a bash command in the repository root',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Bash command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_codebase',
      description: 'Search for patterns in the codebase using grep',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex)' },
          path: { type: 'string', description: 'Optional path to search in (defaults to entire repo)' },
        },
        required: ['pattern'],
      },
    },
  },
];

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  sandbox: Sandbox
): Promise<string> {
  try {
    switch (toolName) {
      case 'read_file': {
        const path = toolInput.path as string;
        return await sandbox.readFile(path);
      }
      case 'write_file': {
        const path = toolInput.path as string;
        const content = toolInput.content as string;
        await sandbox.writeFile(path, content);
        return `Successfully wrote to ${path}`;
      }
      case 'run_bash': {
        const command = toolInput.command as string;
        return await sandbox.runCommand(command);
      }
      case 'search_codebase': {
        const pattern = toolInput.pattern as string;
        const path = toolInput.path as string | undefined;
        const grepCommand = `grep -rn "${pattern}" ${path || '.'}`;
        return await sandbox.runCommand(grepCommand);
      }
      default:
        return `Error: Unknown tool ${toolName}`;
    }
  } catch (error) {
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function runAgentLoop(
  context: AgentContext,
  sandbox: Sandbox
): Promise<{
  files_changed: string[];
  agent_log: AgentLogEntry[];
}> {
  const systemPrompt = buildFixPrompt(context);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Begin fixing the bug.' },
  ];

  const filesChanged = new Set<string>();
  const agentLog: AgentLogEntry[] = [];
  const MAX_ITERATIONS = 15;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: AGENT_TOOLS,
      temperature: 0.1,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      const toolName = toolCall.function.name;
      const toolInput = JSON.parse(toolCall.function.arguments);
      const startTime = Date.now();

      const output = await executeTool(toolName, toolInput, sandbox);
      const duration = Date.now() - startTime;

      if (toolName === 'write_file' && toolInput.path) {
        filesChanged.add(toolInput.path as string);
      }

      agentLog.push({
        timestamp: new Date().toISOString(),
        tool: toolName as AgentLogEntry['tool'],
        input: toolInput,
        output,
        duration_ms: duration,
      });

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: output,
      });
    }
  }

  return {
    files_changed: Array.from(filesChanged),
    agent_log: agentLog,
  };
}
