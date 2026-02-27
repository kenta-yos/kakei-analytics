/**
 * 決算レポート API
 * GET /api/report?type=annual&year=2025    → 年次決算サマリー
 * GET /api/report?type=quarterly&year=2025 → 四半期別サマリー
 * GET /api/report?type=analysis&year=2025&period=annual|quarterly → 保存済み定性レポート
 * POST /api/report { action:"generate_analysis", year, period }  → Gemini定性分析を生成・保存
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, assetSnapshots, reportAnalyses } from "@/lib/schema";
import { eq, and, sql, ne, inArray, desc } from "drizzle-orm";
import { analyzeWithGemini } from "@/lib/gemini";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "annual";
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  try {
    if (type === "analysis") {
      const period = searchParams.get("period") ?? "annual";
      const rows = await db
        .select()
        .from(reportAnalyses)
        .where(
          and(
            eq(reportAnalyses.year, year),
            eq(reportAnalyses.reportType, period)
          )
        );
      return NextResponse.json({ data: rows[0] ?? null });
    }

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, year, period } = body as {
      action: string;
      year: number;
      period: "annual" | "quarterly";
    };

    if (action !== "generate_analysis") {
      return NextResponse.json({ error: "不明な action です" }, { status: 400 });
    }

    // 既存の分析がある場合はスキップ
    const existing = await db
      .select()
      .from(reportAnalyses)
      .where(
        and(
          eq(reportAnalyses.year, year),
          eq(reportAnalyses.reportType, period)
        )
      );
    if (existing.length > 0) {
      return NextResponse.json({ data: existing[0], alreadyExists: true });
    }

    // データを取得してプロンプト用コンテキストを構築
    const context = period === "annual"
      ? await buildAnnualContext(year)
      : await buildQuarterlyContext(year);

    const periodLabel = period === "annual" ? "年次" : "四半期別";
    const prompt = `以下は${year}年の家計${periodLabel}決算データです。このデータをもとに、企業の決算発表のような定性的な分析レポートを日本語で作成してください。

## 作成要件
- 企業アナリストが株主向けに書く決算レポートのようなトーンと格調ある文体で
- 数字の羅列ではなく、データから読み取れる定性的な意味・背景・コンテキストを重視
- 良い点・悪い点の両方を客観的に述べる
- 家計管理の専門家として、実用的で実行可能な洞察と提言を含める

## 構成（マークダウン形式で出力）

### 総評
その年/期を象徴するひとことから始め、全体の傾向を2〜3段落で述べる

### 収支トピックス
その年/期に特筆すべき収支の動き（3〜5点を箇条書き）

### 支出構造の分析
主要カテゴリの傾向・特に大きい・変化した・注目すべきカテゴリを考察

### リスク・懸念点
支出面や資産面での懸念、改善余地のある領域

### 来期への提言
具体的かつ実行可能な改善提案（3点）`;

    const result = await analyzeWithGemini({ context, prompt });

    if (!result.success || !result.text) {
      return NextResponse.json(
        { error: result.error ?? "Gemini分析に失敗しました" },
        { status: 500 }
      );
    }

    // DBに保存
    const saved = await db
      .insert(reportAnalyses)
      .values({ year, reportType: period, analysis: result.text })
      .returning();

    return NextResponse.json({ data: saved[0], usage: result.usage });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "分析の生成に失敗しました" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────
// 取引明細ヘルパー（Gemini コンテキスト用）
// ──────────────────────────────────────────────

/** 期間内の支出カテゴリ別上位取引 */
async function getTopTransactionsForPeriod(
  year: number,
  months?: number[],
  limitPerCat = 5,
  topCatCount = 10
) {
  const conditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    ne(transactions.category, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (months && months.length > 0) conditions.push(inArray(transactions.month, months));

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

  // カテゴリ合計を算出
  const catTotals = new Map<string, number>();
  for (const r of rows) {
    catTotals.set(r.category, (catTotals.get(r.category) ?? 0) + Number(r.expenseAmount));
  }

  // 合計上位 topCatCount カテゴリを選択
  const topCats = new Set(
    Array.from(catTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topCatCount)
      .map(([cat]) => cat)
  );

  // カテゴリ別に上位 limitPerCat 件を収集
  const catMap = new Map<string, Array<{ 日付: string; 項目: string; 金額: number }>>();
  for (const r of rows) {
    if (!topCats.has(r.category)) continue;
    const list = catMap.get(r.category) ?? [];
    if (list.length < limitPerCat) {
      list.push({ 日付: r.date, 項目: r.itemName ?? "(項目名なし)", 金額: Number(r.expenseAmount) });
      catMap.set(r.category, list);
    }
  }

  const result: Record<string, { 合計: number; 取引明細: Array<{ 日付: string; 項目: string; 金額: number }> }> = {};
  for (const cat of topCats) {
    result[cat] = { 合計: catTotals.get(cat) ?? 0, 取引明細: catMap.get(cat) ?? [] };
  }
  return result;
}

/** 期間内の高額支出 TOP N */
async function getHighExpenseTransactions(year: number, months?: number[], limit = 20) {
  const conditions = [
    eq(transactions.year, year),
    eq(transactions.excludeFromPl, false),
    ne(transactions.type, "振替"),
    ne(transactions.category, "振替"),
    eq(transactions.type, "支出"),
  ];
  if (months && months.length > 0) conditions.push(inArray(transactions.month, months));

  const rows = await db
    .select({
      category: transactions.category,
      itemName: transactions.itemName,
      expenseAmount: transactions.expenseAmount,
      date: transactions.date,
    })
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.expenseAmount))
    .limit(limit);

  return rows.map((r) => ({
    日付: r.date,
    カテゴリ: r.category,
    項目: r.itemName ?? "(項目名なし)",
    金額: Number(r.expenseAmount),
  }));
}

// ──────────────────────────────────────────────
// Gemini コンテキスト構築
// ──────────────────────────────────────────────
async function buildAnnualContext(year: number): Promise<string> {
  const [data, categoryTx, highExpenses] = await Promise.all([
    getAnnualReport(year),
    getTopTransactionsForPeriod(year, undefined, 5, 10),
    getHighExpenseTransactions(year, undefined, 20),
  ]);
  return JSON.stringify({
    year: data.year,
    収入: { 当年: data.income.current, 前年: data.income.prev, 前年比: data.income.yoy },
    支出: { 当年: data.expense.current, 前年: data.expense.prev, 前年比: data.expense.yoy },
    純損益貯蓄額: { 当年: data.netIncome.current, 前年: data.netIncome.prev },
    貯蓄率: { 当年: data.savingsRate.current, 前年: data.savingsRate.prev },
    純資産: {
      期首: data.netAsset.start,
      期末: data.netAsset.end,
      増減: data.netAsset.change,
      前年末: data.netAsset.prevEnd,
      前年比: data.netAsset.yoy,
    },
    月別収支: data.monthly,
    支出カテゴリランキング: data.categories.slice(0, 15),
    ハイライト: data.highlights,
    カテゴリ別取引明細_上位10カテゴリ各5件: categoryTx,
    年間高額支出TOP20: highExpenses,
  }, null, 2);
}

async function buildQuarterlyContext(year: number): Promise<string> {
  const data = await getQuarterlyReport(year);

  // 各四半期の取引明細を並列取得
  const quarterTxResults = await Promise.all(
    QUARTERS.map((qDef) =>
      Promise.all([
        getTopTransactionsForPeriod(year, qDef.months, 3, 5),
        getHighExpenseTransactions(year, qDef.months, 10),
      ])
    )
  );

  return JSON.stringify({
    year: data.year,
    四半期別: data.quarters.map((q, i) => {
      const [catTx, highExp] = quarterTxResults[i];
      return {
        期間: q.label,
        収入: q.income,
        支出: q.expense,
        純損益: q.netIncome,
        貯蓄率: q.savingsRate,
        四半期末純資産: q.netAsset,
        前年同期比収入: q.yoy.income,
        前年同期比支出: q.yoy.expense,
        支出TOP5カテゴリ: q.topCategories,
        カテゴリ別取引明細_上位5カテゴリ各3件: catTx,
        高額支出TOP10: highExp,
      };
    }),
    月別詳細: data.monthly,
  }, null, 2);
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
