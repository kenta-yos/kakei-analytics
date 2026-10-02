"use client";
import { useState } from "react";
import { Card, CardTitle, ErrorBox, Loading, Page, PageTitle, useApi } from "@/components/ui/kit";
import { PencilIcon } from "@/components/ui/icons";
import { num, yen } from "@/lib/format";

type Settings = {
  currentAge: number;
  expectedReturnRate: number; // 500 = 5.00%
  inflationRate: number;
  fireMultiplier: number;
  monthlyExpenseOverride: number | null;
  monthlySavingsOverride: number | null;
};
type FireData = {
  settings: Settings;
  currentState: { netAssets: number; monthlyExpenseAuto: number; monthlySavingsAuto: number };
};

type Values = {
  annualExpense: number;
  monthlySavings: number;
  returnRate: number; // %
  inflation: number; // %
  withdrawal: number; // %
  age: number;
};

function toValues(d: FireData): Values {
  const s = d.settings;
  return {
    annualExpense: (s.monthlyExpenseOverride ?? d.currentState.monthlyExpenseAuto) * 12,
    monthlySavings: s.monthlySavingsOverride ?? d.currentState.monthlySavingsAuto,
    returnRate: s.expectedReturnRate / 100,
    inflation: s.inflationRate / 100,
    withdrawal: Math.round((100 / s.fireMultiplier) * 100) / 100,
    age: s.currentAge,
  };
}

/** 実質利回り（利回り − インフレ率）で毎月積み立てたときに目標へ届くまでの月数 */
function simulate(net: number, v: Values) {
  const target = v.withdrawal > 0 ? v.annualExpense / (v.withdrawal / 100) : Infinity;
  const r = (v.returnRate - v.inflation) / 100 / 12;
  let a = net;
  let m = 0;
  while (a < target && m < 12 * 60) {
    a = a * (1 + r) + v.monthlySavings;
    m++;
  }
  return { target, months: a >= target ? m : null };
}

const FIELDS: { key: keyof Values; name: string; unit: "円" | "%" | "歳"; auto?: "expense" | "savings" }[] = [
  { key: "annualExpense", name: "年間支出", unit: "円", auto: "expense" },
  { key: "monthlySavings", name: "毎月の積立額", unit: "円", auto: "savings" },
  { key: "returnRate", name: "想定利回り（年）", unit: "%" },
  { key: "inflation", name: "インフレ率（年）", unit: "%" },
  { key: "withdrawal", name: "取り崩し率", unit: "%" },
  { key: "age", name: "現在の年齢", unit: "歳" },
];

export default function FirePage() {
  const { data, error, loading, reload } = useApi<FireData>("/api/fire");
  const [draft, setDraft] = useState<Record<keyof Values, string> | null>(null);
  const [saving, setSaving] = useState(false);

  if (error) return <Page><ErrorBox message={error} /></Page>;
  if (loading && !data) return <Page><Loading /></Page>;
  if (!data) return null;

  const v = toValues(data);
  const autoExpense = data.currentState.monthlyExpenseAuto * 12;
  const autoSavings = data.currentState.monthlySavingsAuto;
  const { target, months } = simulate(data.currentState.netAssets, v);
  const progress = Number.isFinite(target) && target > 0 ? Math.min(1, data.currentState.netAssets / target) : 0;
  const thisYear = new Date().getFullYear();

  const show = (key: keyof Values) => {
    const unit = FIELDS.find((f) => f.key === key)!.unit;
    return unit === "円" ? yen(v[key]) : `${v[key]}${unit}`;
  };
  const source = (f: (typeof FIELDS)[number]) => {
    if (f.auto === "expense") return data.settings.monthlyExpenseOverride === null ? "直近12か月の実績から" : "手入力で上書き中";
    if (f.auto === "savings") return data.settings.monthlySavingsOverride === null ? "直近12か月の収入−支出の平均" : "手入力で上書き中";
    return "手入力";
  };

  function startEdit() {
    const d = {} as Record<keyof Values, string>;
    FIELDS.forEach((f) => (d[f.key] = f.unit === "円" ? num(v[f.key]) : String(v[f.key])));
    setDraft(d);
  }

  async function commit() {
    if (!draft) return;
    const parse = (k: keyof Values) => parseFloat(draft[k].replace(/[^0-9.\-]/g, "")) || 0;
    const annual = Math.round(parse("annualExpense"));
    const savings = Math.round(parse("monthlySavings"));
    const withdrawal = parse("withdrawal");
    setSaving(true);
    try {
      await fetch("/api/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentAge: Math.round(parse("age")),
          expectedReturnRate: Math.round(parse("returnRate") * 100),
          inflationRate: Math.round(parse("inflation") * 100),
          fireMultiplier: withdrawal > 0 ? Math.max(1, Math.round(100 / withdrawal)) : 25,
          monthlyExpenseOverride: annual === autoExpense ? null : Math.round(annual / 12),
          monthlySavingsOverride: savings === autoSavings ? null : savings,
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
      <PageTitle kicker="FIRE試算" title="いつ自由になれるか" />
      <Card className="flex flex-col gap-1.5 py-5">
        <span className="lbl">いまのペースでの到達見込み</span>
        <span className="text-[34px] font-bold">{months === null ? "60年以上先" : `${thisYear + Math.ceil(months / 12)}年`}</span>
        <span className="text-[13px] text-sub">
          {months === null ? "前提を見直してください" : `あと ${(months / 12).toFixed(1)} 年（${v.age + Math.ceil(months / 12)}歳）`} · 目標資産{" "}
          {Number.isFinite(target) ? yen(target) : "—"}
        </span>
        <div className="mt-2 h-2.5 overflow-hidden rounded-[5px] bg-line2">
          <div className="h-full rounded-[5px] bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="lbl">
          現在の純資産 {yen(data.currentState.netAssets)}（{Math.round(progress * 100)}%）
        </span>
      </Card>

      <Card className="px-4 pb-3 pt-1">
        <div className="flex items-center justify-between py-2">
          <h2 className="text-sm font-bold">前提条件</h2>
          {draft ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent">編集中</span>
          ) : (
            <button type="button" className="btn-small" onClick={startEdit}>
              <PencilIcon size={16} />
              編集
            </button>
          )}
        </div>

        {FIELDS.map((f) => (
          <div key={f.key} className="flex min-h-14 items-center justify-between gap-3 border-t border-line2 py-2">
            <div className="min-w-0">
              <label htmlFor={`fire-${f.key}`} className="block text-sm">
                {f.name}
              </label>
              <span className="lbl">{source(f)}</span>
              {draft && f.auto && (
                <button
                  type="button"
                  className="block min-h-6 text-xs text-accent"
                  onClick={() => setDraft({ ...draft, [f.key]: num(f.auto === "expense" ? autoExpense : autoSavings) })}
                >
                  実績の値に戻す
                </button>
              )}
            </div>
            {draft ? (
              <div className="flex items-center gap-1.5">
                <input
                  id={`fire-${f.key}`}
                  inputMode="decimal"
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className="h-11 w-[132px] rounded-[10px] border border-field px-2.5 text-right text-base font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent"
                />
                <span className="w-4 text-[13px] text-sub">{f.unit === "円" ? "円" : f.unit}</span>
              </div>
            ) : (
              <span className="text-base font-bold">{show(f.key)}</span>
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

        <div className="mt-1 flex items-center justify-between border-t border-[#C9C6BE] pb-1 pt-3.5">
          <span className="text-sm">
            目標資産<span className="lbl block">年間支出 ÷ 取り崩し率</span>
          </span>
          <span className="text-base font-bold">{Number.isFinite(target) ? yen(target) : "—"}</span>
        </div>
      </Card>
      <p className="lbl leading-relaxed">利回りからインフレ率を引いた実質利回りで、毎月の積立を続けた場合の試算です。取り崩し率は「目標資産＝年間支出の何倍か」に換算して保存します。</p>
    </Page>
  );
}
