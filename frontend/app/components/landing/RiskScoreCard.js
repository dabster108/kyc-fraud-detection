"use client";

import { cn } from "@/lib/utils";

export default function RiskScoreCard({
  score = 0,
  size = 120,
  compact = false,
  showTier = true,
  label = "Risk",
}) {
  const clamped = Math.min(Math.max(score, 0), 100);
  const tier = clamped >= 70 ? "High" : clamped >= 40 ? "Moderate" : "Low";
  const ringStyle = {
    background: `conic-gradient(#52c41a ${clamped}%, #e2e8f0 0)`,
  };

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2",
        compact ? "p-2" : "p-3"
      )}
      style={{ width: size }}
    >
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{ width: size, height: size, ...ringStyle }}
      >
        <div className="absolute inset-3 rounded-full bg-white" />
        <div className="relative text-center">
          <p className="text-2xl font-bold text-ink-900">{clamped}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">
            {label}
          </p>
        </div>
      </div>
      {showTier ? (
        <span className="text-xs font-semibold text-ink-500">{tier} risk</span>
      ) : null}
    </div>
  );
}
