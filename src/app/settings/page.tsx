"use client";
import { useState } from "react";
import { Card, ErrorBox, Loading, Page, PageTitle, useApi } from "@/components/ui/kit";
import { PencilIcon } from "@/components/ui/icons";
import { sortCategories } from "@/lib/categories";
import { num, yen } from "@/lib/format";

type StandardData = {
  referenceIncome: number;
  items: { categoryName: string; allocation: number; notes: string | null }[];
};

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi<StandardData>("/api/standard-budget");
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);

  if (error) return <Page><ErrorBox message={error} /></Page>;
  if (loading && !data) return <Page><Loading /></Page>;
  if (!data) return null;

  const order = sortCategories(data.items.map((i) => i.categoryName));
  const items = order.map((c) => data.items.find((i) => i.categoryName === c)!);
  const parse = (s: string) => parseInt(s.replace(/[^0-9-]/g, ""), 10) || 0;
  const total = draft
    ? Object.values(draft).reduce((s, v) => s + parse(v), 0)
    : items.reduce((s, i) => s + i.allocation, 0);

  async function commit() {
    if (!draft) return;
    setSaving(true);
    try {
      await fetch("/api/standard-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceIncome: data!.referenceIncome,
          items: items.map((i) => ({ categoryName: i.categoryName, allocation: parse(draft[i.categoryName] ?? "0"), notes: i.notes ?? undefined })),
        }),
      });
      setDraft(null);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageTitle kicker="設定" title="標準予算" />
      <p className="lbl leading-relaxed">新しい月の予算を作るとき、この金額が配分の初期値になります。</p>
      <Card className="px-4 pb-3 pt-1">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm">
            合計 <b className="text-base">{yen(total)}</b>
          </span>
          {draft ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">編集中</span>
          ) : (
            <button
              type="button"
              className="btn-small"
              onClick={() => setDraft(Object.fromEntries(items.map((i) => [i.categoryName, num(i.allocation)])))}
            >
              <PencilIcon size={16} />
              編集
            </button>
          )}
        </div>
        {items.map((i) => (
          <div key={i.categoryName} className="flex min-h-[52px] items-center justify-between gap-3 border-t border-line2 py-1.5">
            <label htmlFor={`std-${i.categoryName}`} className="text-sm">
              {i.categoryName}
            </label>
            {draft ? (
              <input
                id={`std-${i.categoryName}`}
                inputMode="numeric"
                value={draft[i.categoryName] ?? ""}
                onChange={(e) => setDraft({ ...draft, [i.categoryName]: e.target.value })}
                onFocus={(e) => e.target.select()}
                className="h-11 w-[132px] rounded-[10px] border border-field px-2.5 text-right text-base font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent"
              />
            ) : (
              <span className={`text-base font-bold ${i.allocation === 0 ? "text-mute" : ""}`}>{yen(i.allocation)}</span>
            )}
          </div>
        ))}
        {draft && (
          <div className="grid grid-cols-2 gap-2 pt-3">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)} disabled={saving}>
              キャンセル
            </button>
            <button type="button" className="btn-primary h-12" onClick={commit} disabled={saving}>
              {saving ? "保存中…" : "確定"}
            </button>
          </div>
        )}
      </Card>
    </Page>
  );
}
