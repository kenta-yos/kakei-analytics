/**
 * GET /api/budgets/carryover?year=2026&month=2
 * 前月の予算残高から今月の繰越額を自動計算して返す
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budgets, transactions } from "@/lib/schema";
import { eq, and, sql, ne } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  try {
    // 前月の予算設定
    const prevBudgets = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.year, prevYear), eq(budgets.month, prevMonth)));

    // 前月の実績
    const prevActuals = await db
      .select({
        category: transactions.category,
        actual: sql<number>`sum(expense_amount)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.year, prevYear),
          eq(transactions.month, prevMonth),
          eq(transactions.excludeFromPl, false),
          ne(transactions.type, "振替"),
          eq(transactions.type, "支出")
        )
      )
      .groupBy(transactions.category);

    const actualMap = new Map(prevActuals.map((a) => [a.category, Number(a.actual ?? 0)]));

    const carryoverMap = prevBudgets.map((b) => {
      const actual = actualMap.get(b.categoryName) ?? 0;
      const remaining = b.totalBudget - actual;
      return {
        categoryName: b.categoryName,
        prevTotalBudget: b.totalBudget,
        prevActual: actual,
        carryover: remaining, // 残りをそのまま繰越（±）
      };
    });

    return NextResponse.json({
      data: carryoverMap,
      prevYear,
      prevMonth,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "繰越計算に失敗しました" }, { status: 500 });
  }
}
