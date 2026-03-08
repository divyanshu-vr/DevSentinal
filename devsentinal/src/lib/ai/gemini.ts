import OpenAI from 'openai';
import type { Requirement, Finding, RepoTreeNode, GraphSummary } from '@/types';
import {
  CODEBASE_UNDERSTANDING_PROMPT,
  REQUIREMENT_ANALYSIS_PROMPT,
  buildGraphContextSection,
} from '@/lib/ai/prompts/analyze-codebase';
import { GENERATE_TESTS_PROMPT } from '@/lib/ai/prompts/generate-tests';

const client = new OpenAI({
  apiKey: process.env.GOOGLE_GEMINI_API_KEY!,
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const MODEL = 'gemini-2.5-flash';

// ============================================================
// Helper: call Groq and return parsed JSON
// ============================================================

async function callJsonModel(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await client.chat.completions.create(
      {
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      { signal: controller.signal }
    );
    return response.choices[0]?.message?.content ?? '{}';
  } finally {
    clearTimeout(timeoutId);
  }
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

export interface CodebaseAnalysis {
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
    .filter((s) => s.score > -100)
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
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[extractRequirements] Failed to parse JSON from AI response, raw length:', text.length);
    return [];
  }
  const requirements: ExtractedRequirement[] = (parsed.requirements ?? parsed) as ExtractedRequirement[];

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
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[generateTestCases] Failed to parse JSON from AI response, raw length:', text.length);
    return [];
  }
  const testCases: GeneratedTestCase[] = (parsed.test_cases ?? parsed) as GeneratedTestCase[];

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
  let analysis: CodebaseAnalysis;
  try {
    analysis = JSON.parse(text);
  } catch {
    console.error('[understandCodebase] Failed to parse JSON from AI response, raw length:', text.length);
    analysis = {
      framework: null, language: null, api_routes: [], frontend_pages: [],
      auth_middleware: [], database_models: [], key_dependencies: [], architecture_notes: null,
    };
  }

  return analysis;
}

// ============================================================
// analyzeCodebase — full pipeline (Pass 1 + test gen + Pass 2)
// ============================================================

export async function analyzeCodebase(
  fileTree: RepoTreeNode[],
  fileContents: Record<string, string>,
  requirements: Requirement[],
  graphSummary?: GraphSummary | null,
  cachedAnalysis?: { keyFiles: string[]; codebaseAnalysis: CodebaseAnalysis }
): Promise<Finding[]> {
  const keyFiles = cachedAnalysis?.keyFiles ?? prioritizeFiles(fileTree, requirements, fileContents);

  const codebaseAnalysis = cachedAnalysis?.codebaseAnalysis ?? await understandCodebase(fileTree, fileContents, keyFiles);

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

  const graphSection = graphSummary ? `\n${buildGraphContextSection(graphSummary)}\n` : '';

  const prompt = `${REQUIREMENT_ANALYSIS_PROMPT}

## Codebase Analysis (from Pass 1)
${JSON.stringify(codebaseAnalysis, null, 2)}
${graphSection}
## File Tree
${treeStr}

## Key Source Files
${fileContentsStr}

## Requirements to Verify
${requirementsStr}

Return a JSON object with a single key "findings" containing an array of finding objects.`;

  const text = await callJsonModel(prompt);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[analyzeCodebase] Failed to parse JSON from AI response, raw length:', text.length);
    return [];
  }
  const rawFindings: RawFinding[] = (parsed.findings ?? parsed) as RawFinding[];

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

  let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Begin fixing the bug.' },
  ];

  const filesChanged = new Set<string>();
  const agentLog: AgentLogEntry[] = [];
  const MAX_ITERATIONS = 15;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Sliding window: keep system + last 6 messages to stay under token limits
    if (messages.length > 8) {
      messages = [messages[0], ...messages.slice(-6)];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);
    let response;
    try {
      response = await client.chat.completions.create(
        { model: MODEL, messages, tools: AGENT_TOOLS, temperature: 0.1 },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      const toolName = toolCall.function.name;
      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse(toolCall.function.arguments);
      } catch {
        toolInput = {};
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Error: malformed tool arguments' });
        continue;
      }
      const startTime = Date.now();

      let output = await executeTool(toolName, toolInput, sandbox);
      // Truncate tool output to avoid blowing token budget
      if (output.length > 3000) output = output.slice(0, 3000) + '\n...(truncated)';
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

// ============================================================
// runAnalysisAgentLoop — AI Analysis Agent with tool calling
// Replaces understandCodebase() + analyzeCodebase() — reads files on-demand
// ============================================================

const ANALYSIS_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
      name: 'search_codebase',
      description: 'Search for patterns in the codebase using grep. Returns matching lines with file paths.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Search pattern (regex supported)' },
          path: { type: 'string', description: 'Optional subdirectory to search in' },
        },
        required: ['pattern'],
      },
    },
  },
];

function buildAnalysisPrompt(
  fileTree: RepoTreeNode[],
  requirements: Requirement[],
  _graphSummary?: GraphSummary | null,
): string {
  // Aggressively limit tree to keep prompt under token limits (Groq free = 6000 TPM)
  // Only include source files, skip node_modules/dist/build/.git/lock files/etc
  const SKIP_PATTERNS = /node_modules|\.git\/|dist\/|build\/|\.next\/|\.lock$|\.png$|\.jpg$|\.svg$|\.ico$|\.woff/;
  const filteredTree = fileTree.filter((n) => !SKIP_PATTERNS.test(n.path));
  // Cap at 150 entries — enough to understand structure, not blow token budget
  const cappedTree = filteredTree.slice(0, 150);
  const treeStr = cappedTree.map((n) => `${n.type === 'tree' ? 'd' : 'f'} ${n.path}`).join('\n')
    + (filteredTree.length > 150 ? `\n... and ${filteredTree.length - 150} more files (use search_codebase to find specific files)` : '');

  const requirementsStr = requirements.length > 0
    ? requirements.slice(0, 20).map(
        (r) => `[${r.id}] ${r.feature_name}: ${r.description}`
      ).join('\n')
    : '(No requirements — general analysis)';

  return `You are auditing a codebase. Use read_file and search_codebase tools to explore it.

Tasks: Identify framework, routes, auth, DB models, deps. Check each requirement.

Workflow: Read package.json first, then search for routes/auth/models, then verify requirements.

File tree:
${treeStr}

Requirements:
${requirementsStr}

When done, output JSON (no tool calls):
{"analysis":{"framework":"str","language":"str","api_routes":[{"path":"str","method":"str","file_path":"str","description":"str"}],"frontend_pages":[{"path":"str","file_path":"str","description":"str"}],"auth_middleware":[{"file_path":"str","mechanism":"str","description":"str"}],"database_models":[{"name":"str","file_path":"str","fields":["str"]}],"key_dependencies":["str"],"architecture_notes":"str"},"findings":[{"requirement_id":"str","status":"pass|fail","feature_name":"str","test_description":"str","test_type":"happy_path|error_case|auth_guard|validation|edge_case","confidence":0.0-1.0,"file_path":"str|null","line_start":null,"line_end":null,"code_snippet":"str|null","explanation":"str","fix_confidence":0.0-1.0}]}

Start now.`;
}

export async function runAnalysisAgentLoop(
  fileTree: RepoTreeNode[],
  requirements: Requirement[],
  sandbox: Sandbox,
  graphSummary?: GraphSummary | null,
): Promise<{ analysis: CodebaseAnalysis; findings: Finding[] }> {
  const systemPrompt = buildAnalysisPrompt(fileTree, requirements, graphSummary);

  let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: 'Begin the codebase audit.' },
  ];

  const MAX_ITERATIONS = 20;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // Sliding window: keep system + last 6 messages to stay under token limits
    if (messages.length > 8) {
      messages = [messages[0], ...messages.slice(-6)];
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);
    let response;
    try {
      response = await client.chat.completions.create(
        { model: MODEL, messages, tools: ANALYSIS_TOOLS, temperature: 0.1 },
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeoutId);
    }

    const choice = response.choices[0];
    const assistantMessage = choice.message;
    messages.push(assistantMessage);

    // If no tool calls, the AI is done — parse the final response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      break;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      const toolName = toolCall.function.name;
      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse(toolCall.function.arguments);
      } catch {
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: 'Error: malformed arguments' });
        continue;
      }

      let output: string;
      try {
        if (toolName === 'read_file') {
          const content = await sandbox.readFile(toolInput.path as string);
          // Aggressive truncation — 3000 chars max to stay under 6000 TPM
          output = content.length > 3000 ? content.slice(0, 3000) + '\n...(truncated)' : content;
        } else if (toolName === 'search_codebase') {
          const grepCmd = `grep -rn "${toolInput.pattern}" ${toolInput.path || '.'} | head -20`;
          output = await sandbox.runCommand(grepCmd);
          if (output.length > 2000) output = output.slice(0, 2000) + '\n...(truncated)';
        } else {
          output = `Unknown tool: ${toolName}`;
        }
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`;
      }

      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: output });
    }
  }

  // Extract the final JSON from the last assistant message
  const lastMessage = messages[messages.length - 1];
  const content = (lastMessage as { content?: string }).content ?? '{}';

  // Try to extract JSON from the response (may be wrapped in markdown fences)
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1] : content;

  let parsed: { analysis?: CodebaseAnalysis; findings?: RawFinding[] };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    console.error('[runAnalysisAgentLoop] Failed to parse JSON response, length:', content.length);
    parsed = {};
  }

  const analysis: CodebaseAnalysis = parsed.analysis ?? {
    framework: null, language: null, api_routes: [], frontend_pages: [],
    auth_middleware: [], database_models: [], key_dependencies: [], architecture_notes: null,
  };

  const rawFindings: RawFinding[] = (parsed.findings ?? []) as RawFinding[];
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

  return { analysis, findings };
}
