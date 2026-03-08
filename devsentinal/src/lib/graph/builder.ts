import type { VultrSandbox } from '@/lib/vultr/sandbox';
import type { CodeGraph, GraphNode, GraphEdge } from '@/types';
import type { GraphSitterOutput, MadgeOutput } from './types';

const GRAPH_SITTER_SCRIPT = `
import json, sys, os

try:
    from graph_sitter import Graph
except ImportError:
    print(json.dumps({"error": "graph-sitter not installed"}))
    sys.exit(1)

repo_path = sys.argv[1] if len(sys.argv) > 1 else "."
graph = Graph(repo_path)

result = {"files": []}

for file in graph.files:
    try:
        file_data = {
            "path": str(file.filepath),
            "functions": [],
            "classes": [],
            "imports": [],
            "exports": []
        }
        for func in file.functions:
            calls = []
            try:
                for call in func.function_calls:
                    calls.append(str(call.name))
            except Exception:
                pass
            file_data["functions"].append({
                "name": str(func.name),
                "line_start": getattr(func, 'start_point', [0])[0] if hasattr(func, 'start_point') else 0,
                "line_end": getattr(func, 'end_point', [0])[0] if hasattr(func, 'end_point') else 0,
                "calls": calls
            })
        for cls in file.classes:
            bases = []
            methods = []
            try:
                bases = [str(b) for b in cls.bases] if hasattr(cls, 'bases') else []
                methods = [str(m.name) for m in cls.methods] if hasattr(cls, 'methods') else []
            except Exception:
                pass
            file_data["classes"].append({
                "name": str(cls.name),
                "line_start": getattr(cls, 'start_point', [0])[0] if hasattr(cls, 'start_point') else 0,
                "line_end": getattr(cls, 'end_point', [0])[0] if hasattr(cls, 'end_point') else 0,
                "bases": bases,
                "methods": methods
            })
        for imp in file.imports:
            file_data["imports"].append({
                "module": str(imp.module) if hasattr(imp, 'module') else str(imp),
                "names": [str(n) for n in imp.names] if hasattr(imp, 'names') else []
            })
        result["files"].append(file_data)
    except Exception:
        continue

print(json.dumps(result))
`;

function parseGraphSitterOutput(output: GraphSitterOutput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  for (const file of output.files) {
    const fileId = `file:${file.path}`;
    if (!nodeIds.has(fileId)) {
      nodeIds.add(fileId);
      nodes.push({
        id: fileId,
        type: 'file',
        file_path: file.path,
        name: file.path.split('/').pop() || file.path,
        metrics: {
          lines: 0,
          exports: file.exports?.length ?? 0,
        },
      });
    }

    for (const func of file.functions) {
      const funcId = `func:${file.path}:${func.name}`;
      if (!nodeIds.has(funcId)) {
        nodeIds.add(funcId);
        nodes.push({
          id: funcId,
          type: 'function',
          file_path: file.path,
          name: func.name,
          line_start: func.line_start,
          line_end: func.line_end,
        });
      }

      for (const callName of func.calls) {
        edges.push({ source: funcId, target: `func:*:${callName}`, type: 'calls' });
      }
    }

    for (const cls of file.classes) {
      const clsId = `class:${file.path}:${cls.name}`;
      if (!nodeIds.has(clsId)) {
        nodeIds.add(clsId);
        nodes.push({
          id: clsId,
          type: 'class',
          file_path: file.path,
          name: cls.name,
          line_start: cls.line_start,
          line_end: cls.line_end,
        });
      }

      for (const base of cls.bases) {
        edges.push({ source: clsId, target: `class:*:${base}`, type: 'extends' });
      }
    }

    for (const imp of file.imports) {
      edges.push({ source: fileId, target: `file:${imp.module}`, type: 'imports' });
    }
  }

  return { nodes, edges };
}

function parseMadgeOutput(output: MadgeOutput): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  for (const [filePath, deps] of Object.entries(output)) {
    const fileId = `file:${filePath}`;
    if (!nodeIds.has(fileId)) {
      nodeIds.add(fileId);
      nodes.push({
        id: fileId,
        type: 'file',
        file_path: filePath,
        name: filePath.split('/').pop() || filePath,
      });
    }

    for (const dep of deps) {
      const depId = `file:${dep}`;
      if (!nodeIds.has(depId)) {
        nodeIds.add(depId);
        nodes.push({
          id: depId,
          type: 'file',
          file_path: dep,
          name: dep.split('/').pop() || dep,
        });
      }
      edges.push({ source: fileId, target: depId, type: 'imports' });
    }
  }

  return { nodes, edges };
}

async function runGraphSitter(
  sandbox: VultrSandbox,
  repoDir: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
  try {
    await sandbox.files.write('/tmp/analyze_graph.py', GRAPH_SITTER_SCRIPT);
    const result = await sandbox.commands.run(
      `cd ${repoDir} && python3 /tmp/analyze_graph.py .`,
      { timeoutMs: 120_000 }
    );

    if (result.exitCode === 0 && result.stdout.trim()) {
      const parsed: GraphSitterOutput = JSON.parse(result.stdout.trim());
      if (!('error' in parsed)) {
        return parseGraphSitterOutput(parsed);
      }
    }
  } catch (error) {
    console.error('[build-code-graph] graph-sitter failed:', error instanceof Error ? error.message : error);
  }
  return null;
}

async function runMadge(
  sandbox: VultrSandbox,
  repoDir: string
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] } | null> {
  try {
    const srcExists = await sandbox.files.exists(`${repoDir}/src`);
    const targetDir = srcExists ? 'src' : '.';
    const result = await sandbox.commands.run(
      `cd ${repoDir} && madge --json ${targetDir} 2>/dev/null`,
      { timeoutMs: 120_000 }
    );

    if (result.exitCode === 0 && result.stdout.trim()) {
      const madgeData: MadgeOutput = JSON.parse(result.stdout.trim());
      return parseMadgeOutput(madgeData);
    }
  } catch (error) {
    console.error('[build-code-graph] madge failed:', error instanceof Error ? error.message : error);
  }
  return null;
}

export async function buildCodeGraph(
  sandbox: VultrSandbox,
  repoDir: string,
  languages: string[]
): Promise<CodeGraph> {
  const allNodes: GraphNode[] = [];
  const allEdges: GraphEdge[] = [];
  const detectedLanguages: string[] = [];

  const isJsTs = languages.some((l) => /javascript|typescript|node/i.test(l));

  // Run graph-sitter and madge in parallel when JS/TS is detected
  const [graphSitterResult, madgeResult] = await Promise.all([
    runGraphSitter(sandbox, repoDir),
    isJsTs ? runMadge(sandbox, repoDir) : Promise.resolve(null),
  ]);

  if (graphSitterResult) {
    allNodes.push(...graphSitterResult.nodes);
    allEdges.push(...graphSitterResult.edges);
    detectedLanguages.push('graph-sitter');
  }

  // Use parallel madge result, or fall back to madge if graph-sitter produced nothing
  const finalMadge = madgeResult ?? (!isJsTs && allNodes.length === 0 ? await runMadge(sandbox, repoDir) : null);
  if (finalMadge) {
    const existingIds = new Set(allNodes.map((n) => n.id));
    for (const node of finalMadge.nodes) {
      if (!existingIds.has(node.id)) {
        allNodes.push(node);
      }
    }
    allEdges.push(...finalMadge.edges);
    detectedLanguages.push('madge');
  }

  return {
    nodes: allNodes,
    edges: allEdges,
    metadata: {
      total_files: allNodes.filter((n) => n.type === 'file').length,
      total_symbols: allNodes.filter((n) => n.type !== 'file').length,
      languages: detectedLanguages,
      generated_at: new Date().toISOString(),
    },
  };
}
