/**
 * GET /api/home?year=2026&month=9
 * ホーム用: 指定月（省略時は最新データの月）の収支と、予算に対する実績
 */
import { NextRequest, NextResponse } from "next/server";
import { SAVINGS_CATEGORIES, sortCategories } from "@/lib/categories";
import {
  getCategoryExpense,
  getLatestData,
  getLatestValuationMonth,
  getMonthIncome,
  getSavedBudgets,
} from "@/lib/finance";
import { nextMonth } from "@/lib/format";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const [latest, latestValuation] = await Promise.all([getLatestData(), getLatestValuationMonth()]);
    const year = Number(sp.get("year") ?? latest?.year ?? new Date().getFullYear());
    const month = Number(sp.get("month") ?? latest?.month ?? new Date().getMonth() + 1);
    const next = nextMonth(year, month);

    const [pl, budgets, actual, nextBudgets] = await Promise.all([
      getMonthIncome(year, month),
      getSavedBudgets(year, month),
      getCategoryExpense(year, month),
      getSavedBudgets(next.year, next.month),
    ]);

    const cats = sortCategories(
      Array.from(new Set([...budgets.keys(), ...actual.keys()])).filter((c) => !SAVINGS_CATEGORIES.has(c))
    );
    const rows = cats
      .map((category) => {
        const budget = budgets.get(category)?.totalBudget ?? 0;
        const spent = actual.get(category) ?? 0;
        return { category, budget, actual: spent, remaining: budget - spent };
      })
      .filter((r) => r.budget !== 0 || r.actual !== 0);

    // その月のデータがどこまで入っているか（最新月なら最終取込日）
    const isLatestMonth = latest && latest.year === year && latest.month === month;
    const daysInMonth = new Date(year, month, 0).getDate();
    const asOfDay = isLatestMonth ? latest.day : daysInMonth;

    return NextResponse.json({
      data: {
        year,
        month,
        latestDate: latest?.date ?? null,
        latestValuation,
        asOfDay,
        elapsedRatio: asOfDay / daysInMonth,
        income: pl.income,
        expense: pl.expense,
        rows,
        next: { ...next, hasBudget: nextBudgets.size > 0 },
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
