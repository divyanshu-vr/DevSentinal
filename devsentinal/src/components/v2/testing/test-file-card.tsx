"use client";

import React from "react";
import type { GeneratedTestFile } from "@/types";

interface TestFileCardProps {
  file: GeneratedTestFile;
  isSelected: boolean;
  onClick: () => void;
}

export default function TestFileCard({ file, isSelected, onClick }: TestFileCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-surface border rounded-xl px-5 py-4 transition-all duration-200 hover:border-border2 ${
        isSelected ? "border-accent/50 bg-accent/5" : "border-border"
      }`}
    >
      <div className="font-mono text-xs text-mm-text font-semibold truncate">
        {file.file_path}
      </div>
      <div className="flex items-center gap-3 mt-2">
        <span className="font-mono text-[10px] text-accent">
          {file.test_count} tests
        </span>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-muted uppercase tracking-wider">
          {file.framework}
        </span>
        {file.test_types.map((t) => (
          <span
            key={t}
            className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface3 border border-border2 text-mm-subtle uppercase tracking-wider"
          >
            {t}
          </span>
        ))}
      </div>
    </button>
  );
}
