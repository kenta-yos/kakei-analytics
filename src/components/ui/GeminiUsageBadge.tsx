"use client";
import { useEffect, useState } from "react";
import { GEMINI_DAILY_LIMIT } from "@/lib/gemini";

type Usage = { count: number; remaining: number; date: string };

export default function GeminiUsageBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/gemini")
      .then((r) => r.json())
      .then(setUsage)
      .catch(() => {});
  }, []);

  if (!usage) return null;

  const pct = Math.round((usage.count / GEMINI_DAILY_LIMIT) * 100);
  const color =
    pct >= 90 ? "text-red-400" : pct >= 70 ? "text-yellow-400" : "text-green-400";

  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <span>Gemini AI:</span>
      <span className={color}>
        {usage.count}/{GEMINI_DAILY_LIMIT}回
      </span>
      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>残り {usage.remaining}回</span>
    </div>
  );
}
