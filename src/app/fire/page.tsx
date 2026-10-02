"use client";
import { useState } from "react";
import { Card, CardTitle, ErrorBox, Loading, Page, PageTitle, useApi } from "@/components/ui/kit";
import { PencilIcon } from "@/components/ui/icons";
import { ageInMonths, monthsUntilPoolEmpty, neededSaving, whenCanRetire, type Plan } from "@/lib/fire";
import { num, yen } from "@/lib/format";

type Settings = {
  expectedReturnRate: number; // 500 = 5.00%
  inflationRate: number;
  monthlyExpenseOverride: number | null;
  monthlySavingsOverride: number | null;
  monthlyIdecoOverride: number | null;
  poolInflowOverride: number | null;
  birthDate: string | null;
  inflationReviewedOn: string | null;
  endAge: number;
  retirementIncome: number;
  pensionMonthly: number;
  pensionStartAge: number;
  targetRetireAge: number;
};
type Account = { name: string; role: "pool" | "invested"; balance: number; source: string; asOf: { year: number; month: number } | null };
type FireData = {
  settings: Settings;
  accounts: Account[];
  auto: { annualExpense: number; fundContribution: number; ideco: number; poolInflow: number };
  age: number;
  actualReturn: { months: number; from: { year: number; month: number }; cumulative: number; annualized: number } | null;
  today: { year: number; month: number; day: number };
};

type AutoKey = keyof FireData["auto"];
type Field = { key: keyof Plan; name: string; unit: "円" | "%" | "歳" | "円/月"; auto?: AutoKey; note?: string };

const FIELDS: Field[] = [
  { key: "annualExpense", name: "年間支出", unit: "円", auto: "annualExpense", note: "直近12か月の実績から" },
  { key: "pensionMonthly", name: "年金の月額", unit: "円/月", note: "ねんきん定期便の見込額。受給開始から支出に充てる" },
  { key: "pensionStartAge", name: "年金の受給開始年齢", unit: "歳", note: "繰り上げ・繰り下げをするならその年齢" },
  { key: "retirementIncome", name: "年金以外の月収入", unit: "円/月", note: "副収入など。リタイア直後から支出に充てる" },
  { key: "endAge", name: "何歳まで資産で暮らすか", unit: "歳", note: "この年齢でちょうど使い切る計算" },
  { key: "targetRetireAge", name: "リタイアしたい年齢", unit: "歳", note: "逆算に使う" },
  { key: "fundContribution", name: "投信への毎月の積立", unit: "円", auto: "fundContribution", note: "原資から。振替の実績（直近6か月の中央値）" },
  { key: "ideco", name: "iDeCo の毎月の拠出", unit: "円", auto: "ideco", note: "原資から。振替の実績（直近6か月の中央値）" },
  { key: "poolInflow", name: "原資への毎月の追加", unit: "円", auto: "poolInflow", note: "予算「貯蓄（投信）」の配分の実績（直近6か月の中央値）" },
  { key: "returnRate", name: "想定利回り（年）", unit: "%" },
  { key: "inflation", name: "インフレ率（年）", unit: "%" },
];

const OVERRIDE: Partial<Record<keyof Plan, keyof Settings>> = {
  annualExpense: "monthlyExpenseOverride",
  fundContribution: "monthlySavingsOverride",
  ideco: "monthlyIdecoOverride",
  poolInflow: "poolInflowOverride",
};

function toPlan(d: FireData): Plan {
  const s = d.settings;
  return {
    annualExpense: s.monthlyExpenseOverride !== null ? s.monthlyExpenseOverride * 12 : d.auto.annualExpense,
    fundContribution: s.monthlySavingsOverride ?? d.auto.fundContribution,
    ideco: s.monthlyIdecoOverride ?? d.auto.ideco,
    poolInflow: s.poolInflowOverride ?? d.auto.poolInflow,
    returnRate: s.expectedReturnRate / 100,
    inflation: s.inflationRate / 100,
    endAge: s.endAge,
    retirementIncome: s.retirementIncome,
    pensionMonthly: s.pensionMonthly,
    pensionStartAge: s.pensionStartAge,
    targetRetireAge: s.targetRetireAge,
  };
}

function addMonths(today: { year: number; month: number }, months: number) {
  const idx = today.year * 12 + (today.month - 1) + months;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

function man(v: number) {
  return `${Math.round(v / 10000).toLocaleString("ja-JP")}万円`;
}

export default function FirePage() {
  const { data, error, loading, reload } = useApi<FireData>("/api/fire");
  const [draft, setDraft] = useState<Record<keyof Plan, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [markReviewed, setMarkReviewed] = useState(false);

  if (error) return <Page><ErrorBox message={error} /></Page>;
  if (loading && !data) return <Page><Loading /></Page>;
  if (!data) return null;

  const p = toPlan(data);
  const pool = data.accounts.filter((a) => a.role === "pool").reduce((s, a) => s + a.balance, 0);
  const invested = data.accounts.filter((a) => a.role === "invested").reduce((s, a) => s + a.balance, 0);
  const total = pool + invested;
  const ageM = data.settings.birthDate ? ageInMonths(data.settings.birthDate, data.today) : data.age * 12;
  const start = { pool, invested };

  const forward = whenCanRetire(start, ageM, p);
  const reverse = neededSaving(start, ageM, p);
  const emptyIn = monthsUntilPoolEmpty(pool, p);
  const emptyAt = emptyIn !== null ? addMonths(data.today, emptyIn) : null;
  const retireAt = forward ? addMonths(data.today, forward.months) : null;

  const reviewed = data.settings.inflationReviewedOn;
  const reviewedMonths = reviewed ? (data.today.year - Number(reviewed.slice(0, 4))) * 12 + (data.today.month - Number(reviewed.slice(5, 7))) : null;
  const reviewDue = reviewedMonths === null || reviewedMonths >= 12;
  const ar = data.actualReturn;

  const show = (f: Field) =>
    f.unit === "円" ? yen(p[f.key]) : f.unit === "円/月" ? `${yen(p[f.key])}/月` : `${p[f.key]}${f.unit}`;
  const source = (f: Field): React.ReactNode => {
    if (f.key === "returnRate") return ar ? `実績 年率${ar.annualized}%（${ar.from.year}年${ar.from.month}月〜の${ar.months}か月）` : "手入力";
    if (f.key === "inflation")
      return (
        <span className={reviewDue ? "font-bold text-over" : ""}>
          {reviewed ? `最終見直し ${reviewed.slice(0, 4)}年${Number(reviewed.slice(5, 7))}月` : "まだ見直していません"}
          {reviewDue && " · 見直し時期です"}
        </span>
      );
    if (f.auto) return data.settings[OVERRIDE[f.key]!] === null ? f.note : "手入力で上書き中";
    return f.note ?? "手入力";
  };

  function startEdit() {
    const d = {} as Record<keyof Plan, string>;
    FIELDS.forEach((f) => (d[f.key] = f.unit.startsWith("円") ? num(p[f.key]) : String(p[f.key])));
    setDraft(d);
  }

  async function commit() {
    if (!draft) return;
    const parse = (k: keyof Plan) => parseFloat(draft[k].replace(/[^0-9.\-]/g, "")) || 0;
    const override = (k: keyof Plan) => {
      const value = Math.round(parse(k));
      const auto = data!.auto[FIELDS.find((f) => f.key === k)!.auto!];
      return value === auto ? null : value;
    };
    const annual = override("annualExpense");
    setSaving(true);
    try {
      await fetch("/api/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markReviewed,
          expectedReturnRate: Math.round(parse("returnRate") * 100),
          inflationRate: Math.round(parse("inflation") * 100),
          monthlyExpenseOverride: annual === null ? null : Math.round(annual / 12),
          monthlySavingsOverride: override("fundContribution"),
          monthlyIdecoOverride: override("ideco"),
          poolInflowOverride: override("poolInflow"),
          endAge: Math.round(parse("endAge")),
          retirementIncome: Math.round(parse("retirementIncome")),
          pensionMonthly: Math.round(parse("pensionMonthly")),
          pensionStartAge: Math.round(parse("pensionStartAge")),
          targetRetireAge: Math.round(parse("targetRetireAge")),
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
        <span className="lbl">いまのペースでリタイアできる時期</span>
        {forward && retireAt ? (
          <>
            <span className="text-[34px] font-bold leading-tight">
              {Math.floor(forward.ageMonths / 12)}歳
              <span className="ml-2 text-lg font-bold text-sub">
                {retireAt.year}年{retireAt.month}月
              </span>
            </span>
            <span className="text-[13px] text-sub">
              そのとき必要な資産 {man(forward.required)}（{p.endAge}歳まで）
            </span>
          </>
        ) : (
          <>
            <span className="text-[28px] font-bold">{p.endAge}歳までに届きません</span>
            <span className="text-[13px] text-sub">前提を見直してください</span>
          </>
        )}
        <span className="lbl mt-1">いまの投資資産 {yen(total)}</span>
      </Card>

      {reverse && (
        <Card className="flex flex-col gap-2.5">
          <span className="lbl">
            {p.targetRetireAge}歳でリタイアするには（あと {(reverse.months / 12).toFixed(1)} 年）
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-panel p-3">
              <span className="lbl">必要な毎月の積立</span>
              <span className={`text-[22px] font-bold leading-tight ${reverse.needed > p.poolInflow ? "text-over" : "text-accent"}`}>
                {yen(reverse.needed)}
              </span>
              <span className="lbl">いまは {yen(p.poolInflow)}</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-xl border border-line bg-panel p-3">
              <span className="lbl">{p.targetRetireAge}歳で必要な資産</span>
              <span className="text-[22px] font-bold leading-tight">{man(reverse.required)}</span>
              <span className="lbl">いまのペースだと {man(reverse.projected)}</span>
            </div>
          </div>
          <p className="lbl leading-relaxed">
            毎月の積立＝原資（ゆうちょ投資用・SBI証券）に新しく入れるお金。いまの投信・iDeCo への積立に上乗せして、すべて運用に回す前提です。
          </p>
        </Card>
      )}

      <Card>
        <CardTitle right={<span className="text-sm font-bold">{yen(total)}</span>}>投資資産</CardTitle>
        <AccountGroup title="原資（まだ運用していないお金）" accounts={data.accounts.filter((a) => a.role === "pool")} />
        <AccountGroup title="運用中" accounts={data.accounts.filter((a) => a.role === "invested")} />
        <p className="mt-3 rounded-[10px] bg-panel px-3 py-2.5 text-[13px] leading-relaxed text-ink2">
          {emptyAt ? (
            <>
              原資から毎月 {yen(p.fundContribution + p.ideco)}（投信 {num(p.fundContribution)}＋iDeCo {num(p.ideco)}）を移すと、
              <b>
                {emptyAt.year}年{emptyAt.month}月ごろ
              </b>
              に原資がなくなります。その後の積立は月 {yen(Math.max(0, p.poolInflow))}（原資への追加分）。
            </>
          ) : (
            <>原資への追加が積立以上なので、原資はなくなりません。</>
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

        <div className="flex min-h-14 items-center justify-between gap-3 border-t border-line2 py-2">
          <div>
            <span className="block text-sm">現在の年齢</span>
            <span className="lbl">誕生日から自動（日本時間）</span>
          </div>
          <span className="text-base font-bold">{data.age}歳</span>
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
              <div className="flex shrink-0 items-center gap-1.5">
                <input
                  id={`fire-${f.key}`}
                  inputMode="decimal"
                  value={draft[f.key]}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                  onFocus={(e) => e.target.select()}
                  className="h-11 w-[124px] rounded-[10px] border border-field px-2.5 text-right text-base font-bold outline-none focus:border-accent focus:ring-2 focus:ring-accent"
                />
                <span className="w-8 text-[13px] text-sub">{f.unit}</span>
              </div>
            ) : (
              <span className="shrink-0 text-base font-bold">{show(f)}</span>
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
      </Card>

      <details className="card p-4 text-[13px] leading-relaxed text-ink2">
        <summary className="cursor-pointer text-sm font-bold text-ink">計算のしかた</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5">
          <li>
            <b>必要な資産：</b>リタイアした時点から{p.endAge}歳まで、毎月「支出 − 年金以外の月収入」を取り崩し（{p.pensionStartAge}
            歳からは年金の分だけ少なくなる）、残りは運用し続けて、{p.endAge}歳でちょうど使い切る額。早くリタイアするほど期間が長く、必要な資産は大きくなります。
          </li>
          <li>
            <b>資産の増え方：</b>毎月、原資に追加分を足し、原資から投信・iDeCo へ積み立てる。運用中のお金には実質利回り（利回り − インフレ率 ＝ 年
            {(p.returnRate - p.inflation).toFixed(1)}%）を乗せる。原資（現金）には利回りを乗せません。
          </li>
          <li>
            <b>リタイアできる時期：</b>投資資産が、その時点の「必要な資産」に初めて届く月。
          </li>
          <li>
            <b>必要な毎月の積立：</b>目標の年齢で「必要な資産」にちょうど届くよう、原資へ毎月入れる額を逆算。
          </li>
        </ol>
        <p className="mt-2">金額はすべて今の物価に直した値です（インフレの分は実質利回りで調整しています）。</p>
      </details>
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
