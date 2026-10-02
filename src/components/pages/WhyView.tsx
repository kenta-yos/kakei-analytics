"use client";
import { useState } from "react";
import AnalysisHeader from "@/components/analysis/AnalysisHeader";
import { Card, ErrorBox, Loading, MonthNav, Page, Segmented, useApi } from "@/components/ui/kit";
import { ChevronDown } from "@/components/ui/icons";
import { nextMonth, prevMonth, signed, yen } from "@/lib/format";

type WhyData = {
  year: number;
  month: number;
  prevMonth: { year: number; month: number };
  baseYears: number[];
  totals: { current: number; prev: number; yearAvg: number };
  rows: { category: string; current: number; prev: number; yearAvg: number }[];
  transactions: { date: string; category: string; itemName: string; amount: number }[];
};

type Mode = "prev" | "year";

export default function WhyView({ year, month }: { year?: number; month?: number }) {
  const q = year && month ? `?year=${year}&month=${month}` : "";
  const { data, error, loading } = useApi<WhyData>(`/api/analysis/why${q}`);
  const [mode, setMode] = useState<Mode>("year");
  const [open, setOpen] = useState<string | null>(null);

  const p = data ? prevMonth(data.year, data.month) : null;
  const n = data ? nextMonth(data.year, data.month) : null;
  const base = data ? (mode === "prev" ? data.totals.prev : data.totals.yearAvg) : 0;
  const diff = data ? data.totals.current - base : 0;

  const rows = data
    ? data.rows
        .map((r) => ({ ...r, diff: r.current - (mode === "prev" ? r.prev : r.yearAvg) }))
        .filter((r) => Math.round(r.diff) !== 0)
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 10)
    : [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.diff)));

  return (
    <Page>
      <AnalysisHeader
        title="今月はなぜ多い"
        exportQuery={data ? `view=why&year=${data.year}&month=${data.month}` : null}
        exportLabel="今月の要因"
      />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && p && n && (
        <>
          <div className="flex justify-center">
            <MonthNav
              label={`${data.year}年${data.month}月`}
              prevHref={`/analysis/why?year=${p.year}&month=${p.month}`}
              nextHref={`/analysis/why?year=${n.year}&month=${n.month}`}
            />
          </div>
          <Segmented
            options={[
              { value: "prev", label: "前月と比べる" },
              { value: "year", label: `例年の${data.month}月と比べる` },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Card className="flex flex-col gap-1.5">
            <span className="lbl">
              {data.month}月の支出 {yen(data.totals.current)} ·{" "}
              {mode === "prev" ? `${data.prevMonth.month}月` : `例年${data.month}月平均（${data.baseYears.join("・")}）`} {yen(base)}
            </span>
            <div className="text-[22px] font-bold">
              <span className={diff >= 0 ? "text-over" : "text-accent"}>{yen(Math.abs(diff))}</span> {diff >= 0 ? "多い" : "少ない"}
            </div>
          </Card>

          <Card className="flex flex-col px-4 py-3">
            <h2 className="mb-2 mt-1 text-sm font-bold">差を生んだカテゴリ</h2>
            {rows.length === 0 && <p className="py-2 text-sm text-sub">比べられるデータがありません。</p>}
            {rows.map((r) => {
              const txs = data.transactions.filter((t) => t.category === r.category);
              const isOpen = open === r.category;
              const w = (Math.abs(r.diff) / max) * 50;
              return (
                <div key={r.category} className="border-t border-line2">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : r.category)}
                    className="grid min-h-11 w-full grid-cols-[92px_minmax(0,1fr)_76px] items-center gap-2 text-left"
                  >
                    <span className="flex items-center gap-0.5 text-sm font-medium">
                      <span className="truncate">{r.category}</span>
                      <ChevronDown size={13} className={`shrink-0 text-sub transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </span>
                    <span className="relative block h-3.5">
                      <span className="absolute -bottom-1 -top-1 left-1/2 w-px bg-[#C9C6BE]" />
                      <span
                        className={`absolute inset-y-0 rounded-sm ${r.diff >= 0 ? "bg-over-fill" : "bg-accent"}`}
                        style={{ width: `${w}%`, ...(r.diff >= 0 ? { left: "50%" } : { right: "50%" }) }}
                      />
                    </span>
                    <span className={`text-right text-[13px] font-bold ${r.diff >= 0 ? "text-over" : "text-accent"}`}>{signed(r.diff)}</span>
                  </button>
                  {isOpen && (
                    <div className="mb-3 flex flex-col gap-2 rounded-[10px] bg-panel px-3 py-2.5">
                      <span className="lbl">
                        {data.month}月 {yen(r.current)} · {mode === "prev" ? "前月" : "例年平均"} {yen(mode === "prev" ? r.prev : r.yearAvg)}
                      </span>
                      {txs.length === 0 && <span className="text-[13px] text-sub">{data.month}月の明細はありません</span>}
                      {txs.map((t, i) => (
                        <div key={i} className="flex justify-between gap-2 text-[13px]">
                          <span className="min-w-0">
                            <span className="text-sub">{t.date.slice(5).replace("-", "/")}</span> {t.itemName || "—"}
                          </span>
                          <span className="shrink-0 font-bold">{yen(t.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </Page>
  );
}
