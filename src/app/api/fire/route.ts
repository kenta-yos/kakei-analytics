/**
 * FIRE試算 API
 * GET  /api/fire  → 設定 + 投資資産（原資・運用中）+ 毎月の積立の実績値
 * POST /api/fire  → 設定を保存
 *
 * 投資資産は次の4口座:
 *   原資（まだ運用していないお金）: ゆうちょ(投資用)・SBI証券
 *   運用中: 投資信託/SBI・iDeCo
 * 毎月、原資から投信へ積み立てる（原資がなくなれば止まる）。iDeCo は給料からの新しいお金。
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { fireSettings } from "@/lib/schema";
import { getLatestData, INVESTMENT_ACCOUNTS } from "@/lib/finance";
import { prevMonth, ymKey } from "@/lib/format";

const ACCOUNTS = INVESTMENT_ACCOUNTS;
const FUND_ASSET = "投資信託/SBI";
const IDECO_ASSET = "iDeCo";
const POOL_BUDGET_CATEGORY = "貯蓄（投信）";

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

export async function GET() {
  try {
    const latest = await getLatestData();
    const now = latest ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    const [settingsRows, snapRows, valRows, transferRows, poolBudget, expenseRows] = await Promise.all([
      q(sql`SELECT * FROM fire_settings WHERE id = 1`),
      q(sql`
        SELECT DISTINCT ON (asset_name) asset_name, closing_balance, year, month FROM asset_snapshots
        WHERE asset_name IN (${sql.join(ACCOUNTS.map((a) => sql`${a.asset}`), sql`, `)})
        ORDER BY asset_name, (year * 100 + month) DESC
      `),
      q(sql`
        SELECT DISTINCT ON (product_name) product_name, market_value, year, month FROM investment_valuations
        ORDER BY product_name, (year * 100 + month) DESC
      `),
      q(sql`
        SELECT asset_name, (year * 100 + month) AS ym, sum(income_amount) AS amount FROM transactions
        WHERE category = '振替' AND asset_name IN (${FUND_ASSET}, ${IDECO_ASSET}) AND income_amount > 0
        GROUP BY asset_name, ym
      `),
      q(sql`
        SELECT allocation FROM budgets WHERE category_name = ${POOL_BUDGET_CATEGORY}
        ORDER BY year DESC, month DESC LIMIT 1
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
    };

    // 口座の残高: 投信・iDeCo は自分で入れた評価額と資産別レポートのうち新しい方
    const accounts = ACCOUNTS.map((a) => {
      const snap = snapRows.find((r) => r.asset_name === a.asset);
      const val = "product" in a ? valRows.find((r) => r.product_name === a.product) : undefined;
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
    const monthly = (asset: string) =>
      median(months.map((ym) => Number(transferRows.find((r) => r.asset_name === asset && Number(r.ym) === ym)?.amount ?? 0)));

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
          poolInflow: Number(poolBudget[0]?.allocation ?? 0),
        },
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
    const values = {
      id: 1,
      currentAge: b.currentAge ?? 30,
      expectedReturnRate: b.expectedReturnRate ?? 500,
      inflationRate: b.inflationRate ?? 200,
      fireMultiplier: b.fireMultiplier ?? 25,
      monthlyExpenseOverride: b.monthlyExpenseOverride ?? null,
      monthlySavingsOverride: b.monthlySavingsOverride ?? null,
      monthlyIdecoOverride: b.monthlyIdecoOverride ?? null,
      poolInflowOverride: b.poolInflowOverride ?? null,
    };
    const { id: _id, ...set } = values; // eslint-disable-line @typescript-eslint/no-unused-vars
    await db
      .insert(fireSettings)
      .values(values)
      .onConflictDoUpdate({ target: [fireSettings.id], set: { ...set, updatedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
