/**
 * GET /api/home?year=2026&month=10
 * ホーム用: 指定月（省略時は当月）の収支と、予算に対する実績、月末の締めの対象
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
import { nextMonth, prevMonth, todayJst, ymKey } from "@/lib/format";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const today = todayJst();
    const year = Number(sp.get("year") ?? today.year);
    const month = Number(sp.get("month") ?? today.month);
    const next = nextMonth(year, month);

    const [latest, latestValuation, pl, budgets, actual, nextBudgets] = await Promise.all([
      getLatestData(),
      getLatestValuationMonth(),
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

    // その月のデータがどこまで入っているか（0 = まだない）
    const daysInMonth = new Date(year, month, 0).getDate();
    const latestYm = latest ? ymKey(latest.year, latest.month) : 0;
    const asOfDay = latestYm < ymKey(year, month) ? 0 : latestYm === ymKey(year, month) ? latest!.day : daysInMonth;

    // 月末の締め: この月の予算がまだなければこの月、あれば翌月の配分が対象
    const target = budgets.size === 0 ? { year, month, hasBudget: false } : { ...next, hasBudget: nextBudgets.size > 0 };
    const capMonth = prevMonth(target.year, target.month);
    const cap = capMonth.year === year && capMonth.month === month ? pl.income : (await getMonthIncome(capMonth.year, capMonth.month)).income;

    return NextResponse.json({
      data: {
        year,
        month,
        isCurrentMonth: year === today.year && month === today.month,
        latestDate: latest?.date ?? null,
        latestValuation,
        asOfDay,
        elapsedRatio: asOfDay / daysInMonth,
        income: pl.income,
        expense: pl.expense,
        rows,
        // 上限にする月の途中（当月の24日まで）は、まだ配分の時期ではない
        closing: {
          ...target,
          capMonth,
          cap,
          due: !(capMonth.year === today.year && capMonth.month === today.month && today.day < 25),
        },
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
