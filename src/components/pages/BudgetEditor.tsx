"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ErrorBox, Loading, MonthNav, useApi } from "@/components/ui/kit";
import { ChevronLeft } from "@/components/ui/icons";
import { BONUS_CATEGORY } from "@/lib/categories";
import { nextMonth, num, prevMonth, signed, yen } from "@/lib/format";

type EditorData = {
  year: number;
  month: number;
  hasSaved: boolean;
  cap: number;
  capMonth: { year: number; month: number };
  rows: { category: string; allocation: number; carryover: number; lastActual: number; standard: number }[];
};

export default function BudgetEditor({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const { data, error, loading } = useApi<EditorData>(`/api/budget-editor?year=${year}&month=${month}`);
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!data) return;
    const a: Record<string, number> = {};
    const t: Record<string, string> = {};
    data.rows.forEach((r) => {
      a[r.category] = r.allocation;
      t[r.category] = num(r.allocation);
    });
    setAlloc(a);
    setText(t);
  }, [data]);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  // 配分も繰越も標準予算も 0 のカテゴリは折りたたむ
  const isActive = (r: EditorData["rows"][number]) =>
    r.carryover !== 0 || r.standard !== 0 || r.allocation !== 0 || (alloc[r.category] ?? 0) !== 0;
  const visible = showAll ? rows : rows.filter(isActive);
  const hiddenCount = rows.length - rows.filter(isActive).length;

  if (error) return <div className="p-4"><ErrorBox message={error} /></div>;
  if (loading && !data) return <Loading />;
  if (!data) return null;

  const allocated = Object.values(alloc).reduce((s, v) => s + v, 0);
  const remain = data.cap - allocated;
  const over = remain < 0;
  const p = prevMonth(year, month);
  const n = nextMonth(year, month);

  function onInput(cat: string, value: string) {
    setText((t) => ({ ...t, [cat]: value }));
    const v = parseInt(value.replace(/[^0-9-]/g, ""), 10);
    setAlloc((a) => ({ ...a, [cat]: Number.isFinite(v) ? v : 0 }));
  }

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          items: rows.map((r) => ({ categoryName: r.category, allocation: alloc[r.category] ?? 0, carryover: r.carryover })),
        }),
      });
      if (!res.ok) throw new Error();
      router.push("/");
      router.refresh();
    } catch {
      setSaveError("保存に失敗しました。もう一度お試しください。");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[720px] pb-36 lg:max-w-[880px]">
      <header className="flex items-center gap-1 px-4 pb-3.5 pt-12 lg:pt-8">
        <Link href="/" aria-label="ホームに戻る" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card">
          <ChevronLeft size={20} />
        </Link>
        <div className="flex flex-1 justify-center">
          <MonthNav
            label={`${year}年${month}月の予算`}
            prevHref={`/budget?year=${p.year}&month=${p.month}`}
            nextHref={`/budget?year=${n.year}&month=${n.month}`}
          />
        </div>
        <div className="w-11 shrink-0" />
      </header>

      <section className="mx-4 flex flex-col gap-2.5 rounded-[14px] border border-accent-line bg-accent-soft px-4 py-[18px]">
        <span className="text-sm font-bold text-accent-deep">{over ? "上限を超えています" : "まだ配分できる額"}</span>
        <span className={`text-4xl font-bold leading-tight ${over ? "text-over" : "text-accent-deep"}`}>{yen(remain)}</span>
        <div className="h-2.5 overflow-hidden rounded-[5px] bg-card">
          <div
            className={`h-full rounded-[5px] ${over ? "bg-over-fill" : "bg-accent"}`}
            style={{ width: `${data.cap > 0 ? Math.min(100, (allocated / data.cap) * 100) : 0}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-ink2">
          <span>配分済み {yen(allocated)}</span>
          <span>
            上限 {yen(data.cap)}（{data.capMonth.month}月の収入）
          </span>
        </div>
      </section>

      <div className="px-4 pt-3">
        <section className="card px-4 pb-2 pt-1">
          <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] gap-2 pb-2 pt-3 text-xs text-sub">
            <span>繰越</span>
            <span className="text-right">配分</span>
            <span className="text-right font-bold text-accent-deep">予算（使える額）</span>
          </div>
          {visible.map((r) => {
            const a = alloc[r.category] ?? 0;
            const budget = a + r.carryover;
            const id = `amt-${r.category}`;
            return (
              <div key={r.category} className="flex flex-col gap-2 border-t border-line2 py-3">
                <div className="flex items-baseline justify-between">
                  <label htmlFor={id} className="text-[15px] font-bold">
                    {r.category}
                  </label>
                  <span className="lbl">先月実績 {yen(r.lastActual)}</span>
                </div>
                <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                  <span
                    className={`text-[13px] ${r.carryover < 0 ? "font-bold text-over" : r.carryover > 0 ? "text-accent" : "text-mute"}`}
                  >
                    {signed(r.carryover)}
                  </span>
                  <input
                    id={id}
                    className="amt-input"
                    type="text"
                    inputMode="numeric"
                    value={text[r.category] ?? ""}
                    onChange={(e) => onInput(r.category, e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => setText((t) => ({ ...t, [r.category]: num(a) }))}
                  />
                  <div
                    className={`flex h-12 items-center justify-end rounded-[10px] px-2.5 text-lg font-bold ${
                      budget < 0 ? "bg-over-soft text-over" : "bg-accent-soft text-accent-deep"
                    }`}
                  >
                    {yen(budget)}
                  </div>
                </div>
                {r.category === BONUS_CATEGORY && (
                  <span className="lbl">賞与の月は積み増し分も含めて配分。繰越＝いまの残高</span>
                )}
              </div>
            );
          })}
          {hiddenCount > 0 && (
            <button type="button" className="min-h-11 w-full border-t border-line2 text-[13px] text-accent" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "0円のカテゴリを隠す" : `ほかのカテゴリ（${hiddenCount}）を表示`}
            </button>
          )}
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-3 lg:left-[232px]">
        <div className="mx-auto max-w-[720px] lg:max-w-[880px]">
          {saveError && <p className="mb-2 text-sm text-over">{saveError}</p>}
          <button type="button" className="btn-primary w-full" onClick={save} disabled={saving}>
            {saving ? "保存しています…" : `${month}月の予算を保存する`}
          </button>
        </div>
      </div>
    </div>
  );
}
