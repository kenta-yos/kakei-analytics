"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  type?: "expense" | "income" | "all";
  year?: number;
  placeholder?: string;
  className?: string;
  includeAll?: boolean;   // 「すべて」選択肢を先頭に追加
  allLabel?: string;
};

export default function CategorySelect({
  value, onChange, type = "expense", year,
  placeholder = "カテゴリ", className, includeAll = true, allLabel = "すべてのカテゴリ",
}: Props) {
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    const params = new URLSearchParams({ type });
    if (year) params.set("year", String(year));
    fetch(`/api/categories?${params}`)
      .then((r) => r.json())
      .then((json) => setCategories((json.data ?? []).map((d: { category: string }) => d.category)))
      .catch(() => {});
  }, [type, year]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none",
        className
      )}
    >
      {includeAll && <option value="">{allLabel}</option>}
      {/* categories未ロード時はcurrent valueをfallback表示して空白を防ぐ */}
      {categories.length === 0 && value && !includeAll && (
        <option value={value}>{value}</option>
      )}
      {categories.map((cat) => (
        <option key={cat} value={cat}>{cat}</option>
      ))}
    </select>
  );
}
