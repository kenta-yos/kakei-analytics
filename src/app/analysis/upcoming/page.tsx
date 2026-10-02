"use client";
import { useState } from "react";
import AnalysisHeader from "@/components/analysis/AnalysisHeader";
import { Card, ErrorBox, Legend, Loading, Page, useApi } from "@/components/ui/kit";
import { ChevronDown } from "@/components/ui/icons";
import { num, yen } from "@/lib/format";

type Item = {
  category: string;
  itemName: string;
  amount: number;
  cycle: string;
  months: number[];
  next: { year: number; month: number } | null;
  fund: "B" | "normal";
  history: { date: string; amount: number }[];
};

type UpcomingData = {
  fromYear: number;
  items: Item[];
  forecast: { year: number; month: number; bonus: number; normal: number }[];
};

export default function UpcomingPage() {
  const { data, error, loading } = useApi<UpcomingData>("/api/analysis/upcoming");
  const [open, setOpen] = useState<string | null>(null);

  const bonusTotal = data?.forecast.reduce((s, f) => s + f.bonus, 0) ?? 0;
  const normalTotal = data?.forecast.reduce((s, f) => s + f.normal, 0) ?? 0;
  const max = Math.max(1, ...(data?.forecast.map((f) => f.bonus + f.normal) ?? [1]));

  return (
    <Page>
      <AnalysisHeader title="大きな支出の見通し" exportQuery={data ? "view=upcoming" : null} exportLabel="大きな支出の見通し" />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <Card className="flex flex-col gap-3">
            <div>
              <span className="lbl">今後12か月の見込み（{data.fromYear}年以降の実績から検出）</span>
              <div className="text-2xl font-bold">{yen(bonusTotal + normalTotal)}</div>
              <span className="lbl">
                うち特別経費B {yen(bonusTotal)} · 通常の予算 {yen(normalTotal)}
              </span>
            </div>
            <div className="grid h-[100px] grid-cols-12 items-end gap-1 border-b border-[#C9C6BE]">
              {data.forecast.map((f) => (
                <div key={`${f.year}-${f.month}`} className="flex h-full flex-col justify-end" title={`${f.month}月 ${yen(f.bonus + f.normal)}`}>
                  <div className="rounded-t-sm bg-faint" style={{ height: (f.normal / max) * 96 }} />
                  <div className={`bg-accent ${f.normal ? "" : "rounded-t-sm"}`} style={{ height: (f.bonus / max) * 96 }} />
                </div>
              ))}
            </div>
            <div className="-mt-1.5 grid grid-cols-12 gap-1">
              {data.forecast.map((f) => (
                <span key={`${f.year}-${f.month}`} className="text-center text-[10px] text-sub">
                  {f.month}
                </span>
              ))}
            </div>
            <Legend
              items={[
                { label: "特別経費B", swatch: <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> },
                { label: "通常の予算", swatch: <span className="h-2.5 w-2.5 rounded-sm bg-faint" /> },
              ]}
            />
          </Card>

          <Card className="flex flex-col px-4 py-2">
            {data.items.length === 0 && <p className="py-3 text-sm text-sub">該当する支出は見つかりませんでした。</p>}
            {data.items.map((it, i) => {
              const key = `${it.category}:${it.itemName}`;
              const isOpen = open === key;
              return (
                <div key={key} className={i > 0 ? "border-t border-line2" : ""}>
                  <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-center gap-3 py-3 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-medium">{it.itemName}</span>
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            it.fund === "B" ? "bg-accent-soft text-accent" : "bg-line2 text-ink2"
                          }`}
                        >
                          {it.fund === "B" ? "特別経費B" : it.category}
                        </span>
                      </div>
                      <div className="lbl mt-0.5">
                        {it.cycle}（{it.months.map((m) => `${m}月`).join("・")}）· 次回 {it.next ? `${it.next.year !== data.forecast[0].year ? `${it.next.year}年` : ""}${it.next.month}月` : "—"}
                      </div>
                    </div>
                    <span className="text-[15px] font-bold">{yen(it.amount)}</span>
                    <ChevronDown size={14} className={`shrink-0 text-sub transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="mb-3 flex flex-col gap-1.5 rounded-[10px] bg-panel px-3 py-2.5">
                      <span className="lbl">過去の実績</span>
                      {it.history.map((h, j) => (
                        <div key={j} className="flex justify-between text-[13px]">
                          <span className="text-sub">{h.date.replaceAll("-", "/")}</span>
                          <span className="font-bold">{num(h.amount)}</span>
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
