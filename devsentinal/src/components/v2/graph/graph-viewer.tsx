"use client";

import React, { useRef, useCallback, useEffect, useState } from "react";
import type { CodeGraph } from "@/types";

// Dynamic import for react-force-graph-2d (SSR incompatible)
let ForceGraph2D: React.ComponentType<Record<string, unknown>> | null = null;

interface GraphViewerProps {
  graph: CodeGraph;
}

interface GraphNode {
  id: string;
  name: string;
  type: string;
  val: number;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
}

const TYPE_COLORS: Record<string, string> = {
  file: "#8b5cf6",
  function: "#3b82f6",
  class: "#f59e0b",
  module: "#10b981",
  default: "#6b7280",
};

export default function GraphViewer({ graph }: GraphViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import("react-force-graph-2d").then((mod) => {
      ForceGraph2D = mod.default;
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height: Math.max(height, 400) });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const graphData = React.useMemo(() => {
    const nodes: GraphNode[] = graph.nodes.map((n) => ({
      id: n.id,
      name: n.name || n.id.split("/").pop() || n.id,
      type: n.type,
      val: Math.max(1, (n.metrics?.exports ?? 1)),
      color: TYPE_COLORS[n.type] || TYPE_COLORS.default,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: GraphLink[] = graph.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    return { nodes, links };
  }, [graph]);

  const paintNode = useCallback(
    (node: Record<string, unknown>, ctx: CanvasRenderingContext2D) => {
      const x = node.x as number;
      const y = node.y as number;
      const label = (node.name as string) || "";
      const color = (node.color as string) || "#6b7280";
      const size = Math.sqrt(node.val as number) * 3;

      ctx.beginPath();
      ctx.arc(x, y, size, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.font = "2px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(label, x, y + size + 1);
    },
    []
  );

  if (!loaded || !ForceGraph2D) {
    return (
      <div
        ref={containerRef}
        className="w-full h-[500px] bg-surface2 rounded-xl border border-border2 flex items-center justify-center"
      >
        <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider">
          Loading graph...
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-[500px] bg-surface2 rounded-xl border border-border2 overflow-hidden"
    >
      <ForceGraph2D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="transparent"
        nodeCanvasObject={paintNode}
        linkColor={() => "rgba(255,255,255,0.05)"}
        linkWidth={0.5}
        cooldownTicks={100}
        enableNodeDrag={true}
        enableZoomInteraction={true}
      />
    </div>
  );
}
