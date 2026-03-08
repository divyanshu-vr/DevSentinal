"use client";

import React, { useState } from "react";
import SeverityBadge from "./severity-badge";
import type { SecurityFinding } from "@/types";

interface SecurityFindingCardProps {
  finding: SecurityFinding;
}

export default function SecurityFindingCard({ finding }: SecurityFindingCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-border2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center gap-4 text-left"
      >
        <SeverityBadge severity={finding.severity} />

        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-mm-text font-semibold truncate">
            {finding.message}
          </div>
          <div className="font-mono text-[10px] text-mm-muted truncate mt-0.5">
            {finding.file_path}
            {finding.line_start !== null && `:${finding.line_start}`}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {finding.category && (
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider">
              {finding.category}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-mm-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-0 border-t border-border">
          <div className="pt-4 space-y-3">
            <div>
              <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">
                Rule
              </div>
              <div className="font-mono text-xs text-mm-text">{finding.rule_id}</div>
            </div>

            {finding.code_snippet && (
              <div>
                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">
                  Code
                </div>
                <pre className="bg-surface2 border border-border2 rounded-lg p-3 font-mono text-[11px] text-mm-text overflow-x-auto">
                  {finding.code_snippet}
                </pre>
              </div>
            )}

            {finding.fix_suggestion && (
              <div>
                <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider font-bold mb-1">
                  Suggested Fix
                </div>
                <div className="font-body text-xs text-mm-text leading-relaxed bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  {finding.fix_suggestion}
                </div>
              </div>
            )}

            {(finding.cwe.length > 0 || finding.owasp.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {finding.cwe.map((c) => (
                  <span key={c} className="font-mono text-[10px] px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20 text-red-400">
                    {c}
                  </span>
                ))}
                {finding.owasp.map((o) => (
                  <span key={o} className="font-mono text-[10px] px-2 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400">
                    {o}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
