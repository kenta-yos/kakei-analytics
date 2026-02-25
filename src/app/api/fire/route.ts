/**
 * FIRE計算機 API
 * GET  /api/fire  → 設定 + 現在の財務状況（純資産・月間支出・月間積立）
 * POST /api/fire  → 設定を保存
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fireSettings, assetSnapshots, transactions } from "@/lib/schema";
import { and, eq, sql, ne, desc } from "drizzle-orm";

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

    // 最新の純資産（asset_snapshots の最新月合計）
    const latestAssetMonth = await db
      .select({
        year: assetSnapshots.year,
        month: assetSnapshots.month,
      })
      .from(assetSnapshots)
      .orderBy(desc(assetSnapshots.year), desc(assetSnapshots.month))
      .limit(1);

    let currentNetAssets = 0;
    if (latestAssetMonth.length > 0) {
      const { year, month } = latestAssetMonth[0];
      const netAssetRows = await db
        .select({ net: sql<number>`sum(closing_balance)` })
        .from(assetSnapshots)
        .where(
          and(
            eq(assetSnapshots.year, year),
            eq(assetSnapshots.month, month)
          )
        );
      currentNetAssets = Number(netAssetRows[0]?.net ?? 0);
    }

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
