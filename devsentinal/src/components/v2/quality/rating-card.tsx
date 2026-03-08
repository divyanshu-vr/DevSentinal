"use client";

import React from "react";

interface RatingCardProps {
  label: string;
  rating: string;
  description?: string;
}

const RATING_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  A: { text: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/20" },
  B: { text: "text-lime-400", bg: "bg-lime-500/10", border: "border-lime-500/20" },
  C: { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  D: { text: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20" },
  E: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20" },
};

export default function RatingCard({ label, rating, description }: RatingCardProps) {
  const colors = RATING_COLORS[rating] || { text: "text-mm-muted", bg: "bg-surface3", border: "border-border" };

  return (
    <div className={`${colors.bg} border ${colors.border} rounded-xl p-5 text-center`}>
      <div className={`font-display font-extrabold text-3xl ${colors.text}`}>{rating}</div>
      <div className="font-mono text-[10px] text-mm-muted uppercase tracking-wider mt-1 font-bold">
        {label}
      </div>
      {description && (
        <div className="font-mono text-[10px] text-mm-subtle mt-1">{description}</div>
      )}
    </div>
  );
}
