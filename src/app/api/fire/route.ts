/**
 * FIRE計算機 API
 * GET  /api/fire  → 設定 + 現在の財務状況（純資産・月間支出・月間積立）
 * POST /api/fire  → 設定を保存
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fireSettings, transactions } from "@/lib/schema";
import { and, eq, sql, ne } from "drizzle-orm";

export async function GET() {
  try {
    // 設定を取得
    const settings = await db
      .select()
      .from(fireSettings)
      .where(eq(fireSettings.id, 1));

    const cfg = settings[0] ?? {
      id: 1,
      currentAge: 30,
      expectedReturnRate: 500,
      inflationRate: 200,
      fireMultiplier: 25,
      monthlyExpenseOverride: null,
      monthlySavingsOverride: null,
      updatedAt: null,
    };

    // 最新の純資産（貸借対照表と同じフィルフォワード方式）
    // 各資産の最新スナップショットを集計することで、更新頻度の違う資産も正しく反映する
    const netAssetResult = await db.execute(sql`
      SELECT SUM(latest_balance) AS net
      FROM (
        SELECT DISTINCT ON (asset_name) closing_balance AS latest_balance
        FROM asset_snapshots
        ORDER BY asset_name, (year * 100 + month) DESC
      ) t
    `);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentNetAssets = Number((netAssetResult.rows as any[])[0]?.net ?? 0);

    // 過去12ヶ月の月間支出平均（excludeFromPl=false, 振替除外）
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const toYear = now.getFullYear();
    const toMonth = now.getMonth() + 1;
    const fromDate = new Date(now);
    fromDate.setMonth(fromDate.getMonth() - 11);
    const fromYear = fromDate.getFullYear();
    const fromMonth = fromDate.getMonth() + 1;

    const expenseRows = await db
      .select({
        month: transactions.month,
        year: transactions.year,
        totalExpense: sql<number>`sum(expense_amount)`,
        totalIncome: sql<number>`sum(income_amount)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.excludeFromPl, false),
          ne(transactions.type, "振替"),
          ne(transactions.category, "振替"),
          sql`(year * 100 + month) >= ${fromYear * 100 + fromMonth}`,
          sql`(year * 100 + month) <= ${toYear * 100 + toMonth}`
        )
      )
      .groupBy(transactions.year, transactions.month);

    const monthCount = Math.max(expenseRows.length, 1);
    const totalExpense = expenseRows.reduce((s, r) => s + Number(r.totalExpense ?? 0), 0);
    const totalIncome = expenseRows.reduce((s, r) => s + Number(r.totalIncome ?? 0), 0);
    const monthlyExpenseAuto = Math.round(totalExpense / monthCount);
    const monthlySavingsAuto = Math.round((totalIncome - totalExpense) / monthCount);

    return NextResponse.json({
      data: {
        settings: cfg,
        currentState: {
          netAssets: currentNetAssets,
          monthlyExpenseAuto,
          monthlySavingsAuto,
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
    const body = await req.json();
    const {
      currentAge,
      expectedReturnRate,
      inflationRate,
      fireMultiplier,
      monthlyExpenseOverride,
      monthlySavingsOverride,
    } = body;

    await db
      .insert(fireSettings)
      .values({
        id: 1,
        currentAge: currentAge ?? 30,
        expectedReturnRate: expectedReturnRate ?? 500,
        inflationRate: inflationRate ?? 200,
        fireMultiplier: fireMultiplier ?? 25,
        monthlyExpenseOverride: monthlyExpenseOverride || null,
        monthlySavingsOverride: monthlySavingsOverride || null,
      })
      .onConflictDoUpdate({
        target: [fireSettings.id],
        set: {
          currentAge: currentAge ?? 30,
          expectedReturnRate: expectedReturnRate ?? 500,
          inflationRate: inflationRate ?? 200,
          fireMultiplier: fireMultiplier ?? 25,
          monthlyExpenseOverride: monthlyExpenseOverride || null,
          monthlySavingsOverride: monthlySavingsOverride || null,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
