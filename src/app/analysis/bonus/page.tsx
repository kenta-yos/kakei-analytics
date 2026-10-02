"use client";
import { useState } from "react";
import AnalysisHeader from "@/components/analysis/AnalysisHeader";
import LineChart, { MonthAxis } from "@/components/charts/LineChart";
import { Card, CardTitle, ErrorBox, Legend, Loading, Page, useApi } from "@/components/ui/kit";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { num, yen } from "@/lib/format";

type YM = { year: number; month: number };
type Usage = { year: number; month: number; bonus: number; used: number; rate: number };
type BonusData = {
  latestDate: string;
  current: YM & { balance: number };
  lastBonus: YM & { allocation: number };
  monthsSince: number;
  usage: Usage | null;
  pastUsage: Usage[];
  plans: (YM & { itemName: string; amount: number })[];
  projection: (YM & { allocation: number; planned: number; balance: number })[];
  series: { year: number; current: (number | null)[]; previous: (number | null)[] };
};

type Draft = { key: number; ym: string; itemName: string; amount: string };

export default function BonusPage() {
  const { data, error, loading, reload } = useApi<BonusData>("/api/analysis/bonus");
  const [draft, setDraft] = useState<Draft[] | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <Page>
      <AnalysisHeader title="特別経費B" exportQuery={data ? "view=bonus" : null} exportLabel="特別経費Bの資金繰り" />
      {error && <ErrorBox message={error} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          <Summary data={data} />
          <BalanceChart data={data} />
          <UsageCard data={data} />
          <Plans
            data={data}
            draft={draft}
            saving={saving}
            onEdit={() =>
              setDraft(
                data.plans.map((p, i) => ({ key: i, ym: `${p.year}-${p.month}`, itemName: p.itemName, amount: num(p.amount) }))
              )
            }
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onCommit={async () => {
              if (!draft) return;
              setSaving(true);
              try {
                // 表示中の6か月分を月ごとに置き換える
                await Promise.all(
                  data.projection.map((h) =>
                    fetch("/api/special-expense", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        year: h.year,
                        month: h.month,
                        items: draft
                          .filter((d) => d.ym === `${h.year}-${h.month}` && d.itemName.trim())
                          .map((d) => ({ itemName: d.itemName.trim(), plannedAmount: parseInt(d.amount.replace(/[^0-9]/g, ""), 10) || 0 })),
                      }),
                    })
                  )
                );
                setDraft(null);
                await reload();
              } finally {
                setSaving(false);
              }
            }}
          />
        </>
      )}
    </Page>
  );
}

function Summary({ data }: { data: BonusData }) {
  const end = data.projection[data.projection.length - 1];
  const lowest = Math.min(...data.projection.map((p) => p.balance));
  return (
    <Card className="grid grid-cols-2 gap-3">
      <div>
        <div className="lbl">いまの残高（{data.current.month}月末）</div>
        <div className={`text-2xl font-bold ${data.current.balance < 0 ? "text-over" : ""}`}>{yen(data.current.balance)}</div>
      </div>
      <div>
        <div className="lbl">
          {end.year !== data.current.year ? `${end.year}年` : ""}
          {end.month}月末（見込み）
        </div>
        <div className={`text-2xl font-bold ${end.balance < 0 ? "text-over" : ""}`}>{yen(end.balance)}</div>
        <div className={`text-xs font-bold ${lowest < 0 ? "text-over" : "text-accent"}`}>
          {lowest < 0 ? "途中でマイナスになる見込み" : "足りる見込み"}
        </div>
      </div>
    </Card>
  );
}

function BalanceChart({ data }: { data: BonusData }) {
  const curIdx = data.current.year === data.series.year ? data.current.month - 1 : -1;
  const projection: (number | null)[] = Array(12).fill(null);
  if (curIdx >= 0) {
    projection[curIdx] = data.current.balance;
    data.projection.filter((p) => p.year === data.series.year).forEach((p) => (projection[p.month - 1] = p.balance));
  }
  const bonusIdx = data.lastBonus.year === data.series.year ? data.lastBonus.month - 1 : null;

  return (
    <Card className="flex flex-col gap-2.5">
      <CardTitle>残高の推移</CardTitle>
      <LineChart
        xCount={12}
        height={160}
        series={[
          { values: data.series.previous, color: "#B9BBBF", width: 1.6 },
          { values: data.series.current, color: "#1F5F8B", width: 2.4, endDot: true },
          { values: projection, color: "#1F5F8B", width: 2.2, dash: "5 4" },
        ]}
        markers={bonusIdx !== null ? [{ index: bonusIdx, label: "賞与" }] : []}
        ariaLabel={`特別経費Bの残高推移。${data.series.year}年と前年`}
      />
      <MonthAxis />
      <Legend
        items={[
          { label: `${data.series.year}年`, swatch: <span className="h-[3px] w-3.5 bg-accent" /> },
          { label: "予定からの見込み", swatch: <span className="w-3.5 border-t-2 border-dashed border-accent" /> },
          { label: `${data.series.year - 1}年`, swatch: <span className="h-0.5 w-3.5 bg-faint" /> },
        ]}
      />
    </Card>
  );
}

function UsageCard({ data }: { data: BonusData }) {
  const u = data.usage;
  if (!u) return null;
  const past = data.pastUsage.slice(0, 4);
  const rates = data.pastUsage.map((p) => p.rate);
  const avg = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
  const pct = (r: number) => Math.round(r * 100);
  const max = Math.max(1, u.rate, ...past.map((p) => p.rate));
  const rows = [{ ...u, now: true }, ...past.map((p) => ({ ...p, now: false }))];

  return (
    <Card className="flex flex-col gap-2.5">
      <CardTitle>使うペース（賞与から{data.monthsSince}か月）</CardTitle>
      <p className="text-[15px] leading-relaxed">
        {u.year}年{u.month}月の賞与で積み増した {yen(u.bonus)} に対し、{yen(u.used)}（
        <b className={avg !== null && u.rate > avg ? "text-over" : "text-accent"}>{pct(u.rate)}%</b>）を使用。
        {avg !== null && (
          <>
            過去の賞与の同じ期間は平均 {pct(avg)}%（{pct(Math.min(...rates))}〜{pct(Math.max(...rates))}%）。
          </>
        )}
      </p>
      {rows.map((r) => (
        <div key={`${r.year}-${r.month}`} className="grid grid-cols-[64px_minmax(0,1fr)_44px] items-center gap-2">
          <span className={`text-[13px] ${r.now ? "font-bold" : "text-sub"}`}>
            {String(r.year).slice(2)}年{r.month}月
          </span>
          <div className="h-2.5 overflow-hidden rounded-[5px] bg-ground">
            <div className={`h-full rounded-[5px] ${r.now ? "bg-over-fill" : "bg-faint"}`} style={{ width: `${(r.rate / max) * 100}%` }} />
          </div>
          <span className={`text-right text-[13px] ${r.now ? "font-bold text-over" : "text-sub"}`}>{pct(r.rate)}%</span>
        </div>
      ))}
    </Card>
  );
}

function Plans({
  data,
  draft,
  saving,
  onEdit,
  onChange,
  onCancel,
  onCommit,
}: {
  data: BonusData;
  draft: Draft[] | null;
  saving: boolean;
  onEdit: () => void;
  onChange: (d: Draft[]) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const months = data.projection.map((p) => ({ ym: `${p.year}-${p.month}`, label: `${p.month}月`, ...p }));
  const total = data.plans.reduce((s, p) => s + p.amount, 0);

  if (draft) {
    const set = (key: number, patch: Partial<Draft>) => onChange(draft.map((d) => (d.key === key ? { ...d, ...patch } : d)));
    return (
      <Card className="flex flex-col gap-2">
        <CardTitle right={<span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">編集中</span>}>
          今後6か月の予定
        </CardTitle>
        {draft.map((d) => (
          <div key={d.key} className="grid grid-cols-[72px_minmax(0,1fr)_96px_40px] items-center gap-1.5">
            <select
              aria-label="月"
              value={d.ym}
              onChange={(e) => set(d.key, { ym: e.target.value })}
              className="h-11 rounded-[10px] border border-field bg-card px-2 text-sm"
            >
              {months.map((m) => (
                <option key={m.ym} value={m.ym}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              aria-label="内容"
              value={d.itemName}
              onChange={(e) => set(d.key, { itemName: e.target.value })}
              className="h-11 min-w-0 rounded-[10px] border border-field px-2.5 text-[15px]"
            />
            <input
              aria-label="金額"
              inputMode="numeric"
              value={d.amount}
              onChange={(e) => set(d.key, { amount: e.target.value })}
              className="h-11 min-w-0 rounded-[10px] border border-field px-2.5 text-right text-[15px] font-bold"
            />
            <button type="button" aria-label="削除" onClick={() => onChange(draft.filter((x) => x.key !== d.key))} className="flex h-11 items-center justify-center text-sub">
              <TrashIcon size={18} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => onChange([...draft, { key: Date.now(), ym: months[0].ym, itemName: "", amount: "" }])}
        >
          <PlusIcon size={18} />
          予定を追加
        </button>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button type="button" className="btn-ghost h-12" onClick={onCancel} disabled={saving}>
            キャンセル
          </button>
          <button type="button" className="btn-primary h-12" onClick={onCommit} disabled={saving}>
            {saving ? "保存中…" : "確定"}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col py-3">
      <CardTitle
        right={
          <button type="button" className="btn-small" onClick={onEdit}>
            <PencilIcon size={16} />
            予定を編集
          </button>
        }
      >
        今後6か月の予定
      </CardTitle>
      {months.map((m) => {
        const items = data.plans.filter((p) => p.year === m.year && p.month === m.month);
        return (
          <div key={m.ym} className="border-t border-line2 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold">
                {m.year !== data.current.year ? `${m.year}年` : ""}
                {m.label}
              </span>
              <span className="lbl">
                配分 {num(m.allocation)} − 予定 {num(m.planned)} → 残高 {yen(m.balance)}
              </span>
            </div>
            {items.length === 0 && <div className="py-1 text-[13px] text-mute">予定なし</div>}
            {items.map((p, i) => (
              <div key={i} className="flex justify-between py-1 text-sm">
                <span>{p.itemName}</span>
                <span className="font-bold">{yen(p.amount)}</span>
              </div>
            ))}
          </div>
        );
      })}
      <div className="flex justify-between border-t border-[#C9C6BE] pt-3 text-sm font-bold">
        <span>予定の合計</span>
        <span>{yen(total)}</span>
      </div>
    </Card>
  );
}
