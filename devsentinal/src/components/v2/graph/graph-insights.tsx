"use client";

import React from "react";
import type { GraphSummary } from "@/types";

interface GraphInsightsProps {
  summary: GraphSummary;
  nodeCount: number;
  edgeCount: number;
}

export default function GraphInsights({ summary, nodeCount, edgeCount }: GraphInsightsProps) {
  const hasCycles = summary.circular_dependencies.length > 0;
  const hasHighCoupling = summary.high_coupling.length > 0;
  const hasOrphans = summary.orphan_files.length > 0;
  const hasDeepChains = summary.deep_chains?.length > 0;
  const hasGodModules = summary.god_modules?.length > 0;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Nodes" value={nodeCount} />
        <StatCard label="Edges" value={edgeCount} />
        <StatCard
          label="Cycles"
          value={summary.circular_dependencies.length}
          variant={hasCycles ? "warning" : "success"}
        />
        <StatCard
          label="High Coupling"
          value={summary.high_coupling.length}
          variant={hasHighCoupling ? "warning" : "success"}
        />
      </div>

      {/* Circular dependencies */}
      {hasCycles && (
        <InsightSection title="Circular Dependencies" variant="warning">
          {summary.circular_dependencies.map((cycle, i) => (
            <div key={i} className="font-mono text-[11px] text-mm-text py-1.5 border-b border-border last:border-0">
              {cycle.files.join(" -> ")}
            </div>
          ))}
        </InsightSection>
      )}

      {/* High coupling */}
      {hasHighCoupling && (
        <InsightSection title="High Coupling Modules" variant="warning">
          {summary.high_coupling.map((mod, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <span className="font-mono text-[11px] text-mm-text truncate">{mod.file}</span>
              <span className="font-mono text-[10px] text-yellow-400 ml-2 flex-shrink-0">
                {mod.importers} importers
              </span>
            </div>
          ))}
        </InsightSection>
      )}

      {/* Orphan files */}
      {hasOrphans && (
        <InsightSection title="Orphan Files" variant="info">
          {summary.orphan_files.slice(0, 10).map((file, i) => (
            <div key={i} className="font-mono text-[11px] text-mm-muted py-1 border-b border-border last:border-0">
              {file}
            </div>
          ))}
          {summary.orphan_files.length > 10 && (
            <div className="font-mono text-[10px] text-mm-subtle pt-1">
              +{summary.orphan_files.length - 10} more
            </div>
          )}
        </InsightSection>
      )}

      {/* Deep chains */}
      {hasDeepChains && (
        <InsightSection title="Deep Import Chains" variant="warning">
          {summary.deep_chains!.map((chain, i) => (
            <div key={i} className="font-mono text-[11px] text-mm-text py-1.5 border-b border-border last:border-0">
              Depth {chain.depth}: {chain.root}
            </div>
          ))}
        </InsightSection>
      )}

      {/* God modules */}
      {hasGodModules && (
        <InsightSection title="God Modules" variant="warning">
          {summary.god_modules!.map((mod, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <span className="font-mono text-[11px] text-mm-text truncate">{mod.file}</span>
              <span className="font-mono text-[10px] text-yellow-400 ml-2 flex-shrink-0">
                {mod.exports} exports
              </span>
            </div>
          ))}
        </InsightSection>
      )}

      {/* All good */}
      {!hasCycles && !hasHighCoupling && !hasOrphans && !hasDeepChains && !hasGodModules && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6 text-center">
          <div className="font-mono text-xs text-green-400 font-semibold">
            Clean architecture — no structural issues detected
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: number;
  variant?: "default" | "success" | "warning";
}) {
  const colorClass =
    variant === "success"
      ? "text-green-400"
      : variant === "warning"
      ? "text-yellow-400"
      : "text-mm-text";

  return (
    <div className="bg-surface border border-border rounded-xl p-4 text-center">
      <div className={`font-display font-extrabold text-2xl ${colorClass}`}>{value}</div>
      <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

function InsightSection({
  title,
  variant,
  children,
}: {
  title: string;
  variant: "warning" | "info";
  children: React.ReactNode;
}) {
  const borderColor = variant === "warning" ? "border-yellow-500/20" : "border-blue-500/20";
  const bgColor = variant === "warning" ? "bg-yellow-500/5" : "bg-blue-500/5";
  const titleColor = variant === "warning" ? "text-yellow-400" : "text-blue-400";

  return (
    <div className={`${bgColor} border ${borderColor} rounded-xl p-4`}>
      <div className={`font-mono text-[10px] ${titleColor} uppercase tracking-wider font-bold mb-3`}>
        {title}
      </div>
      <div className="max-h-48 overflow-y-auto">{children}</div>
    </div>
  );
}
