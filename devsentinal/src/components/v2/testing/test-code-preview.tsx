"use client";

import React from "react";
import type { GeneratedTestFile } from "@/types";

interface TestCodePreviewProps {
  file: GeneratedTestFile;
}

export default function TestCodePreview({ file }: TestCodePreviewProps) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(file.content);
  };

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface2">
        <div className="font-mono text-[11px] text-mm-text font-semibold truncate">
          {file.file_path}
        </div>
        <button
          onClick={handleCopy}
          className="font-mono text-[10px] text-mm-muted hover:text-mm-text uppercase tracking-wider font-bold transition-colors flex-shrink-0 ml-3"
        >
          Copy
        </button>
      </div>
      <pre className="p-4 font-mono text-[11px] text-mm-text overflow-auto max-h-[500px] leading-relaxed">
        {file.content}
      </pre>
    </div>
  );
}
