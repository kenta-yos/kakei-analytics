/**
 * 月次・年次サマリー API
 * GET /api/summary?year=2026&month=2          → 指定月の収支
 * GET /api/summary?year=2026                  → 指定年の月次一覧
 * GET /api/summary?years=2019,2020,...        → 年次比較用
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, investmentValuations } from "@/lib/schema";
import { eq, and, inArray, sql, ne, or, desc } from "drizzle-orm";

// 投資損益は excludeFromPl=true でも P&L に含める
const plCondition = or(eq(transactions.excludeFromPl, false), eq(transactions.category, "投資損益"))!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
  const quarter = searchParams.get("quarter") ? parseInt(searchParams.get("quarter")!) : null;
  const yearsParam = searchParams.get("years");

  try {
    if (yearsParam) {
      // 年次比較: 複数年の年次サマリーを返す
      const years = yearsParam.split(",").map(Number).filter(Boolean);
      const data = await getYearlySummaries(years);
      return NextResponse.json({ data });
    }

    if (year && quarter) {
      // 四半期詳細（カテゴリ別内訳付き）+ 投資損益
      const qMonths = [1, 2, 3].map(m => m + (quarter - 1) * 3);
      const [data, investPL] = await Promise.all([
        getQuarterlySummary(year, quarter),
        getInvestmentPLForMonths(year, qMonths),
      ]);
      return NextResponse.json({ data, investmentPL: investPL });
    }

    if (year && month) {
      // 月次詳細
      const [data, investPL] = await Promise.all([
        getMonthlySummary(year, month),
        getMonthlyInvestmentPL(year, month),
      ]);
      return NextResponse.json({ data, investmentPL: investPL });
    }

    if (year) {
      // 年次の月別一覧 + カテゴリ別年間集計 + 年間投資損益
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      const [data, yearCategories, investPL] = await Promise.all([
        getYearlyMonthlyBreakdown(year),
        getYearlyCategoryBreakdown(year),
        getInvestmentPLForMonths(year, months),
      ]);
      return NextResponse.json({ data, yearCategories, investmentPL: investPL });
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
        plCondition,
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
        plCondition,
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

async function getYearlyCategoryBreakdown(year: number) {
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
        plCondition,
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

  return { totalIncome, totalExpense, netIncome: totalIncome - totalExpense, categories };
}

async function getQuarterlySummary(year: number, quarter: number) {
  const qMonths = [1, 2, 3].map(m => m + (quarter - 1) * 3);
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
        inArray(transactions.month, qMonths),
        plCondition,
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
    quarter,
    months: qMonths,
    totalIncome,
    totalExpense,
    netIncome: totalIncome - totalExpense,
    categories,
  };
}

async function getYearlySummaries(years?: number[]) {
  const conditions = [
    plCondition,
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

// ─────────────────────────────────────────────────────────────────────────────
// 投資の月次運用損益
// 当月運用損益 = 当月末評価額 - 前月末評価額 - 当月新規拠出額
// ─────────────────────────────────────────────────────────────────────────────

const PRODUCT_TO_ASSET: Record<string, string> = {
  "iDeCo": "iDeCo",
  "SBI投資信託": "投資信託/SBI",
};

/** 指定月までの累計拠出額 */
async function getCostBasisUpTo(assetName: string, uptoYear: number, uptoMonth: number) {
  const rows = await db
    .select({ total: sql<number>`sum(income_amount)` })
    .from(transactions)
    .where(and(
      eq(transactions.category, "振替"),
      eq(transactions.assetName, assetName),
      sql`income_amount > 0`,
      sql`(year * 100 + month) <= ${uptoYear * 100 + uptoMonth}`,
    ));
  return Number(rows[0]?.total ?? 0);
}

/** 単月の投資運用損益（商品別 + 合計） */
async function getMonthlyInvestmentPL(year: number, month: number) {
  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };

  const [currentVals, prevVals] = await Promise.all([
    db.select().from(investmentValuations)
      .where(and(eq(investmentValuations.year, year), eq(investmentValuations.month, month))),
    db.select().from(investmentValuations)
      .where(and(eq(investmentValuations.year, prevMonth.y), eq(investmentValuations.month, prevMonth.m))),
  ]);

  const products: { productName: string; gain: number; marketValue: number; prevMarketValue: number; contribution: number }[] = [];
  let totalGain = 0;

  for (const [productName, assetName] of Object.entries(PRODUCT_TO_ASSET)) {
    const cur = currentVals.find(v => v.productName === productName);
    const prev = prevVals.find(v => v.productName === productName);
    if (!cur && !prev) continue;

    const curMarket = cur?.marketValue ?? 0;
    const prevMarket = prev?.marketValue ?? 0;

    // 当月の新規拠出 = 当月末までの累計 - 前月末までの累計
    const [costCur, costPrev] = await Promise.all([
      getCostBasisUpTo(assetName, year, month),
      getCostBasisUpTo(assetName, prevMonth.y, prevMonth.m),
    ]);
    const contribution = costCur - costPrev;
    const gain = curMarket - prevMarket - contribution;

    products.push({ productName, gain, marketValue: curMarket, prevMarketValue: prevMarket, contribution });
    totalGain += gain;
  }

  return { products, totalGain };
}

/** 複数月の投資運用損益を合算 */
async function getInvestmentPLForMonths(year: number, months: number[]) {
  const results = await Promise.all(months.map(m => getMonthlyInvestmentPL(year, m)));
  const productMap = new Map<string, number>();
  let totalGain = 0;

  for (const r of results) {
    for (const p of r.products) {
      productMap.set(p.productName, (productMap.get(p.productName) ?? 0) + p.gain);
    }
    totalGain += r.totalGain;
  }

  return {
    products: Array.from(productMap.entries()).map(([name, gain]) => ({ productName: name, gain })),
    totalGain,
  };
}
