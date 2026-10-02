"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import LineChart from "@/components/charts/LineChart";
import { Card, CardTitle, ErrorBox, Legend, Loading, Page, PageTitle, Segmented, useApi } from "@/components/ui/kit";
import { ChevronDown } from "@/components/ui/icons";
import { signed, yen } from "@/lib/format";

type Mode = "month" | "quarter" | "year";

type Period = {
  label: string;
  shortLabel: string;
  partial: boolean;
  valuationMissing: boolean;
  income: number;
  expense: number;
  operating: number;
  investGain: number;
  total: number;
  netAssets: number | null;
  change: number | null;
  other: number | null;
  breakdown: { type: string; label: string; value: number; change: number; accounts: { name: string; value: number; change: number }[] }[];
};

type KessanData = {
  latestValuation: { year: number; month: number } | null;
  periods: Period[];
};

const MODES = [
  { value: "month" as const, label: "月次" },
  { value: "quarter" as const, label: "四半期" },
  { value: "year" as const, label: "年次" },
];

export default function KessanPage() {
  const [mode, setMode] = useState<Mode>("month");
  const { data, error, loading } = useApi<KessanData>(`/api/kessan?mode=${mode}`);
  const [sel, setSel] = useState<number | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => setSel(null), [mode]);

  const periods = data?.periods ?? [];
  const idx = sel ?? periods.length - 1;
  const p = periods[idx];

  return (
    <Page>
      <PageTitle kicker="決算" title="資産と損益" />
      <Segmented options={MODES} value={mode} onChange={setMode} />

      {error && <ErrorBox message={error} />}
      {loading && !p && <Loading />}

      {p && (
        <>
          <Card className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold">純資産（BS）</h2>
              <span className="lbl">
                {p.label}
                {p.partial ? "（途中）" : ""}末
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2.5">
              <span className="text-[30px] font-bold">{p.netAssets === null ? "—" : yen(p.netAssets)}</span>
              {p.change !== null && (
                <span className={`text-sm font-bold ${p.change >= 0 ? "text-accent" : "text-over"}`}>{signed(p.change)}</span>
              )}
            </div>
            <LineChart
              xCount={periods.length}
              height={150}
              series={[{ values: periods.map((x) => x.netAssets), color: "#1F5F8B", area: true, endDot: true }]}
              markers={sel !== null ? [{ index: idx, label: p.shortLabel }] : []}
              onSelect={setSel}
              selected={idx}
              pointLabels={periods.map((x) => x.label)}
              ariaLabel={`純資産の推移。${periods[0]?.label}から${periods[periods.length - 1]?.label}まで`}
              yMin={Math.min(...periods.map((x) => x.netAssets ?? Infinity)) * 0.95}
            />
            <div className="flex justify-between text-xs text-sub">
              <span>{periods[0]?.label}</span>
              <span className="text-mute">タップで期間を選択</span>
              <span>{periods[periods.length - 1]?.label}</span>
            </div>
            <div className="flex flex-col border-t border-line2">
              {p.breakdown.map((b) => {
                const isOpen = openGroup === b.type;
                return (
                  <div key={b.type} className="border-b border-line2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setOpenGroup(isOpen ? null : b.type)}
                      className="flex min-h-11 w-full items-center justify-between gap-2 py-2.5 text-left"
                    >
                      <span className="flex items-center gap-1 text-sm">
                        {b.label}
                        <ChevronDown size={14} className={`text-sub transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                      <span className="text-right">
                        <span className="text-sm font-bold">{yen(b.value)}</span>
                        <span className={`ml-1.5 text-xs font-medium ${b.change >= 0 ? "text-accent" : "text-over"}`}>{signed(b.change)}</span>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="mb-2.5 flex flex-col gap-1.5 rounded-[10px] bg-panel px-3 py-2.5">
                        {b.accounts.map((a) => (
                          <div key={a.name} className="flex items-baseline justify-between gap-2 text-[13px]">
                            <span className="min-w-0">{a.name}</span>
                            <span className="shrink-0 text-right">
                              <span className="font-bold">{yen(a.value)}</span>
                              <span className={`ml-1.5 text-xs ${a.change === 0 ? "text-mute" : a.change > 0 ? "text-accent" : "text-over"}`}>{signed(a.change)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {p.valuationMissing && (
            <div className="card flex items-center justify-between gap-3 border-over-fill bg-over-soft p-4 text-[13px] leading-relaxed text-ink2">
              <span>
                {p.label}の投資の評価額が未入力です。投資の残高は
                {data?.latestValuation ? `${data.latestValuation.month}月末` : "前回"}
                の値のままで、運用損益も入っていません。
              </span>
              <Link href="/valuation" className="btn-small shrink-0">
                入力する
              </Link>
            </div>
          )}

          {p.change !== null && (
            <Card>
              <CardTitle>
                {p.label}に純資産が{p.change >= 0 ? "増えた" : "減った"}理由
              </CardTitle>
              <Drivers
                items={[
                  { name: "家計の収支", value: p.operating, color: "#1F5F8B" },
                  { name: "投資の運用損益", value: p.investGain, color: "#8FB8D8" },
                  { name: "その他の調整", value: p.other ?? 0, color: "#B9BBBF" },
                ]}
              />
              <p className="lbl mt-3 leading-relaxed">その他の調整＝純資産の増減のうち、収支と運用損益で説明できない分（評価額の未入力、口座残高の補正など）</p>
            </Card>
          )}

          <Card className="flex flex-col gap-3">
            <CardTitle right={<span className="lbl">タップで期間を選択</span>}>損益の推移（PL）</CardTitle>
            <Legend
              items={[
                { label: "家計の収支", swatch: <span className="h-2.5 w-2.5 rounded-sm bg-accent" /> },
                { label: "投資の運用損益", swatch: <span className="h-2.5 w-2.5 rounded-sm bg-invest" /> },
              ]}
            />
            <PlBars periods={periods} selected={idx} onSelect={setSel} />
            <div className="flex flex-col border-t border-line2">
              <PlRow name="収入" value={yen(p.income)} />
              <PlRow name="支出" value={yen(p.expense)} />
              <PlRow name="家計の収支" value={signed(p.operating)} tone={p.operating} />
              <PlRow name="投資の運用損益" value={signed(p.investGain)} tone={p.investGain} />
              <PlRow name={`総合損益（${p.label}）`} value={signed(p.total)} tone={p.total} bold />
            </div>
          </Card>
        </>
      )}
    </Page>
  );
}

function Drivers({ items }: { items: { name: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i) => (
        <div key={i.name} className="grid grid-cols-[104px_minmax(0,1fr)_84px] items-center gap-2">
          <span className="text-[13px]">{i.name}</span>
          <div className="relative h-3.5 rounded-sm bg-ground">
            <div className="absolute inset-y-0 left-1/2 w-px bg-[#C9C6BE]" />
            <div
              className="absolute inset-y-0 rounded-sm"
              style={{
                background: i.color,
                width: `${(Math.abs(i.value) / max) * 50}%`,
                ...(i.value >= 0 ? { left: "50%" } : { right: "50%" }),
              }}
            />
          </div>
          <span className={`text-right text-[13px] font-bold ${i.value >= 0 ? "text-accent" : "text-over"}`}>{signed(i.value)}</span>
        </div>
      ))}
    </div>
  );
}

function PlBars({ periods, selected, onSelect }: { periods: Period[]; selected: number; onSelect: (i: number) => void }) {
  const max = Math.max(1, ...periods.flatMap((p) => [Math.abs(p.operating), Math.abs(p.investGain)]));
  const posH = 70;
  const negMax = Math.max(0, ...periods.flatMap((p) => [-p.operating, -p.investGain]));
  const negH = negMax > 0 ? Math.max(18, Math.round((negMax / max) * posH)) : 12;
  const h = (v: number, up: boolean) => (up ? (v > 0 ? (v / max) * posH : 0) : v < 0 ? (-v / max) * posH : 0);

  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${periods.length}, minmax(0, 1fr))` }}>
      {periods.map((p, i) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`${p.label}を選択`}
          aria-pressed={i === selected}
          className={`flex flex-col rounded-md py-1 ${i === selected ? "bg-accent-soft" : ""}`}
        >
          <div className="flex items-end justify-center gap-px border-b border-[#C9C6BE]" style={{ height: posH }}>
            <div className="w-[38%] rounded-t-sm bg-accent" style={{ height: h(p.operating, true) }} />
            <div className="w-[38%] rounded-t-sm bg-invest" style={{ height: h(p.investGain, true) }} />
          </div>
          <div className="flex items-start justify-center gap-px" style={{ height: negH }}>
            <div className="w-[38%] rounded-b-sm bg-accent" style={{ height: Math.min(negH, h(p.operating, false)) }} />
            <div className="w-[38%] rounded-b-sm bg-invest" style={{ height: Math.min(negH, h(p.investGain, false)) }} />
          </div>
          <span className={`text-center text-[10px] ${i === selected ? "font-bold text-ink" : "text-sub"}`}>{p.shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

function PlRow({ name, value, tone, bold }: { name: string; value: string; tone?: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between border-b border-line2 py-2.5 text-sm ${bold ? "font-bold" : ""}`}>
      <span>{name}</span>
      <span className={`font-bold ${tone === undefined ? "" : tone >= 0 ? "text-accent" : "text-over"}`}>{value}</span>
    </div>
  );
}
