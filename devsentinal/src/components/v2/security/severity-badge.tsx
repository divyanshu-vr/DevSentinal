"use client";

import React from "react";

interface SeverityBadgeProps {
  severity: "ERROR" | "WARNING" | "INFO";
}

const SEVERITY_CONFIG = {
  ERROR: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400" },
  WARNING: { bg: "bg-yellow-500/10", border: "border-yellow-500/20", text: "text-yellow-400" },
  INFO: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400" },
};

export default function SeverityBadge({ severity }: SeverityBadgeProps) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.INFO;

  return (
    <span
      className={`font-mono text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-bold ${config.bg} ${config.border} ${config.text}`}
    >
      {severity}
    </span>
  );
}
