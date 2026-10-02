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
  monthlyIdecoOverride: number | null;
  poolInflowOverride: number | null;
  birthDate: string | null;
  inflationReviewedOn: string | null;
};
type Account = {
  name: string;
  role: "pool" | "invested";
  balance: number;
  source: string;
  asOf: { year: number; month: number } | null;
};
type FireData = {
  settings: Settings;
  accounts: Account[];
  auto: { annualExpense: number; fundContribution: number; ideco: number; poolInflow: number; returnRate: number | null };
  age: number;
  actualReturn: { months: number; from: { year: number; month: number }; cumulative: number; annualized: number } | null;
  today: { year: number; month: number; day: number };
};

type Values = {
  annualExpense: number;
  fundContribution: number;
  ideco: number;
  poolInflow: number;
  returnRate: number; // %
  inflation: number; // %
  withdrawal: number; // %
};

type AutoKey = "annualExpense" | "fundContribution" | "ideco" | "poolInflow";
type Field = { key: keyof Values; name: string; unit: "円" | "%"; auto?: AutoKey; note?: string };

const FIELDS: Field[] = [
  { key: "annualExpense", name: "年間支出", unit: "円", auto: "annualExpense", note: "直近12か月の実績から" },
  { key: "fundContribution", name: "投信への毎月の積立", unit: "円", auto: "fundContribution", note: "原資から。振替の実績（直近6か月の中央値）" },
  { key: "ideco", name: "iDeCo の毎月の拠出", unit: "円", auto: "ideco", note: "原資から。振替の実績（直近6か月の中央値）" },
  { key: "poolInflow", name: "原資への毎月の追加", unit: "円", auto: "poolInflow", note: "残高の増減から逆算した実績（直近6か月の中央値）" },
  { key: "returnRate", name: "想定利回り（年）", unit: "%" },
  { key: "inflation", name: "インフレ率（年）", unit: "%" },
  { key: "withdrawal", name: "取り崩し率", unit: "%" },
];

const OVERRIDE: Partial<Record<keyof Values, keyof Settings>> = {
  annualExpense: "monthlyExpenseOverride",
  fundContribution: "monthlySavingsOverride",
  ideco: "monthlyIdecoOverride",
  poolInflow: "poolInflowOverride",
};

function toValues(d: FireData): Values {
  const s = d.settings;
  return {
    annualExpense: s.monthlyExpenseOverride !== null ? s.monthlyExpenseOverride * 12 : d.auto.annualExpense,
    fundContribution: s.monthlySavingsOverride ?? d.auto.fundContribution,
    ideco: s.monthlyIdecoOverride ?? d.auto.ideco,
    poolInflow: s.poolInflowOverride ?? d.auto.poolInflow,
    returnRate: s.expectedReturnRate / 100,
    inflation: s.inflationRate / 100,
    withdrawal: Math.round((100 / s.fireMultiplier) * 100) / 100,
  };
}

/**
 * 原資（現金・利回りなし）から毎月 投信・iDeCo へ移し、運用中の資産に実質利回りを乗せる。
 * 原資がなくなれば、積立は原資への追加分だけになる。
 */
function simulate(pool: number, invested: number, v: Values) {
  const target = v.withdrawal > 0 ? v.annualExpense / (v.withdrawal / 100) : Infinity;
  const r = (v.returnRate - v.inflation) / 100 / 12;
  let c = pool;
  let inv = invested;
  let m = 0;
  const want = v.fundContribution + v.ideco;
  while (c + inv < target && m < 12 * 60) {
    c += v.poolInflow;
    const move = Math.min(want, Math.max(0, c));
    c -= move;
    inv = inv * (1 + r) + move;
    m++;
  }

  // 原資が尽きて、積立を満額続けられなくなる月（目標に届くかとは別に数える）
  let poolEmptyAt: number | null = null;
  if (want > v.poolInflow) {
    let p = pool;
    for (let i = 1; i <= 12 * 60; i++) {
      p += v.poolInflow - want;
      if (p < want - v.poolInflow) {
        poolEmptyAt = i;
        break;
      }
    }
  }
  return { target, months: c + inv >= target ? m : null, poolEmptyAt };
}

function addMonths(months: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function FirePage() {
  const { data, error, loading, reload } = useApi<FireData>("/api/fire");
  const [draft, setDraft] = useState<Record<keyof Values, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [markReviewed, setMarkReviewed] = useState(false);
  const [help, setHelp] = useState(false);

  if (error) return <Page><ErrorBox message={error} /></Page>;
  if (loading && !data) return <Page><Loading /></Page>;
  if (!data) return null;

  const v = toValues(data);
  const pool = data.accounts.filter((a) => a.role === "pool").reduce((s, a) => s + a.balance, 0);
  const invested = data.accounts.filter((a) => a.role === "invested").reduce((s, a) => s + a.balance, 0);
  const total = pool + invested;
  const { target, months, poolEmptyAt } = simulate(pool, invested, v);
  const progress = Number.isFinite(target) && target > 0 ? Math.min(1, total / target) : 0;
  const thisYear = data.today.year;
  const age = data.age;
  const reviewed = data.settings.inflationReviewedOn;
  const reviewedMonths = reviewed
    ? (data.today.year - Number(reviewed.slice(0, 4))) * 12 + (data.today.month - Number(reviewed.slice(5, 7)))
    : null;
  const reviewDue = reviewedMonths === null || reviewedMonths >= 12;
  const ar = data.actualReturn;
  const emptyAt = poolEmptyAt !== null ? addMonths(poolEmptyAt) : null;

  const show = (f: Field) => (f.unit === "円" ? yen(v[f.key]) : `${v[f.key]}${f.unit}`);
  const source = (f: Field): React.ReactNode => {
    if (f.key === "returnRate")
      return ar ? `実績 年率${ar.annualized}%（${ar.from.year}年${ar.from.month}月〜の${ar.months}か月）` : "手入力";
    if (f.key === "inflation")
      return (
        <span className={reviewDue ? "font-bold text-over" : ""}>
          {reviewed ? `最終見直し ${reviewed.slice(0, 4)}年${Number(reviewed.slice(5, 7))}月` : "まだ見直していません"}
          {reviewDue && " · 見直し時期です"}
        </span>
      );
    if (f.key === "withdrawal")
      return (
        <button type="button" className="text-accent underline" onClick={() => setHelp((h) => !h)}>
          取り崩し率とは？
        </button>
      );
    if (!f.auto) return "手入力";
    const key = OVERRIDE[f.key]!;
    return data.settings[key] === null ? f.note : "手入力で上書き中";
  };

  function startEdit() {
    const d = {} as Record<keyof Values, string>;
    FIELDS.forEach((f) => (d[f.key] = f.unit === "円" ? num(v[f.key]) : String(v[f.key])));
    setDraft(d);
  }

  async function commit() {
    if (!draft) return;
    const parse = (k: keyof Values) => parseFloat(draft[k].replace(/[^0-9.\-]/g, "")) || 0;
    const override = (k: keyof Values) => {
      const value = Math.round(parse(k));
      const auto = data!.auto[FIELDS.find((f) => f.key === k)!.auto!];
      return value === auto ? null : value;
    };
    const annual = override("annualExpense");
    const withdrawal = parse("withdrawal");
    setSaving(true);
    try {
      await fetch("/api/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markReviewed,
          expectedReturnRate: Math.round(parse("returnRate") * 100),
          inflationRate: Math.round(parse("inflation") * 100),
          fireMultiplier: withdrawal > 0 ? Math.max(1, Math.round(100 / withdrawal)) : 25,
          monthlyExpenseOverride: annual === null ? null : Math.round(annual / 12),
          monthlySavingsOverride: override("fundContribution"),
          monthlyIdecoOverride: override("ideco"),
          poolInflowOverride: override("poolInflow"),
        }),
      });
      setDraft(null);
      setMarkReviewed(false);
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
          {months === null ? "前提を見直してください" : `あと ${(months / 12).toFixed(1)} 年（${age + Math.ceil(months / 12)}歳）`} · 目標資産{" "}
          {Number.isFinite(target) ? yen(target) : "—"}
        </span>
        <div className="mt-2 h-2.5 overflow-hidden rounded-[5px] bg-line2">
          <div className="h-full rounded-[5px] bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="lbl">
          いまの投資資産 {yen(total)}（{Math.round(progress * 100)}%）
        </span>
      </Card>

      <Card>
        <CardTitle right={<span className="text-sm font-bold">{yen(total)}</span>}>投資資産</CardTitle>
        <AccountGroup title="原資（まだ運用していないお金）" accounts={data.accounts.filter((a) => a.role === "pool")} />
        <AccountGroup title="運用中" accounts={data.accounts.filter((a) => a.role === "invested")} />
        <p className="mt-3 rounded-[10px] bg-panel px-3 py-2.5 text-[13px] leading-relaxed text-ink2">
          {emptyAt ? (
            <>
              原資から毎月 {yen(v.fundContribution + v.ideco)}（投信 {num(v.fundContribution)}＋iDeCo {num(v.ideco)}）を移すと、
              <b>{emptyAt.year}年{emptyAt.month}月ごろ</b>に原資がなくなります。その後の積立は月 {yen(Math.max(0, v.poolInflow))}（原資への追加分）。
            </>
          ) : (
            <>原資への追加が投信への積立以上なので、原資はなくなりません。</>
          )}
        </p>
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
                <button type="button" className="block min-h-6 text-xs text-accent" onClick={() => setDraft({ ...draft, [f.key]: num(data.auto[f.auto!]) })}>
                  実績の値に戻す
                </button>
              )}
              {draft && f.key === "returnRate" && ar && (
                <button type="button" className="block min-h-6 text-xs text-accent" onClick={() => setDraft({ ...draft, returnRate: String(ar.annualized) })}>
                  実績の値を使う
                </button>
              )}
              {draft && f.key === "inflation" && (
                <label className="flex min-h-6 items-center gap-1.5 text-xs text-accent">
                  <input type="checkbox" className="accent-accent" checked={markReviewed} onChange={(e) => setMarkReviewed(e.target.checked)} />
                  この値で見直し済みにする
                </label>
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
                <span className="w-4 text-[13px] text-sub">{f.unit}</span>
              </div>
            ) : (
              <span className="shrink-0 text-base font-bold">{show(f)}</span>
            )}
          </div>
        ))}

        {help && (
          <div className="mb-2 rounded-[10px] bg-panel px-3 py-2.5 text-[13px] leading-relaxed text-ink2">
            FIRE 後に、投資資産の何%を毎年生活費として取り崩すか。目標資産は「年間支出 ÷ 取り崩し率」で決まります（4%なら25倍、3%なら約33倍）。
            よく使われるのは 4%（いわゆる4%ルール）。取り崩す期間が50年以上と長くなるなら、3〜3.5% にすると安全側です。
          </div>
        )}

        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-line2 py-2">
          <div>
            <span className="block text-sm">現在の年齢</span>
            <span className="lbl">誕生日から自動（日本時間）</span>
          </div>
          <span className="text-base font-bold">{age}歳</span>
        </div>

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
      <p className="lbl leading-relaxed">
        運用中の資産に、利回りからインフレ率を引いた実質利回りを毎月乗せて試算しています。原資（現金）には利回りを乗せません。取り崩し率は「目標資産＝年間支出の何倍か」に換算して保存します。
      </p>
    </Page>
  );
}

function AccountGroup({ title, accounts }: { title: string; accounts: Account[] }) {
  const subtotal = accounts.reduce((s, a) => s + a.balance, 0);
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between border-b border-line2 pb-1.5">
        <span className="text-[13px] font-bold">{title}</span>
        <span className="text-[13px] font-bold">{yen(subtotal)}</span>
      </div>
      {accounts.map((a) => (
        <div key={a.name} className="flex items-baseline justify-between py-2">
          <span className="min-w-0">
            <span className="block text-sm">{a.name}</span>
            <span className="lbl">
              {a.source}
              {a.asOf ? `（${a.asOf.year}年${a.asOf.month}月末）` : ""}
            </span>
          </span>
          <span className="text-sm font-bold">{yen(a.balance)}</span>
        </div>
      ))}
    </div>
  );
}
