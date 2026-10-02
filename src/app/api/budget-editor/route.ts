/**
 * GET /api/budget-editor?year=2026&month=10
 * 予算の配分・修正画面用。保存済みの配分（なければ標準予算）、前月からの繰越、先月実績、配分の上限を返す。
 * 保存は POST /api/budgets
 */
import { NextRequest, NextResponse } from "next/server";
import { sortCategories } from "@/lib/categories";
import {
  getCarryover,
  getCategoryExpense,
  getMonthIncome,
  getSavedBudgets,
  getStandardBudgets,
} from "@/lib/finance";
import { prevMonth } from "@/lib/format";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const year = Number(sp.get("year"));
    const month = Number(sp.get("month"));
    if (!year || !month) return NextResponse.json({ error: "year と month が必要です" }, { status: 400 });

    const p = prevMonth(year, month);
    const [saved, carryover, standard, prevActual, prevPL, prevBudgets] = await Promise.all([
      getSavedBudgets(year, month),
      getCarryover(year, month),
      getStandardBudgets(),
      getCategoryExpense(p.year, p.month),
      getMonthIncome(p.year, p.month),
      getSavedBudgets(p.year, p.month),
    ]);

    const hasSaved = saved.size > 0;
    const cats = sortCategories(
      Array.from(new Set([...saved.keys(), ...prevBudgets.keys(), ...standard.keys()]))
    );

    const rows = cats.map((category) => {
      const allocation = hasSaved ? saved.get(category)?.allocation ?? 0 : standard.get(category) ?? 0;
      const carry = carryover.get(category) ?? 0;
      return {
        category,
        allocation,
        carryover: carry,
        lastActual: prevActual.get(category) ?? 0,
        standard: standard.get(category) ?? 0,
      };
    });

    return NextResponse.json({
      data: { year, month, hasSaved, cap: prevPL.income, capMonth: p, rows },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
