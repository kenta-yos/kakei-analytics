/**
 * 予算 API
 * GET  /api/budgets?year=2026&month=2   → 指定月の予算一覧（実績付き）
 * POST /api/budgets                      → 予算の保存（upsert）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { budgets, transactions } from "@/lib/schema";
import { eq, and, sql, ne } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  try {
    // 予算設定を取得
    const budgetRows = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.year, year), eq(budgets.month, month)))
      .orderBy(budgets.categoryName);

    // 同月の実績（カテゴリ別支出合計）を取得
    const actuals = await db
      .select({
        category: transactions.category,
        actual: sql<number>`sum(expense_amount)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.year, year),
          eq(transactions.month, month),
          eq(transactions.excludeFromPl, false),
          ne(transactions.type, "振替"),
          eq(transactions.type, "支出")
        )
      )
      .groupBy(transactions.category);

    const actualMap = new Map(actuals.map((a) => [a.category, Number(a.actual ?? 0)]));

    const budgetMap = new Map(budgetRows.map((b) => [b.categoryName, b]));

    // 予算レコードがあるカテゴリ + 取引があるカテゴリ を合わせる
    const txCatSet = new Set(actuals.map((a) => a.category));
    budgetRows.forEach((b) => txCatSet.add(b.categoryName));
    const allCats = Array.from(txCatSet).sort();

    const result = allCats.map((category) => {
      const budget = budgetMap.get(category);
      const actual = actualMap.get(category) ?? 0;
      return {
        categoryName: category,
        allocation: budget?.allocation ?? 0,
        carryover: budget?.carryover ?? 0,
        totalBudget: budget?.totalBudget ?? 0,
        actual,
        remaining: (budget?.totalBudget ?? 0) - actual,
        notes: budget?.notes ?? null,
        hasBudget: !!budget,
      };
    });

    return NextResponse.json({ data: result, year, month });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "予算の取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, month, items } = body as {
      year: number;
      month: number;
      items: Array<{
        categoryName: string;
        allocation: number;
        carryover: number;
        notes?: string;
      }>;
    };

    if (!year || !month || !Array.isArray(items)) {
      return NextResponse.json({ error: "パラメータが不正です" }, { status: 400 });
    }

    // upsert 一括処理
    for (const item of items) {
      const totalBudget = item.allocation + item.carryover;
      await db
        .insert(budgets)
        .values({
          year,
          month,
          categoryName: item.categoryName,
          allocation: item.allocation,
          carryover: item.carryover,
          totalBudget,
          notes: item.notes ?? null,
        })
        .onConflictDoUpdate({
          target: [budgets.year, budgets.month, budgets.categoryName],
          set: {
            allocation: sql`excluded.allocation`,
            carryover: sql`excluded.carryover`,
            totalBudget: sql`excluded.total_budget`,
            notes: sql`excluded.notes`,
            updatedAt: sql`now()`,
          },
        });
    }

    return NextResponse.json({ success: true, count: items.length });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "予算の保存に失敗しました" }, { status: 500 });
  }
}
