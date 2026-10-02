"use client";
import Link from "next/link";
import { Bar, Card, ErrorBox, Loading, MonthNav, Page, useApi } from "@/components/ui/kit";
import { ChevronRight, SettingsIcon, TrendIcon, UploadIcon } from "@/components/ui/icons";
import { nextMonth, num, prevMonth, signed, yen } from "@/lib/format";

type HomeData = {
  year: number;
  month: number;
  latestDate: string | null;
  latestValuation: { year: number; month: number } | null;
  asOfDay: number;
  elapsedRatio: number;
  income: number;
  expense: number;
  rows: { category: string; budget: number; actual: number; remaining: number }[];
  closing: { year: number; month: number; hasBudget: boolean; capMonth: { year: number; month: number }; cap: number; due: boolean };
};

export default function HomeView({ year, month }: { year?: number; month?: number }) {
  const q = year && month ? `?year=${year}&month=${month}` : "";
  const { data, error, loading } = useApi<HomeData>(`/api/home${q}`);

  if (error) return <Page><ErrorBox message={error} /></Page>;
  if (loading && !data) return <Page><Loading /></Page>;
  if (!data) return null;

  const p = prevMonth(data.year, data.month);
  const n = nextMonth(data.year, data.month);
  const net = data.income - data.expense;
  const overs = data.rows.filter((r) => r.remaining < 0);
  const rows = data.rows;
  const latest = data.latestDate ? data.latestDate.slice(5).replace("-", "/").replace(/^0/, "") : "—";
  const noData = data.asOfDay === 0;
  const isPartial = !noData && data.elapsedRatio < 1;
  const c = data.closing;

  return (
    <Page wide>
      <div className="flex items-end justify-between">
        <div>
          <div className="lbl">ホーム</div>
          <MonthNav
            label={`${data.year}年${data.month}月`}
            prevHref={`/?year=${p.year}&month=${p.month}`}
            nextHref={`/?year=${n.year}&month=${n.month}`}
          />
        </div>
        <Link
          href="/settings"
          aria-label="設定（標準予算）"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-card lg:hidden"
        >
          <SettingsIcon size={20} />
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">データ</h2>
              <span className="lbl">
                CSV {latest} · 評価額 {data.latestValuation ? `${data.latestValuation.month}月末` : "未入力"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/import" className="btn-ghost">
                <UploadIcon size={18} />
                CSVを取り込む
              </Link>
              <Link href="/valuation" className="btn-ghost">
                <TrendIcon size={18} />
                評価額を入力
              </Link>
            </div>
          </Card>

          <div className="grid grid-cols-3 gap-2">
            <Kpi label="収入" value={num(data.income)} />
            <Kpi label="支出" value={num(data.expense)} />
            <Kpi label="収支" value={signed(net)} tone={net >= 0 ? "pos" : "neg"} />
          </div>

          <Card className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold">{data.month}月の予算と実績</h2>
                <span className="lbl">
                  {noData
                    ? `${data.month}月のデータはまだありません（最終取込 ${latest}）`
                    : isPartial
                      ? `${data.month}/${data.asOfDay} 時点 · 月の ${Math.round(data.elapsedRatio * 100)}% が経過`
                      : `超過 ${overs.length}件`}
                </span>
              </div>
              <Link href={`/budget?year=${data.year}&month=${data.month}`} className="btn-small">
                予算を修正
              </Link>
            </div>
            {rows.length === 0 && <p className="text-sm text-sub">この月の予算はまだありません。</p>}
            {rows.map((r) => {
              const over = r.remaining < 0;
              const ratio = r.budget > 0 ? r.actual / r.budget : r.actual > 0 ? 1 : 0;
              return (
                <div key={r.category} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{r.category}</span>
                    <span className={`text-[13px] font-bold ${over ? "text-over" : ""}`}>
                      {over ? `${num(-r.remaining)} 超過` : `残り ${num(r.remaining)}`}
                    </span>
                  </div>
                  <Bar ratio={ratio} over={over} marker={isPartial ? data.elapsedRatio : undefined} />
                  <div className="lbl">
                    実績 {yen(r.actual)} / 予算 {yen(r.budget)}
                  </div>
                </div>
              );
            })}
            {overs.length > 0 && (
              <Link
                href={`/analysis/why?year=${data.year}&month=${data.month}`}
                className="flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent"
              >
                {overs.slice(0, 2).map((o) => o.category).join("・")}が多い理由を見る
                <ChevronRight size={16} />
              </Link>
            )}
          </Card>
        </div>

        <Card className={`flex flex-col gap-2.5 ${c.due && !c.hasBudget ? "border-accent" : ""}`}>
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-bold">月末の締め</h2>
            <span className="lbl">{c.hasBudget ? "配分済み" : "未配分"}</span>
          </div>
          {c.due ? (
            <>
              <p className="text-[13px] leading-relaxed text-ink2">
                {c.capMonth.month}月の収入 {yen(c.cap)} を上限に、{c.month}月の予算を配分します。
                {c.hasBudget && `${c.month}月の予算はすでに保存されています。`}
              </p>
              <Link href={`/budget?year=${c.year}&month=${c.month}`} className={c.hasBudget ? "btn-ghost h-[52px]" : "btn-primary"}>
                {c.hasBudget ? `${c.month}月の予算を見る・修正する` : `${c.month}月の予算を配分する`}
              </Link>
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-ink2">
              {c.capMonth.month}月末に、{c.capMonth.month}月の収入を上限として{c.month}月の予算を配分します。
            </p>
          )}
        </Card>
      </div>
    </Page>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="card p-3">
      <div className="lbl">{label}</div>
      <div className={`mt-1 text-[17px] font-bold ${tone === "pos" ? "text-accent" : tone === "neg" ? "text-over" : ""}`}>
        {value}
      </div>
    </div>
  );
}
