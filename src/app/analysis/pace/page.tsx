"use client";
import { useEffect, useMemo, useState } from "react";
import AnalysisHeader from "@/components/analysis/AnalysisHeader";
import LineChart, { MonthAxis } from "@/components/charts/LineChart";
import { Card, CardTitle, ErrorBox, Legend, Loading, Page, Segmented, Skeleton, useApi } from "@/components/ui/kit";
import { ChevronDown } from "@/components/ui/icons";
import { num, yen } from "@/lib/format";
import { monthProjection, paceBand, type CategoryBand, type PaceData } from "@/lib/pace";

const STORAGE_KEY = "pace.excludedYears";
const SCOPE_KEY = "pace.scope";

type Scope = "year" | "month";

type Tx = { id: number; date: string; itemName: string | null; expenseAmount: number };

export default function PacePage() {
  const { data, error, loading } = useApi<PaceData>("/api/analysis/pace");
  const [excluded, setExcluded] = useState<number[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [scope, setScopeState] = useState<Scope>("year");

  function setScope(v: Scope) {
    setScopeState(v);
    setOpen(null);
    try {
      localStorage.setItem(SCOPE_KEY, v);
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setExcluded(JSON.parse(saved));
      const sc = localStorage.getItem(SCOPE_KEY);
      if (sc === "year" || sc === "month") setScopeState(sc);
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
  const key = baseYears.join(",");
  const calc = useMemo(() => (data ? paceBand(data, baseYears) : null), [data, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const mcalc = useMemo(() => (data ? monthProjection(data, baseYears) : null), [data, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const categories = scope === "year" ? calc?.categories : mcalc?.categories;

  const exportQuery = data ? `view=pace&scope=${scope}&years=${key}` : null;

  return (
    <Page>
      <AnalysisHeader title="例年比ペース" exportQuery={exportQuery} exportLabel="例年比ペース" />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && calc && mcalc && categories && (
        <>
          <Segmented
            options={[
              { value: "year", label: "年初からの累計" },
              { value: "month", label: `今月（${data.month.month}月）` },
            ]}
            value={scope}
            onChange={setScope}
          />
          {scope === "year" ? (
            <Headline data={data} calc={calc} hasBase={baseYears.length > 0} />
          ) : (
            <MonthHeadline data={data} proj={mcalc} hasBase={baseYears.length > 0} />
          )}

          <Card className="flex flex-col gap-2.5">
            <CardTitle right={<span className="lbl">タップで除外</span>}>比べる年</CardTitle>
            <p className="lbl -mt-1.5">例年の幅＝比べる年の平均 ± 標準偏差（ばらつき）の半分。平均に近い、ふつうの年の範囲です。</p>
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
              const sorted = [...categories].sort((a, b) => b.outside - a.outside || b.current - a.current);
              const outside = sorted.filter((c) => c.outside !== 0);
              const list = showAll ? sorted : outside;
              return (
                <>
                  {outside.length === 0 && !showAll && <p className="py-2 text-sm text-sub">すべて例年の範囲内です。</p>}
                  {list.map((c) => (
                    <CategoryRow
                      key={c.category}
                      year={data.year}
                      month={scope === "month" ? data.month.month : undefined}
                      months={scope === "year" ? data.upToMonth : 1}
                      currentLabel={
                        scope === "month"
                          ? data.month.day >= data.month.daysInMonth
                            ? `${data.month.month}月の支出`
                            : `${data.month.month}月の見込み`
                          : "今年"
                      }
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
  const months = data.upToMonth;

  return (
    <Card className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="lbl">
          1〜{months}月 · {latest} 時点
        </span>
        {hasBase && <Status above={above} below={below} />}
      </div>
      {!hasBase ? (
        <div className="text-lg font-bold">比べる年を選んでください</div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Tile
            label="月あたり"
            diff={(cur - b.avg) / months}
            rows={[
              ["今年", num(cur / months)],
              ["例年", num(b.avg / months)],
            ]}
          />
          <Tile
            label="累計"
            diff={cur - b.avg}
            rows={[
              ["今年", man(cur)],
              ["例年", man(b.avg)],
            ]}
          />
        </div>
      )}
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

/** 1234567 → "123.5万" */
function man(v: number) {
  return `${(v / 10000).toFixed(1)}万`;
}

/** 例年の幅に対する位置 */
function Status({ above, below }: { above: number; below: number }) {
  const [text, cls] =
    above > 0 ? ["範囲より多い", "bg-over-soft text-over"] : below > 0 ? ["範囲より少ない", "bg-accent-soft text-accent"] : ["例年の範囲内", "bg-line2 text-ink2"];
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>{text}</span>;
}

/** 例年平均との差を大きく、今年・例年を内訳に */
function Tile({ label, diff, rows }: { label: string; diff: number; rows: [string, string][] }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-panel p-3">
      <span className="lbl">{label}</span>
      <span className={`text-[22px] font-bold leading-tight ${diff > 0 ? "text-over" : "text-accent"}`}>
        {diff > 0 ? "+" : "−"}¥{num(Math.abs(diff))}
      </span>
      <span className="lbl -mt-0.5">例年平均との差</span>
      <div className="mt-1 flex flex-col gap-0.5 border-t border-line pt-1.5 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-sub">{k}</span>
            <span className="font-bold">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthHeadline({ data, proj, hasBase }: { data: PaceData; proj: ReturnType<typeof monthProjection>; hasBase: boolean }) {
  const m = data.month;
  const done = m.day >= m.daysInMonth;
  const prevMonth = m.month === 1 ? 12 : m.month - 1;
  const above = proj.endCum - proj.endBand.max;
  const below = proj.endBand.min - proj.endCum;
  const gapText = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}¥${num(Math.abs(v))}`;
  const tone = (v: number) => (v > 0 ? "text-over" : "text-accent");

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="lbl">
          {m.month}月末の{done ? "累計（確定）" : "見込み"} · 例年平均との差
        </span>
        {hasBase && <Status above={above} below={below} />}
      </div>
      {!hasBase ? (
        <div className="text-lg font-bold">比べる年を選んでください</div>
      ) : (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5">
            <span className="text-sm text-sub">{m.month === 1 ? "年初" : `${prevMonth}月末`}の累計</span>
            <span className={`text-right text-base font-bold ${tone(proj.startGap)}`}>{gapText(proj.startGap)}</span>
            <span className="text-sm font-bold">
              {m.month}月末{done ? "" : "の見込み"}
            </span>
            <span className={`text-right text-[26px] font-bold leading-tight ${tone(proj.endGap)}`}>{gapText(proj.endGap)}</span>
          </div>
          <div className={`rounded-[10px] px-3 py-2.5 text-sm font-bold ${proj.change > 0 ? "bg-over-soft text-over" : "bg-accent-soft text-accent"}`}>
            {m.month}月で差が ¥{num(Math.abs(proj.change))} {proj.change > 0 ? "広がる" : "縮まる"}
            {done ? "" : "見込み"}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t border-line2 pt-2.5 text-[13px]">
            <span className="text-sub">今月ここまで（{m.month}/{m.day}まで）</span>
            <span className="text-right font-bold">{yen(proj.soFar)}</span>
            {!done && (
              <>
                <span className="text-sub">残りの見込み（例年の平均）</span>
                <span className="text-right">{yen(proj.restAvg)}</span>
              </>
            )}
            <span className="text-sub">{m.month}月の{done ? "支出" : "見込み"}</span>
            <span className="text-right font-bold">{yen(proj.projectedMonth)}</span>
            <span className="text-sub">例年の{m.month}月（平均）</span>
            <span className="text-right">{yen(proj.avgMonth)}</span>
          </div>
        </>
      )}
    </Card>
  );
}

function CategoryRow({
  year,
  month,
  months,
  currentLabel,
  c,
  open,
  onToggle,
}: {
  year: number;
  month?: number;
  /** 何か月分の累計か（1 なら月あたりは出さない） */
  months: number;
  /** 今年の値のラベル（「今年」「10月の見込み」など） */
  currentLabel: string;
  c: CategoryBand;
  open: boolean;
  onToggle: () => void;
}) {
  const [txs, setTxs] = useState<Tx[] | null>(null);
  useEffect(() => {
    if (!open || txs) return;
    fetch(`/api/transactions?year=${year}${month ? `&month=${month}` : ""}&category=${encodeURIComponent(c.category)}&type=支出&sort=amount&limit=10`)
      .then((r) => r.json())
      .then((j) => setTxs(j.data ?? []));
  }, [open, txs, year, month, c.category]);

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
            {months > 1 && (above || below) && (
              <span className="ml-1 font-normal text-sub">（月 {above ? "+" : "−"}{num(Math.abs(c.outside) / months)}）</span>
            )}
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
          {currentLabel} {yen(c.current)} · 例年 {yen(c.min)}〜{num(c.max)}
          {months > 1 && ` · 月平均 今年 ${num(c.current / months)} / 例年 ${num(c.avg / months)}`}
        </div>
      </button>
      {open && (
        <div className="mb-3 flex flex-col gap-2 rounded-[10px] bg-panel px-3 py-2.5">
          <span className="lbl">{year}年{month ? `${month}月` : ""}の明細（金額の大きい順）</span>
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
