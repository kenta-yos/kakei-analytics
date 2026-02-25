import { db } from "@/lib/db";
import { transactions, budgets, assetSnapshots } from "@/lib/schema";
import { eq, and, sql, ne, desc } from "drizzle-orm";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils";
import Link from "next/link";

export const revalidate = 0;

async function getDashboardData() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 当月収支
  const [monthlySummary] = await db
    .select({
      totalIncome: sql<number>`sum(income_amount)`,
      totalExpense: sql<number>`sum(expense_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.year, year),
        eq(transactions.month, month),
        eq(transactions.excludeFromPl, false),
        ne(transactions.type, "振替")
      )
    );

  // 当月カテゴリ別支出
  const categoryExpenses = await db
    .select({
      category: transactions.category,
      total: sql<number>`sum(expense_amount)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.year, year),
        eq(transactions.month, month),
        eq(transactions.excludeFromPl, false),
        eq(transactions.type, "支出"),
        ne(transactions.type, "振替")
      )
    )
    .groupBy(transactions.category)
    .orderBy(sql`sum(expense_amount) desc`)
    .limit(8);

  // 当月予算
  const budgetRows = await db
    .select()
    .from(budgets)
    .where(and(eq(budgets.year, year), eq(budgets.month, month)));

  // 最新の資産スナップショット
  const latestAssets = await db
    .select()
    .from(assetSnapshots)
    .where(and(eq(assetSnapshots.year, year), eq(assetSnapshots.month, month - 1 || month)))
    .orderBy(desc(assetSnapshots.closingBalance));

  // 最近の取引（5件）
  const recentTx = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.year, year), eq(transactions.month, month)))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(5);

  return {
    year,
    month,
    totalIncome: Number(monthlySummary?.totalIncome ?? 0),
    totalExpense: Number(monthlySummary?.totalExpense ?? 0),
    categoryExpenses,
    budgetRows,
    latestAssets,
    recentTx,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();
  const netIncome = data.totalIncome - data.totalExpense;

  const totalAssets = data.latestAssets
    .filter((a) => a.assetType !== "credit" && a.closingBalance > 0)
    .reduce((sum, a) => sum + a.closingBalance, 0);

  const totalLiabilities = data.latestAssets
    .filter((a) => a.assetType === "credit")
    .reduce((sum, a) => sum + Math.abs(a.closingBalance), 0);

  return (
    <div className="p-4 sm:p-6">
      {/* ヘッダー */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">{data.year}年{data.month}月</h1>
          <p className="text-slate-400 text-sm mt-0.5">ダッシュボード</p>
        </div>
        <Link
          href="/budget"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition"
        >
          予算管理 →
        </Link>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardTitle>収入</CardTitle>
          <p className="text-xl sm:text-2xl font-bold text-green-400">{formatCurrency(data.totalIncome)}</p>
        </Card>
        <Card>
          <CardTitle>支出</CardTitle>
          <p className="text-xl sm:text-2xl font-bold text-red-400">{formatCurrency(data.totalExpense)}</p>
        </Card>
        <Card>
          <CardTitle>収支</CardTitle>
          <p className={`text-xl sm:text-2xl font-bold ${netIncome >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrencySigned(netIncome)}
          </p>
        </Card>
        <Card>
          <CardTitle>純資産（推定）</CardTitle>
          <p className="text-xl sm:text-2xl font-bold text-blue-400">
            {formatCurrency(totalAssets - totalLiabilities)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* カテゴリ別支出 */}
        <Card>
          <CardTitle>カテゴリ別支出（当月）</CardTitle>
          <div className="space-y-2">
            {data.categoryExpenses.length === 0 && (
              <p className="text-slate-500 text-sm">データがありません</p>
            )}
            {data.categoryExpenses.map((c) => {
              const budget = data.budgetRows.find((b) => b.categoryName === c.category);
              const total = Number(c.total ?? 0);
              const budgetAmt = budget?.totalBudget ?? 0;
              const pct = budgetAmt > 0 ? Math.min((total / budgetAmt) * 100, 100) : 0;
              const over = budgetAmt > 0 && total > budgetAmt;
              return (
                <div key={c.category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-300">{c.category}</span>
                    <span className={over ? "text-red-400" : "text-slate-300"}>
                      {formatCurrency(total)}
                      {budgetAmt > 0 && (
                        <span className="text-slate-500 ml-1">/ {formatCurrency(budgetAmt)}</span>
                      )}
                    </span>
                  </div>
                  {budgetAmt > 0 && (
                    <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-blue-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Link href="/budget" className="block mt-4 text-xs text-blue-400 hover:text-blue-300">
            予算を設定する →
          </Link>
        </Card>

        {/* 最近の取引 */}
        <Card>
          <CardTitle>最近の取引</CardTitle>
          <div className="space-y-1">
            {data.recentTx.length === 0 && (
              <p className="text-slate-500 text-sm">データがありません。CSVをインポートしてください。</p>
            )}
            {data.recentTx.map((tx) => (
              <div key={tx.id} className="flex justify-between items-center py-1.5 border-b border-slate-800 last:border-0">
                <div>
                  <span className="text-xs text-slate-500 mr-2">{tx.date}</span>
                  <span className="text-sm text-slate-300">{tx.itemName || tx.category}</span>
                  <span className="text-xs text-slate-500 ml-2">{tx.category}</span>
                </div>
                <span className={`text-sm font-medium ${tx.type === "収入" ? "text-green-400" : "text-red-400"}`}>
                  {tx.type === "収入" ? "+" : "-"}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </div>
          <Link href="/transactions" className="block mt-3 text-xs text-blue-400 hover:text-blue-300">
            すべての取引を見る →
          </Link>
        </Card>
      </div>

      {/* 資産サマリー */}
      {data.latestAssets.length > 0 && (
        <Card>
          <CardTitle>資産概況</CardTitle>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {data.latestAssets.slice(0, 8).map((a) => (
              <div key={a.id} className="bg-slate-800 rounded-lg p-3">
                <p className="text-xs text-slate-500 truncate">{a.assetName}</p>
                <p className={`text-sm font-semibold mt-0.5 ${a.closingBalance < 0 ? "text-red-400" : "text-white"}`}>
                  {formatCurrency(a.closingBalance)}
                </p>
                <p className="text-xs text-slate-600 mt-0.5">{a.assetType}</p>
              </div>
            ))}
          </div>
          <Link href="/balance-sheet" className="block mt-3 text-xs text-blue-400 hover:text-blue-300">
            貸借対照表を見る →
          </Link>
        </Card>
      )}

      {data.recentTx.length === 0 && (
        <Card className="mt-4 border-blue-800/50 bg-blue-950/30">
          <p className="text-blue-300 text-sm">
            まずは <Link href="/import" className="underline font-semibold">CSVをインポート</Link> してデータを取り込んでください。
          </p>
        </Card>
      )}
    </div>
  );
}
