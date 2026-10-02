/**
 * FIRE試算 API
 * GET  /api/fire  → 設定 + 投資資産（原資・運用中）+ 毎月の積立の実績値
 * POST /api/fire  → 設定を保存
 *
 * 投資資産は次の4口座:
 *   原資（まだ運用していないお金）: ゆうちょ(投資用)・SBI証券
 *   運用中: 投資信託/SBI・iDeCo
 * 毎月、原資から投信・iDeCo へ積み立てる（原資がなくなれば、原資への追加分だけになる）。
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fireSettings } from "@/lib/schema";
import { getLatestData, INVESTMENT_ACCOUNTS } from "@/lib/finance";
import { ageOn, prevMonth, todayJst, ymKey } from "@/lib/format";

const ACCOUNTS = INVESTMENT_ACCOUNTS;
const FUND_ASSET = "投資信託/SBI";
const IDECO_ASSET = "iDeCo";
/** 原資への追加は、この予算カテゴリへの配分の実績 */
const POOL_BUDGET_CATEGORY = "貯蓄（投信）";
/** 実績利回りを見る期間（最大） */
const RETURN_WINDOW_MONTHS = 36;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function q(query: ReturnType<typeof sql>): Promise<Record<string, any>[]> {
  return (await db.execute(query)).rows as Record<string, unknown>[];
}

function median(vals: number[]) {
  if (vals.length === 0) return 0;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * 投信・iDeCo の評価額から運用利回りの実績を出す（時間加重。拠出は月の半ばに入ったとみなす）。
 * 直近 RETURN_WINDOW_MONTHS か月まで。年率に換算した % を返す
 */
function investmentReturn(valRows: Record<string, unknown>[], transferRows: Record<string, unknown>[]) {
  const assetOf: Record<string, string> = Object.fromEntries(
    INVESTMENT_ACCOUNTS.filter((a) => "product" in a).map((a) => [(a as { product: string }).product, a.asset])
  );
  const yms = Array.from(new Set(valRows.map((r) => Number(r.ym)))).sort((a, b) => a - b).slice(-(RETURN_WINDOW_MONTHS + 1));
  let growth = 1;
  let months = 0;
  for (let i = 1; i < yms.length; i++) {
    let gain = 0;
    let base = 0;
    for (const product of Object.keys(assetOf)) {
      const cur = valRows.find((r) => r.product_name === product && Number(r.ym) === yms[i]);
      const prev = valRows.find((r) => r.product_name === product && Number(r.ym) === yms[i - 1]);
      if (!cur || !prev) continue;
      const contrib = Number(transferRows.find((r) => r.asset_name === assetOf[product] && Number(r.ym) === yms[i])?.amount ?? 0);
      gain += Number(cur.market_value) - Number(prev.market_value) - contrib;
      base += Number(prev.market_value) + contrib / 2;
    }
    if (base <= 0) continue;
    growth *= 1 + gain / base;
    months++;
  }
  if (months === 0) return null;
  const first = yms[yms.length - 1 - months] ?? yms[0];
  return {
    months,
    from: { year: Math.floor(first / 100), month: first % 100 },
    cumulative: Math.round((growth - 1) * 1000) / 10,
    annualized: Math.round((Math.pow(growth, 12 / months) - 1) * 1000) / 10,
  };
}

export async function GET() {
  try {
    const latest = await getLatestData();
    const now = latest ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    const [settingsRows, snapRows, valRows, transferRows, poolRows, expenseRows] = await Promise.all([
      q(sql`SELECT *, birth_date::text AS birth, inflation_reviewed_on::text AS reviewed FROM fire_settings WHERE id = 1`),
      q(sql`
        SELECT DISTINCT ON (asset_name) asset_name, closing_balance, year, month FROM asset_snapshots
        WHERE asset_name IN (${sql.join(ACCOUNTS.map((a) => sql`${a.asset}`), sql`, `)})
        ORDER BY asset_name, (year * 100 + month) DESC
      `),
      q(sql`SELECT product_name, market_value, year, month, (year * 100 + month) AS ym FROM investment_valuations`),
      q(sql`
        SELECT asset_name, (year * 100 + month) AS ym, sum(income_amount) AS amount FROM transactions
        WHERE category = '振替' AND asset_name IN (${FUND_ASSET}, ${IDECO_ASSET}) AND income_amount > 0
        GROUP BY asset_name, ym
      `),
      q(sql`
        SELECT (year * 100 + month) AS ym, allocation FROM budgets
        WHERE category_name = ${POOL_BUDGET_CATEGORY} AND (year * 100 + month) <= ${ymKey(now.year, now.month)}
      `),
      q(sql`
        SELECT year, month, sum(expense_amount) AS expense FROM transactions
        WHERE exclude_from_pl = false AND type <> '振替' AND category <> '振替'
          AND (year * 100 + month) <= ${ymKey(now.year, now.month)}
        GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 12
      `),
    ]);

    const s = settingsRows[0];
    const settings = {
      currentAge: Number(s?.current_age ?? 30),
      expectedReturnRate: Number(s?.expected_return_rate ?? 500),
      inflationRate: Number(s?.inflation_rate ?? 200),
      fireMultiplier: Number(s?.fire_multiplier ?? 25),
      monthlyExpenseOverride: s?.monthly_expense_override ?? null,
      monthlySavingsOverride: s?.monthly_savings_override ?? null,
      monthlyIdecoOverride: s?.monthly_ideco_override ?? null,
      poolInflowOverride: s?.pool_inflow_override ?? null,
      birthDate: (s?.birth as string | null) ?? null,
      inflationReviewedOn: (s?.reviewed as string | null) ?? null,
      endAge: Number(s?.end_age ?? 95),
      retirementIncome: Number(s?.retirement_income ?? 0),
      pensionMonthly: Number(s?.pension_monthly ?? 0),
      pensionStartAge: Number(s?.pension_start_age ?? 65),
      targetRetireAge: Number(s?.target_retire_age ?? 50),
    };
    const age = settings.birthDate ? ageOn(settings.birthDate) : settings.currentAge;

    // 口座の残高: 投信・iDeCo は自分で入れた評価額と資産別レポートのうち新しい方
    const accounts = ACCOUNTS.map((a) => {
      const snap = snapRows.find((r) => r.asset_name === a.asset);
      const val =
        "product" in a
          ? valRows.filter((r) => r.product_name === a.product).sort((x, y) => Number(y.ym) - Number(x.ym))[0]
          : undefined;
      const snapYm = snap ? ymKey(Number(snap.year), Number(snap.month)) : 0;
      const valYm = val ? ymKey(Number(val.year), Number(val.month)) : 0;
      const useVal = val && valYm >= snapYm;
      return {
        name: a.asset,
        role: a.role,
        balance: Number(useVal ? val!.market_value : snap?.closing_balance ?? 0),
        source: useVal ? "評価額" : "資産別レポート",
        asOf: useVal ? { year: Number(val!.year), month: Number(val!.month) } : snap ? { year: Number(snap.year), month: Number(snap.month) } : null,
      };
    });

    // 毎月の振替: 直近6か月の中央値（一時的な大口の入金に引っぱられないように）
    const months: number[] = [];
    let c = { year: now.year, month: now.month };
    for (let i = 0; i < 6; i++) {
      months.push(ymKey(c.year, c.month));
      c = prevMonth(c.year, c.month);
    }
    const monthly = (asset: string) => median(months.map((ym) => transfer(asset, ym)));

    const transfer = (asset: string, ym: number) =>
      Number(transferRows.find((r) => r.asset_name === asset && Number(r.ym) === ym)?.amount ?? 0);

    // 原資への追加: 予算「貯蓄（投信）」への配分の実績（直近6か月の中央値）
    const poolInflow = median(months.map((ym) => Number(poolRows.find((r) => Number(r.ym) === ym)?.allocation ?? 0)));

    const actualReturn = investmentReturn(valRows, transferRows);

    const monthlyExpenseAuto = expenseRows.length
      ? Math.round(expenseRows.reduce((sum, r) => sum + Number(r.expense ?? 0), 0) / expenseRows.length)
      : 0;

    return NextResponse.json({
      data: {
        settings,
        accounts,
        auto: {
          annualExpense: monthlyExpenseAuto * 12,
          fundContribution: Math.round(monthly(FUND_ASSET)),
          ideco: Math.round(monthly(IDECO_ASSET)),
          poolInflow: Math.round(poolInflow),
          // 実績が12か月以上たまったら、想定利回りの初期値に実績を使う
          returnRate: actualReturn && actualReturn.months >= 12 ? actualReturn.annualized : null,
        },
        age,
        actualReturn,
        today: todayJst(),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const [current] = await q(sql`SELECT inflation_rate, inflation_reviewed_on::text AS reviewed FROM fire_settings WHERE id = 1`);
    const t = todayJst();
    const today = `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
    const inflationRate = b.inflationRate ?? 200;
    // インフレ率を変えたとき、または「この値で見直し済みにする」を押したときに見直し日を更新する
    const reviewed = b.markReviewed || Number(current?.inflation_rate) !== inflationRate ? today : (current?.reviewed as string | null) ?? null;

    const set = {
      expectedReturnRate: b.expectedReturnRate ?? 500,
      inflationRate,
      monthlyExpenseOverride: b.monthlyExpenseOverride ?? null,
      monthlySavingsOverride: b.monthlySavingsOverride ?? null,
      monthlyIdecoOverride: b.monthlyIdecoOverride ?? null,
      poolInflowOverride: b.poolInflowOverride ?? null,
      inflationReviewedOn: reviewed,
      endAge: b.endAge ?? 95,
      retirementIncome: b.retirementIncome ?? 0,
      pensionMonthly: b.pensionMonthly ?? 0,
      pensionStartAge: b.pensionStartAge ?? 65,
      targetRetireAge: b.targetRetireAge ?? 50,
    };
    await db
      .insert(fireSettings)
      .values({ id: 1, ...set })
      .onConflictDoUpdate({ target: [fireSettings.id], set: { ...set, updatedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
