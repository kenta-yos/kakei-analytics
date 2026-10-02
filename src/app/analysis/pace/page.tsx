"use client";
import { useEffect, useMemo, useState } from "react";
import AnalysisHeader from "@/components/analysis/AnalysisHeader";
import LineChart, { MonthAxis } from "@/components/charts/LineChart";
import { Card, CardTitle, ErrorBox, Legend, Loading, Page, Skeleton, useApi } from "@/components/ui/kit";
import { ChevronDown } from "@/components/ui/icons";
import { num, yen } from "@/lib/format";
import { paceBand, type PaceData } from "@/lib/pace";

const STORAGE_KEY = "pace.excludedYears";

type Tx = { id: number; date: string; itemName: string | null; expenseAmount: number };

export default function PacePage() {
  const { data, error, loading } = useApi<PaceData>("/api/analysis/pace");
  const [excluded, setExcluded] = useState<number[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setExcluded(JSON.parse(saved));
    } catch {
      /* 保存できない環境では毎回すべての年を使う */
    }
  }, []);

  function toggleYear(y: number) {
    setExcluded((ex) => {
      const next = ex.includes(y) ? ex.filter((v) => v !== y) : [...ex, y];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }

  // 比べる年の候補は直近5年
  const candidates = useMemo(
    () => (data ? data.years.map((y) => y.year).filter((y) => y < data.year).slice(-5) : []),
    [data]
  );
  const baseYears = candidates.filter((y) => !excluded.includes(y));
  const calc = useMemo(() => (data ? paceBand(data, baseYears) : null), [data, baseYears.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportQuery = data ? `view=pace&years=${baseYears.join(",")}` : null;

  return (
    <Page>
      <AnalysisHeader title="例年比ペース" exportQuery={exportQuery} exportLabel="例年比ペース" />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && calc && (
        <>
          <Headline data={data} calc={calc} hasBase={baseYears.length > 0} />

          <Card className="flex flex-col gap-2.5">
            <CardTitle right={<span className="lbl">タップで除外</span>}>比べる年</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              {candidates.map((y) => {
                const ex = excluded.includes(y);
                return (
                  <button
                    key={y}
                    type="button"
                    aria-pressed={!ex}
                    onClick={() => toggleYear(y)}
                    className={`h-11 rounded-[10px] border px-3 text-[13px] ${
                      ex ? "border-dashed border-field bg-ground text-mute line-through" : "border-accent bg-accent-soft font-bold text-accent"
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="flex flex-col gap-1">
            <CardTitle>例年の幅から外れたカテゴリ</CardTitle>
            {(() => {
              const sorted = [...calc.categories].sort((a, b) => b.outside - a.outside || b.current - a.current);
              const outside = sorted.filter((c) => c.outside !== 0);
              const list = showAll ? sorted : outside;
              return (
                <>
                  {outside.length === 0 && !showAll && <p className="py-2 text-sm text-sub">すべて例年の範囲内です。</p>}
                  {list.map((c) => (
                    <CategoryRow
                      key={c.category}
                      year={data.year}
                      c={c}
                      open={open === c.category}
                      onToggle={() => setOpen(open === c.category ? null : c.category)}
                    />
                  ))}
                  <button type="button" className="min-h-11 border-t border-line2 text-[13px] text-accent" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? "外れたカテゴリだけ表示" : "すべてのカテゴリを表示"}
                  </button>
                </>
              );
            })()}
          </Card>
        </>
      )}
    </Page>
  );
}

function Headline({ data, calc, hasBase }: { data: PaceData; calc: ReturnType<typeof paceBand>; hasBase: boolean }) {
  const cur = calc.currentCum[calc.currentCum.length - 1] ?? 0;
  const b = calc.band[data.upToMonth - 1];
  const above = cur - b.max;
  const below = b.min - cur;
  const latest = data.latestDate.slice(5).replace("-", "/").replace(/^0/, "");

  return (
    <Card className="flex flex-col gap-2.5">
      <span className="lbl">
        1〜{data.upToMonth}月の支出累計（{latest} 時点）
      </span>
      {!hasBase ? (
        <div className="text-lg font-bold">比べる年を選んでください</div>
      ) : (
        <div className="text-lg font-bold leading-normal">
          {above > 0 ? (
            <>
              例年の範囲を <span className="text-over">{yen(above)} 上回る</span>ペース
            </>
          ) : below > 0 ? (
            <>
              例年の範囲を <span className="text-accent">{yen(below)} 下回る</span>ペース
            </>
          ) : (
            <>例年の範囲内のペース（平均より {cur >= b.avg ? "+" : "−"}{num(Math.abs(cur - b.avg))}）</>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div>
          <div className="lbl">今年</div>
          <div className="text-base font-bold">{yen(cur)}</div>
        </div>
        <div>
          <div className="lbl">例年（平均 / 幅）</div>
          <div className="text-base font-bold">{yen(b.avg)}</div>
          <div className="lbl">
            {yen(b.min)}〜{num(b.max)}
          </div>
        </div>
      </div>
      <LineChart
        xCount={12}
        height={180}
        band={hasBase ? { min: calc.band.map((x) => x.min), max: calc.band.map((x) => x.max) } : undefined}
        series={[
          ...(hasBase ? [{ values: calc.band.map((x) => x.avg), color: "#8A8D93", width: 1.5, dash: "4 3" }] : []),
          { values: calc.currentCum, color: "#C8661C", width: 2.4, endDot: true },
        ]}
        ariaLabel="月別の支出累計。今年の線と、例年の幅・平均"
      />
      <MonthAxis />
      <Legend
        items={[
          { label: `${data.year}年`, swatch: <span className="h-[3px] w-3.5 bg-over-fill" /> },
          { label: "例年の幅", swatch: <span className="h-2.5 w-3.5 bg-band opacity-30" /> },
          { label: "例年平均", swatch: <span className="w-3.5 border-t-[1.5px] border-dashed border-band" /> },
        ]}
      />
    </Card>
  );
}

function CategoryRow({
  year,
  c,
  open,
  onToggle,
}: {
  year: number;
  c: ReturnType<typeof paceBand>["categories"][number];
  open: boolean;
  onToggle: () => void;
}) {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  useEffect(() => {
    if (!open || txs) return;
    fetch(`/api/transactions?year=${year}&category=${encodeURIComponent(c.category)}&type=支出&sort=amount&limit=10`)
      .then((r) => r.json())
      .then((j) => setTxs(j.data ?? []));
  }, [open, txs, year, c.category]);

  const scale = Math.max(c.current, c.max, 1) * 1.15;
  const pos = (v: number) => (v / scale) * 100;
  const above = c.outside > 0;
  const below = c.outside < 0;

  return (
    <div className="border-t border-line2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-col gap-2 py-3 text-left">
        <div className="flex w-full items-baseline justify-between">
          <span className="flex items-center gap-1 text-[15px] font-medium">
            {c.category}
            <ChevronDown size={14} className={`text-sub transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
          <span className={`text-[13px] font-bold ${above ? "text-over" : below ? "text-accent" : "text-sub"}`}>
            {above ? `幅より +${num(c.outside)}` : below ? `幅より −${num(-c.outside)}` : "範囲内"}
          </span>
        </div>
        <div className="relative h-4 w-full">
          <div className="absolute inset-x-0 top-[7px] h-0.5 bg-line2" />
          <div
            className="absolute top-[3px] h-2.5 rounded-sm bg-band opacity-30"
            style={{ left: `${pos(c.min)}%`, width: `${pos(c.max) - pos(c.min)}%` }}
          />
          <div
            className={`absolute top-px -ml-[7px] h-3.5 w-3.5 rounded-full border-2 border-white ${above ? "bg-over-fill" : "bg-accent"}`}
            style={{ left: `${pos(c.current)}%` }}
          />
        </div>
        <div className="lbl">
          今年 {yen(c.current)} · 例年 {yen(c.min)}〜{num(c.max)}
        </div>
      </button>
      {open && (
        <div className="mb-3 flex flex-col gap-2 rounded-[10px] bg-panel px-3 py-2.5">
          <span className="lbl">{year}年の明細（金額の大きい順）</span>
          {!txs && (
            <div className="flex flex-col gap-2" role="status" aria-label="読み込み中">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          )}
          {txs?.length === 0 && <span className="text-[13px] text-sub">明細はありません</span>}
          {txs?.map((t) => (
            <div key={t.id} className="flex justify-between gap-2 text-[13px]">
              <span className="min-w-0">
                <span className="text-sub">{t.date.slice(5).replace("-", "/")}</span> {t.itemName || "—"}
              </span>
              <span className="shrink-0 font-bold">{yen(t.expenseAmount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
