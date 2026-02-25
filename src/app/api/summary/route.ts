/**
 * 月次・年次サマリー API
 * GET /api/summary?year=2026&month=2          → 指定月の収支
 * GET /api/summary?year=2026                  → 指定年の月次一覧
 * GET /api/summary?years=2019,2020,...        → 年次比較用
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/schema";
import { eq, and, inArray, sql, ne } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
  const yearsParam = searchParams.get("years");

  try {
    if (yearsParam) {
      // 年次比較: 複数年の年次サマリーを返す
      const years = yearsParam.split(",").map(Number).filter(Boolean);
      const data = await getYearlySummaries(years);
      return NextResponse.json({ data });
    }

    if (year && month) {
      // 月次詳細
      const data = await getMonthlySummary(year, month);
      return NextResponse.json({ data });
    }

    if (year) {
      // 年次の月別一覧
      const data = await getYearlyMonthlyBreakdown(year);
      return NextResponse.json({ data });
    }

    // デフォルト: 全期間の年次サマリー
    const data = await getYearlySummaries();
    return NextResponse.json({ data });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "サマリーの取得に失敗しました" }, { status: 500 });
  }
}

async function getMonthlySummary(year: number, month: number) {
  // 収支計算に含めるもの（振替除外・excludeFromPl=false）
  const rows = await db
    .select({
      type: transactions.type,
      category: transactions.category,
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.year, year),
        eq(transactions.month, month),
        eq(transactions.excludeFromPl, false),
        ne(transactions.type, "振替"),
        ne(transactions.category, "振替")
      )
    )
    .groupBy(transactions.type, transactions.category)
    .orderBy(sql`sum(expense_amount) desc`);

  const categories: Record<string, { expense: number; income: number; count: number }> = {};
  let totalIncome = 0;
  let totalExpense = 0;

  for (const row of rows) {
    const key = row.category;
    if (!categories[key]) categories[key] = { expense: 0, income: 0, count: 0 };
    categories[key].expense += Number(row.totalExpense ?? 0);
    categories[key].income += Number(row.totalIncome ?? 0);
    categories[key].count += Number(row.count ?? 0);
    totalExpense += Number(row.totalExpense ?? 0);
    totalIncome += Number(row.totalIncome ?? 0);
  }

  return {
    year,
    month,
    totalIncome,
    totalExpense,
    netIncome: totalIncome - totalExpense,
    categories,
  };
}

async function getYearlyMonthlyBreakdown(year: number) {
  const rows = await db
    .select({
      month: transactions.month,
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.year, year),
        eq(transactions.excludeFromPl, false),
        ne(transactions.type, "振替"),
        ne(transactions.category, "振替")
      )
    )
    .groupBy(transactions.month)
    .orderBy(transactions.month);

  return rows.map((r) => ({
    year,
    month: r.month,
    totalIncome: Number(r.totalIncome ?? 0),
    totalExpense: Number(r.totalExpense ?? 0),
    netIncome: Number(r.totalIncome ?? 0) - Number(r.totalExpense ?? 0),
  }));
}

async function getYearlySummaries(years?: number[]) {
  const conditions = [
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    ne(transactions.category, "振替"),
  ];
  if (years && years.length > 0) {
    conditions.push(inArray(transactions.year, years));
  }

  const rows = await db
    .select({
      year: transactions.year,
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.year)
    .orderBy(transactions.year);

  return rows.map((r) => ({
    year: r.year,
    totalIncome: Number(r.totalIncome ?? 0),
    totalExpense: Number(r.totalExpense ?? 0),
    netIncome: Number(r.totalIncome ?? 0) - Number(r.totalExpense ?? 0),
  }));
}
