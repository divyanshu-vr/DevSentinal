"use client";

import React from "react";
import type { CodeSmell } from "@/types";

interface CodeSmellCardProps {
  issue: CodeSmell;
}

const SEVERITY_COLORS: Record<string, string> = {
  BLOCKER: "text-red-400 bg-red-500/10 border-red-500/20",
  CRITICAL: "text-red-400 bg-red-500/10 border-red-500/20",
  MAJOR: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  MINOR: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  INFO: "text-blue-400 bg-blue-500/10 border-blue-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  CODE_SMELL: "Smell",
  BUG: "Bug",
  VULNERABILITY: "Vuln",
};

export default function CodeSmellCard({ issue }: CodeSmellCardProps) {
  const severityClass = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.INFO;

  return (
    <div className="bg-surface border border-border rounded-xl px-5 py-4 flex items-center gap-4 hover:border-border2 transition-colors">
      <span
        className={`font-mono text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold flex-shrink-0 ${severityClass}`}
      >
        {issue.severity}
      </span>

      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-mm-text truncate">{issue.message}</div>
        <div className="font-mono text-[10px] text-mm-muted mt-0.5 truncate">
          {issue.file_path}:{issue.line} &middot; {issue.rule}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider">
          {TYPE_LABELS[issue.type] || issue.type}
        </span>
        {issue.effort && (
          <span className="font-mono text-[10px] text-mm-subtle">{issue.effort}</span>
        )}
      </div>
    </div>
  );
}
