/**
 * 決算レポート API
 * GET /api/report?type=annual&year=2025    → 年次決算サマリー
 * GET /api/report?type=quarterly&year=2025 → 四半期別サマリー
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, assetSnapshots } from "@/lib/schema";
import { eq, and, sql, ne } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "annual";
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  try {
    if (type === "annual") {
      const data = await getAnnualReport(year);
      return NextResponse.json({ data });
    }
    if (type === "quarterly") {
      const data = await getQuarterlyReport(year);
      return NextResponse.json({ data });
    }
    return NextResponse.json({ error: "不明な type です" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "レポートの取得に失敗しました" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────
// 年次レポート
// ──────────────────────────────────────────────
async function getAnnualReport(year: number) {
  const baseWhere = (y: number) =>
    and(
      eq(transactions.year, y),
      eq(transactions.excludeFromPl, false),
      ne(transactions.type, "振替"),
      ne(transactions.category, "振替")
    );

  // 当年・前年の収支
  const [curRows, prevRows] = await Promise.all([
    db.select({
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    }).from(transactions).where(baseWhere(year)),
    db.select({
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    }).from(transactions).where(baseWhere(year - 1)),
  ]);

  const curIncome = Number(curRows[0]?.totalIncome ?? 0);
  const curExpense = Number(curRows[0]?.totalExpense ?? 0);
  const prevIncome = Number(prevRows[0]?.totalIncome ?? 0);
  const prevExpense = Number(prevRows[0]?.totalExpense ?? 0);

  // 月別収支
  const monthlyRows = await db
    .select({
      month: transactions.month,
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    })
    .from(transactions)
    .where(baseWhere(year))
    .groupBy(transactions.month)
    .orderBy(transactions.month);

  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const r = monthlyRows.find((x) => x.month === m);
    const inc = Number(r?.totalIncome ?? 0);
    const exp = Number(r?.totalExpense ?? 0);
    return { month: m, totalIncome: inc, totalExpense: exp, netIncome: inc - exp };
  });

  // カテゴリ別支出
  const categoryRows = await db
    .select({
      category: transactions.category,
      total: sql<number>`sum(expense_amount)`,
    })
    .from(transactions)
    .where(and(baseWhere(year), eq(transactions.type, "支出")))
    .groupBy(transactions.category)
    .orderBy(sql`sum(expense_amount) desc`);

  const totalExpForRatio = Number(curRows[0]?.totalExpense ?? 0);
  const categories = categoryRows.map((r) => ({
    category: r.category,
    total: Number(r.total ?? 0),
    ratio: totalExpForRatio > 0 ? Math.round((Number(r.total ?? 0) / totalExpForRatio) * 1000) / 10 : 0,
  }));

  // 期首・期末純資産（1月 & 12月の closing_balance 合計）
  const [assetStart, assetEnd, prevAssetEnd] = await Promise.all([
    db.select({ net: sql<number>`sum(closing_balance)` }).from(assetSnapshots)
      .where(and(eq(assetSnapshots.year, year), eq(assetSnapshots.month, 1))),
    db.select({ net: sql<number>`sum(closing_balance)` }).from(assetSnapshots)
      .where(and(eq(assetSnapshots.year, year), eq(assetSnapshots.month, 12))),
    db.select({ net: sql<number>`sum(closing_balance)` }).from(assetSnapshots)
      .where(and(eq(assetSnapshots.year, year - 1), eq(assetSnapshots.month, 12))),
  ]);

  const netAssetStart = Number(assetStart[0]?.net ?? 0);
  const netAssetEnd = Number(assetEnd[0]?.net ?? 0);
  const prevNetAssetEnd = Number(prevAssetEnd[0]?.net ?? 0);

  // 最高支出月・最低支出月
  const bestMonth = monthly.reduce((a, b) => (b.netIncome > a.netIncome ? b : a), monthly[0]);
  const worstMonth = monthly.reduce((a, b) => (b.netIncome < a.netIncome ? b : a), monthly[0]);

  return {
    year,
    income: {
      current: curIncome,
      prev: prevIncome,
      yoy: prevIncome > 0 ? Math.round(((curIncome - prevIncome) / prevIncome) * 1000) / 10 : null,
    },
    expense: {
      current: curExpense,
      prev: prevExpense,
      yoy: prevExpense > 0 ? Math.round(((curExpense - prevExpense) / prevExpense) * 1000) / 10 : null,
    },
    netIncome: {
      current: curIncome - curExpense,
      prev: prevIncome - prevExpense,
    },
    savingsRate: {
      current: curIncome > 0 ? Math.round(((curIncome - curExpense) / curIncome) * 1000) / 10 : 0,
      prev: prevIncome > 0 ? Math.round(((prevIncome - prevExpense) / prevIncome) * 1000) / 10 : 0,
    },
    netAsset: {
      start: netAssetStart,
      end: netAssetEnd,
      change: netAssetEnd - netAssetStart,
      prevEnd: prevNetAssetEnd,
      yoy: prevNetAssetEnd > 0 ? Math.round(((netAssetEnd - prevNetAssetEnd) / prevNetAssetEnd) * 1000) / 10 : null,
    },
    monthly,
    categories,
    highlights: {
      bestMonth: bestMonth ? { month: bestMonth.month, netIncome: bestMonth.netIncome } : null,
      worstMonth: worstMonth ? { month: worstMonth.month, netIncome: worstMonth.netIncome } : null,
    },
  };
}

// ──────────────────────────────────────────────
// 四半期レポート
// ──────────────────────────────────────────────
const QUARTERS = [
  { q: 1, label: "Q1", months: [1, 2, 3] },
  { q: 2, label: "Q2", months: [4, 5, 6] },
  { q: 3, label: "Q3", months: [7, 8, 9] },
  { q: 4, label: "Q4", months: [10, 11, 12] },
];

async function getQuarterlyReport(year: number) {
  // 当年の月別データを取得
  const monthlyRows = await db
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

  // 前年の月別データ（QoQ比較用に前年Q同士も比較できるようにする）
  const prevMonthlyRows = await db
    .select({
      month: transactions.month,
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.year, year - 1),
        eq(transactions.excludeFromPl, false),
        ne(transactions.type, "振替"),
        ne(transactions.category, "振替")
      )
    )
    .groupBy(transactions.month)
    .orderBy(transactions.month);

  // カテゴリ別支出（四半期ごと）
  const catRows = await db
    .select({
      month: transactions.month,
      category: transactions.category,
      total: sql<number>`sum(expense_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.year, year),
        eq(transactions.excludeFromPl, false),
        ne(transactions.type, "振替"),
        ne(transactions.category, "振替"),
        eq(transactions.type, "支出")
      )
    )
    .groupBy(transactions.month, transactions.category);

  // 四半期末の純資産（資産スナップショットの月末残高）
  const assetRows = await db
    .select({
      month: assetSnapshots.month,
      net: sql<number>`sum(closing_balance)`,
    })
    .from(assetSnapshots)
    .where(eq(assetSnapshots.year, year))
    .groupBy(assetSnapshots.month);

  const prevAssetRows = await db
    .select({
      month: assetSnapshots.month,
      net: sql<number>`sum(closing_balance)`,
    })
    .from(assetSnapshots)
    .where(eq(assetSnapshots.year, year - 1))
    .groupBy(assetSnapshots.month);

  function sumMonths(rows: typeof monthlyRows, months: number[]) {
    return months.reduce(
      (acc, m) => {
        const r = rows.find((x) => x.month === m);
        acc.income += Number(r?.totalIncome ?? 0);
        acc.expense += Number(r?.totalExpense ?? 0);
        return acc;
      },
      { income: 0, expense: 0 }
    );
  }

  const quarters = QUARTERS.map(({ q, label, months }) => {
    const cur = sumMonths(monthlyRows, months);
    const prev = sumMonths(prevMonthlyRows, months);
    const endMonth = months[months.length - 1];

    // 四半期末の純資産（Q末月のスナップ）
    const netAsset = Number(assetRows.find((r) => r.month === endMonth)?.net ?? 0);
    const prevNetAsset = Number(prevAssetRows.find((r) => r.month === endMonth)?.net ?? 0);

    // このQのカテゴリ別支出
    const qCatMap = new Map<string, number>();
    for (const r of catRows) {
      if (months.includes(r.month)) {
        qCatMap.set(r.category, (qCatMap.get(r.category) ?? 0) + Number(r.total ?? 0));
      }
    }
    const topCategories = Array.from(qCatMap.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      q,
      label,
      months,
      income: cur.income,
      expense: cur.expense,
      netIncome: cur.income - cur.expense,
      savingsRate: cur.income > 0 ? Math.round(((cur.income - cur.expense) / cur.income) * 1000) / 10 : 0,
      netAsset,
      netAssetChange: prevNetAsset > 0 ? netAsset - prevNetAsset : null,
      yoy: {
        income: prev.income > 0 ? Math.round(((cur.income - prev.income) / prev.income) * 1000) / 10 : null,
        expense: prev.expense > 0 ? Math.round(((cur.expense - prev.expense) / prev.expense) * 1000) / 10 : null,
        netIncome: prev.income - prev.expense,
      },
      topCategories,
    };
  });

  // 月別詳細（グラフ用）
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const r = monthlyRows.find((x) => x.month === m);
    const q = QUARTERS.find(({ months }) => months.includes(m))!;
    return {
      month: m,
      quarter: q.label,
      totalIncome: Number(r?.totalIncome ?? 0),
      totalExpense: Number(r?.totalExpense ?? 0),
      netIncome: Number(r?.totalIncome ?? 0) - Number(r?.totalExpense ?? 0),
    };
  });

  return { year, quarters, monthly };
}
