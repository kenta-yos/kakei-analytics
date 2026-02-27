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
import { eq, and, inArray, sql, ne, desc } from "drizzle-orm";

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
        const data = await getAssetTrend(year ?? undefined, month ?? undefined);
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

      case "past_year_summary": {
        const data = await getPastYearSummary();
        return NextResponse.json({ data });
      }

      case "net_asset_trend": {
        const years = yearsParam?.split(",").map(Number).filter(Boolean);
        const data = await getNetAssetTrend(years);
        return NextResponse.json({ data });
      }

      case "compare": {
        const p1Year = searchParams.get("p1_year") ? parseInt(searchParams.get("p1_year")!) : null;
        const p1Month = searchParams.get("p1_month") ? parseInt(searchParams.get("p1_month")!) : null;
        const p2Year = searchParams.get("p2_year") ? parseInt(searchParams.get("p2_year")!) : null;
        const p2Month = searchParams.get("p2_month") ? parseInt(searchParams.get("p2_month")!) : null;
        if (!p1Year || !p2Year) return NextResponse.json({ error: "year が必要です" }, { status: 400 });
        const data = await getComparisonData(p1Year, p1Month ?? undefined, p2Year, p2Month ?? undefined);
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
    ne(transactions.category, "振替"),
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
    ne(transactions.category, "振替"),
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
        ne(transactions.type, "振替"),
        ne(transactions.category, "振替"),
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

async function getAssetTrend(year?: number, month?: number) {
  if (year && month) {
    // 各資産について「指定年月以前の最新スナップショット」を返す
    // → 月に取引がなかった口座も最後に記録された残高で表示できる
    const rows = await db.execute(
      sql`
        SELECT DISTINCT ON (asset_name)
          id, asset_name, year, month,
          opening_balance, closing_balance, asset_type, updated_at
        FROM asset_snapshots
        WHERE (year * 100 + month) <= ${year * 100 + month}
        ORDER BY asset_name, (year * 100 + month) DESC
      `
    );
    // 生SQLはsnake_caseで返るので camelCase に変換
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (rows.rows as any[]).map((r) => ({
      id: r.id,
      assetName: r.asset_name,
      year: Number(r.year),
      month: Number(r.month),
      openingBalance: Number(r.opening_balance),
      closingBalance: Number(r.closing_balance),
      assetType: r.asset_type,
      updatedAt: r.updated_at,
    }));
  }

  // year のみ指定: その年の全月分を返す（推移グラフ用）
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
    ne(transactions.category, "振替"),
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

async function getNetAssetTrend(years?: number[]) {
  const conditions = years && years.length > 0 ? [inArray(assetSnapshots.year, years)] : [];
  const rows = await db
    .select({
      year: assetSnapshots.year,
      month: assetSnapshots.month,
      netAssets: sql<number>`SUM(closing_balance)`,
    })
    .from(assetSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(assetSnapshots.year, assetSnapshots.month)
    .orderBy(assetSnapshots.year, assetSnapshots.month);

  return rows.map((r) => ({
    year: r.year,
    month: r.month,
    netAssets: Number(r.netAssets ?? 0),
  }));
}

/** カテゴリ別に高額順上位 N 件の取引を返す（Gemini コンテキスト用） */
async function getTopTransactionsByCategory(year: number, month?: number, limitPerCat = 5) {
  const conditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    ne(transactions.category, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (month) conditions.push(eq(transactions.month, month));

  const rows = await db
    .select({
      category: transactions.category,
      itemName: transactions.itemName,
      expenseAmount: transactions.expenseAmount,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.expenseAmount));

  const byCategory = new Map<string, Array<{ itemName: string; amount: number; date: string }>>();
  for (const row of rows) {
    const cat = row.category;
    const list = byCategory.get(cat) ?? [];
    if (list.length < limitPerCat) {
      list.push({ itemName: row.itemName ?? "", amount: Number(row.expenseAmount), date: row.date });
      byCategory.set(cat, list);
    }
  }
  return byCategory;
}

async function getComparisonData(
  p1Year: number, p1Month: number | undefined,
  p2Year: number, p2Month: number | undefined
) {
  const [data1, data2, topTx1, topTx2] = await Promise.all([
    getCategoryBreakdown(p1Year, p1Month),
    getCategoryBreakdown(p2Year, p2Month),
    getTopTransactionsByCategory(p1Year, p1Month),
    getTopTransactionsByCategory(p2Year, p2Month),
  ]);
  const allCategories = [...new Set([...data1.map((r) => r.category), ...data2.map((r) => r.category)])];
  const data1Map = new Map(data1.map((r) => [r.category, r.total]));
  const data2Map = new Map(data2.map((r) => [r.category, r.total]));
  const comparison = allCategories.map((cat) => {
    const a1 = data1Map.get(cat) ?? 0;
    const a2 = data2Map.get(cat) ?? 0;
    const diff = a2 - a1;
    return {
      category: cat,
      amount1: a1,
      amount2: a2,
      diff,
      diffPct: a1 > 0 ? Math.round((diff / a1) * 100) : null,
      topTransactions1: topTx1.get(cat) ?? [],
      topTransactions2: topTx2.get(cat) ?? [],
    };
  }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return {
    comparison,
    summary: {
      total1: data1.reduce((s, r) => s + r.total, 0),
      total2: data2.reduce((s, r) => s + r.total, 0),
    },
  };
}

async function getPastYearSummary() {
  // 本日から過去12ヶ月の範囲を計算
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  const toYear = now.getFullYear();
  const toMonth = now.getMonth() + 1;
  // 12ヶ月前の年月
  const fromDate = new Date(now);
  fromDate.setMonth(fromDate.getMonth() - 11);
  const fromYear = fromDate.getFullYear();
  const fromMonth = fromDate.getMonth() + 1;

  const rows = await db
    .select({
      category: transactions.category,
      year: transactions.year,
      month: transactions.month,
      total: sql<number>`sum(expense_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.excludeFromPl, false),
        ne(transactions.type, "振替"),
        ne(transactions.category, "振替"),
        eq(transactions.type, "支出"),
        sql`(year * 100 + month) >= ${fromYear * 100 + fromMonth}`,
        sql`(year * 100 + month) <= ${toYear * 100 + toMonth}`
      )
    )
    .groupBy(transactions.category, transactions.year, transactions.month);

  // カテゴリ別に月合計を集計
  const categoryMonthlyMap = new Map<string, number[]>();
  for (const r of rows) {
    if (!categoryMonthlyMap.has(r.category)) {
      categoryMonthlyMap.set(r.category, []);
    }
    categoryMonthlyMap.get(r.category)!.push(Number(r.total ?? 0));
  }

  // 月数（最大12）
  const totalMonths = 12;

  // カテゴリ別の月平均・総合計を計算
  const categoryTotals: { category: string; monthlyAvg: number; total: number }[] = [];
  let grandTotal = 0;
  for (const [category, monthlyAmounts] of categoryMonthlyMap.entries()) {
    const total = monthlyAmounts.reduce((s, v) => s + v, 0);
    const monthlyAvg = Math.round(total / totalMonths);
    categoryTotals.push({ category, monthlyAvg, total });
    grandTotal += total;
  }

  return categoryTotals
    .sort((a, b) => b.total - a.total)
    .map((r) => ({
      category: r.category,
      monthlyAvg: r.monthlyAvg,
      total: r.total,
      ratio: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0,
    }));
}

async function getTopItems(year: number, month?: number, limit = 20) {
  const baseConditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    ne(transactions.category, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (month) baseConditions.push(eq(transactions.month, month));

  // 名称あり: (category, itemName) でグループ集計
  const namedRows = await db
    .select({
      category: transactions.category,
      itemName: transactions.itemName,
      total: sql<number>`sum(expense_amount)`,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(and(...baseConditions, sql`item_name IS NOT NULL AND item_name != ''`))
    .groupBy(transactions.category, transactions.itemName)
    .orderBy(sql`sum(expense_amount) desc`)
    .limit(limit);

  // 名称なし: 個別取引をそのまま取得（合算しない）
  const unnamedRows = await db
    .select({
      category: transactions.category,
      itemName: transactions.itemName,
      total: transactions.expenseAmount,
      count: sql<number>`1`,
    })
    .from(transactions)
    .where(and(...baseConditions, sql`(item_name IS NULL OR item_name = '')`))
    .orderBy(desc(transactions.expenseAmount))
    .limit(limit);

  // 結合して再ソート
  const combined = [
    ...namedRows.map((r) => ({
      category: r.category,
      itemName: r.itemName ?? "",
      total: Number(r.total ?? 0),
      count: Number(r.count ?? 0),
    })),
    ...unnamedRows.map((r) => ({
      category: r.category,
      itemName: "",
      total: Number(r.total ?? 0),
      count: 1,
    })),
  ]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return combined;
}
