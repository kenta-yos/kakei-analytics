/**
 * 分析 API
 * GET /api/analytics?type=category&year=2026&month=2         → カテゴリ別
 * GET /api/analytics?type=asset                              → 資産推移
 * GET /api/analytics?type=trend&years=2022,2023,2024,2025   → 年比較
 * GET /api/analytics?type=category_trend&category=食費       → カテゴリ年推移
 * GET /api/analytics?type=available_years                    → データが存在する年一覧
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, assetSnapshots } from "@/lib/schema";
import { eq, and, inArray, sql, ne, gte, lte, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "category";
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
  const yearsParam = searchParams.get("years");
  const category = searchParams.get("category");

  try {
    switch (type) {
      case "available_years": {
        const rows = await db
          .selectDistinct({ year: transactions.year })
          .from(transactions)
          .orderBy(transactions.year);
        return NextResponse.json({ data: rows.map((r) => r.year) });
      }

      case "category": {
        if (!year) return NextResponse.json({ error: "year が必要です" }, { status: 400 });
        const data = await getCategoryBreakdown(year, month ?? undefined);
        return NextResponse.json({ data });
      }

      case "trend": {
        const years = yearsParam?.split(",").map(Number).filter(Boolean);
        const data = await getMonthlyTrend(years);
        return NextResponse.json({ data });
      }

      case "category_trend": {
        if (!category) return NextResponse.json({ error: "category が必要です" }, { status: 400 });
        const data = await getCategoryTrend(category);
        return NextResponse.json({ data });
      }

      case "asset": {
        const data = await getAssetTrend(year ?? undefined);
        return NextResponse.json({ data });
      }

      case "payment_method": {
        if (!year) return NextResponse.json({ error: "year が必要です" }, { status: 400 });
        const data = await getPaymentMethodBreakdown(year, month ?? undefined);
        return NextResponse.json({ data });
      }

      case "top_items": {
        if (!year) return NextResponse.json({ error: "year が必要です" }, { status: 400 });
        const data = await getTopItems(year, month ?? undefined);
        return NextResponse.json({ data });
      }

      default:
        return NextResponse.json({ error: "不明な type です" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "分析データの取得に失敗しました" }, { status: 500 });
  }
}

async function getCategoryBreakdown(year: number, month?: number) {
  const conditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (month) conditions.push(eq(transactions.month, month));

  const rows = await db
    .select({
      category: transactions.category,
      total: sql<number>`sum(expense_amount)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.category)
    .orderBy(sql`sum(expense_amount) desc`);

  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  return rows.map((r) => ({
    category: r.category,
    total: Number(r.total ?? 0),
    count: Number(r.count ?? 0),
    ratio: grandTotal > 0 ? Math.round((Number(r.total ?? 0) / grandTotal) * 1000) / 10 : 0,
  }));
}

async function getMonthlyTrend(years?: number[]) {
  const conditions = [
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
  ];
  if (years && years.length > 0) {
    conditions.push(inArray(transactions.year, years));
  }

  const rows = await db
    .select({
      year: transactions.year,
      month: transactions.month,
      totalExpense: sql<number>`sum(expense_amount)`,
      totalIncome: sql<number>`sum(income_amount)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.year, transactions.month)
    .orderBy(transactions.year, transactions.month);

  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    totalIncome: Number(r.totalIncome ?? 0),
    totalExpense: Number(r.totalExpense ?? 0),
    netIncome: Number(r.totalIncome ?? 0) - Number(r.totalExpense ?? 0),
  }));
}

async function getCategoryTrend(category: string) {
  const rows = await db
    .select({
      year: transactions.year,
      month: transactions.month,
      total: sql<number>`sum(expense_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.category, category),
        eq(transactions.excludeFromPl, false),
        eq(transactions.type, "支出")
      )
    )
    .groupBy(transactions.year, transactions.month)
    .orderBy(transactions.year, transactions.month);

  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    total: Number(r.total ?? 0),
  }));
}

async function getAssetTrend(year?: number) {
  const conditions = year ? [eq(assetSnapshots.year, year)] : [];

  const rows = await db
    .select()
    .from(assetSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(assetSnapshots.year, assetSnapshots.month, assetSnapshots.assetName);

  return rows;
}

async function getPaymentMethodBreakdown(year: number, month?: number) {
  const conditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (month) conditions.push(eq(transactions.month, month));

  const rows = await db
    .select({
      assetName: transactions.assetName,
      total: sql<number>`sum(expense_amount)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.assetName)
    .orderBy(sql`sum(expense_amount) desc`);

  const grandTotal = rows.reduce((sum, r) => sum + Number(r.total ?? 0), 0);
  return rows.map((r) => ({
    assetName: r.assetName ?? "不明",
    total: Number(r.total ?? 0),
    count: Number(r.count ?? 0),
    ratio: grandTotal > 0 ? Math.round((Number(r.total ?? 0) / grandTotal) * 1000) / 10 : 0,
  }));
}

async function getTopItems(year: number, month?: number, limit = 20) {
  const conditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (month) conditions.push(eq(transactions.month, month));

  const rows = await db
    .select({
      category: transactions.category,
      itemName: transactions.itemName,
      total: sql<number>`sum(expense_amount)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(...conditions))
    .groupBy(transactions.category, transactions.itemName)
    .orderBy(sql`sum(expense_amount) desc`)
    .limit(limit);

  return rows.map((r) => ({
    category: r.category,
    itemName: r.itemName ?? "",
    total: Number(r.total ?? 0),
    count: Number(r.count ?? 0),
  }));
}
