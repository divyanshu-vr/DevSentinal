"use client";

import React from "react";

interface QualityGateBadgeProps {
  status: "PASS" | "FAIL" | null;
}

export default function QualityGateBadge({ status }: QualityGateBadgeProps) {
  if (!status) {
    return (
      <span className="font-mono text-[10px] px-3 py-1.5 rounded-full bg-surface3 border border-border text-mm-muted uppercase tracking-wider font-bold">
        N/A
      </span>
    );
  }

  const isPassing = status === "PASS";

  return (
    <span
      className={`font-mono text-[10px] px-3 py-1.5 rounded-full border uppercase tracking-wider font-bold ${
        isPassing
          ? "bg-green-500/10 border-green-500/20 text-green-400"
          : "bg-red-500/10 border-red-500/20 text-red-400"
      }`}
    >
      Quality Gate: {status}
    </span>
  );
}
