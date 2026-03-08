import type { CodeGraph, GraphNode, GraphSummary } from '@/types';

interface PrecomputedGraph {
  fileNodes: GraphNode[];
  importEdges: { source: string; target: string }[];
  nodeMap: Map<string, GraphNode>;
  adj: Map<string, string[]>;
}

function precompute(graph: CodeGraph): PrecomputedGraph {
  const fileNodes = graph.nodes.filter((n) => n.type === 'file');
  const importEdges = graph.edges.filter((e) => e.type === 'imports');
  const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));

  const adj = new Map<string, string[]>();
  for (const node of fileNodes) adj.set(node.id, []);
  for (const edge of importEdges) {
    const targets = adj.get(edge.source);
    if (targets && adj.has(edge.target)) {
      targets.push(edge.target);
    }
  }

  return { fileNodes, importEdges, nodeMap, adj };
}

/**
 * Analyze a code graph for structural issues.
 * Pure TypeScript — no sandbox needed.
 */
export function analyzeGraph(graph: CodeGraph): GraphSummary {
  const pg = precompute(graph);

  return {
    circular_dependencies: detectCycles(pg),
    high_coupling: detectHighCoupling(pg),
    orphan_files: detectOrphans(pg),
    deep_chains: detectDeepChains(pg),
    god_modules: detectGodModules(graph),
  };
}

/** Tarjan's SCC algorithm to find circular dependencies */
function detectCycles(pg: PrecomputedGraph): GraphSummary['circular_dependencies'] {
  const { fileNodes, adj, nodeMap } = pg;

  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];

  function strongconnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongconnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const node of fileNodes) {
    if (!indices.has(node.id)) {
      strongconnect(node.id);
    }
  }

  return sccs.map((scc) => ({
    cycle: scc,
    files: scc.map((id) => nodeMap.get(id)?.file_path ?? id),
  }));
}

/** Find files with high in-degree (many importers) */
function detectHighCoupling(pg: PrecomputedGraph): GraphSummary['high_coupling'] {
  const { fileNodes, importEdges } = pg;
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();

  for (const edge of importEdges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  }

  const results: GraphSummary['high_coupling'] = [];
  for (const node of fileNodes) {
    const importers = inDegree.get(node.id) || 0;
    const imports = outDegree.get(node.id) || 0;
    if (importers >= 10) {
      results.push({ file: node.file_path, importers, imports });
    }
  }

  return results.sort((a, b) => b.importers - a.importers);
}

/** Find files with zero imports and zero importers */
function detectOrphans(pg: PrecomputedGraph): string[] {
  const { fileNodes, importEdges } = pg;
  const connected = new Set<string>();

  for (const edge of importEdges) {
    connected.add(edge.source);
    connected.add(edge.target);
  }

  return fileNodes
    .filter((n) => !connected.has(n.id))
    .map((n) => n.file_path);
}

/** Find files with deep transitive import chains */
function detectDeepChains(pg: PrecomputedGraph): GraphSummary['deep_chains'] {
  const { fileNodes, adj } = pg;
  const results: GraphSummary['deep_chains'] = [];

  for (const node of fileNodes) {
    const visited = new Set<string>();
    let maxDepth = 0;

    function dfs(current: string, depth: number) {
      if (visited.has(current) || depth > 20) return;
      visited.add(current);
      maxDepth = Math.max(maxDepth, depth);
      for (const neighbor of adj.get(current) || []) {
        dfs(neighbor, depth + 1);
      }
    }

    dfs(node.id, 0);
    if (maxDepth >= 8) {
      results.push({
        root: node.file_path,
        depth: maxDepth,
      });
    }
  }

  return results.sort((a, b) => b.depth - a.depth).slice(0, 10);
}

/** Find files with 50+ exported symbols */
function detectGodModules(graph: CodeGraph): GraphSummary['god_modules'] {
  return graph.nodes
    .filter((n) => n.type === 'file' && n.metrics?.exports && n.metrics.exports >= 50)
    .map((n) => ({ file: n.file_path, exports: n.metrics!.exports! }))
    .sort((a, b) => b.exports - a.exports);
}
