"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils";

type Transaction = {
  id: number;
  date: string;
  itemName: string;
  category: string;
  expenseAmount: number;
  incomeAmount: number;
  paymentMethod: string | null;
};

type DrilldownPeriod =
  | { type: "monthly"; year: number; month: number }
  | { type: "quarterly"; year: number; quarter: number }
  | { type: "yearly"; year: number };

type MonthlySummary = {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  categories?: Record<string, { expense: number; income: number; count: number }>;
};

type CategorySummary = {
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  categories: Record<string, { expense: number; income: number; count: number }>;
};

type QuarterRow = {
  quarter: number;
  income: number;
  expense: number;
};

export default function PLPage() {
  const now = new Date();
  const [mode, setMode] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [monthlyData, setMonthlyData] = useState<MonthlySummary[]>([]);
  const [monthDetail, setMonthDetail] = useState<MonthlySummary | null>(null);
  const [yearCategories, setYearCategories] = useState<CategorySummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "monthly") {
        const res = await fetch(`/api/summary?year=${year}&month=${month}`);
        const json = await res.json();
        setMonthDetail(json.data);
        setMonthlyData([]);
        setYearCategories(null);
      } else {
        const res = await fetch(`/api/summary?year=${year}`);
        const json = await res.json();
        setMonthlyData(json.data ?? []);
        setYearCategories(json.yearCategories ?? null);
        setMonthDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const yearTotal = monthlyData.reduce(
    (acc, d) => ({ income: acc.income + d.totalIncome, expense: acc.expense + d.totalExpense }),
    { income: 0, expense: 0 }
  );

  const quarterRows: QuarterRow[] = [1, 2, 3, 4].map((q) => {
    const qMonths = monthlyData.filter((d) => Math.ceil(d.month / 3) === q);
    return {
      quarter: q,
      income: qMonths.reduce((s, d) => s + d.totalIncome, 0),
      expense: qMonths.reduce((s, d) => s + d.totalExpense, 0),
    };
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">損益計算書</h1>
          <p className="text-slate-400 text-sm mt-0.5">振替・除外項目を除いた実際の収支（投資損益含む）</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(["monthly", "quarterly", "yearly"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${mode === m ? "bg-blue-600 text-white" : "text-slate-400"}`}>
                {m === "monthly" ? "月次" : m === "quarterly" ? "四半期" : "年次"}
              </button>
            ))}
          </div>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
            {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          {mode === "monthly" && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">読み込み中...</p>
      ) : mode === "monthly" && monthDetail ? (
        <PeriodPL summary={monthDetail} label={`${year}年${month}月`} year={year} month={month} />
      ) : mode === "quarterly" ? (
        <QuarterlyPL year={year} quarterRows={quarterRows} yearTotal={yearTotal} />
      ) : mode === "yearly" ? (
        <YearlyPL monthlyData={monthlyData} year={year} yearTotal={yearTotal} yearCategories={yearCategories} />
      ) : null}
    </div>
  );
}

/** カテゴリ別収支テーブル（月次・四半期・年次で共用） */
function CategoryBreakdown({ summary, label, period }: { summary: CategorySummary; label: string; period: DrilldownPeriod }) {
  const [selected, setSelected] = useState<{ cat: string; side: "expense" | "income" } | null>(null);
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setTxLoading(true);
    const params = new URLSearchParams({ category: selected.cat, limit: "200" });
    params.set("year", String(period.year));
    if (period.type === "monthly") params.set("month", String(period.month));
    if (period.type === "quarterly") params.set("quarter", String(period.quarter));
    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((j) => setTxns((j.data ?? []) as Transaction[]))
      .finally(() => setTxLoading(false));
  }, [selected, period]);

  const toggle = (cat: string, side: "expense" | "income") => {
    setSelected((prev) => (prev?.cat === cat && prev.side === side ? null : { cat, side }));
  };

  const categories = summary.categories ?? {};
  const expenseCats = Object.entries(categories).filter(([, v]) => v.expense > 0).sort((a, b) => b[1].expense - a[1].expense);
  const incomeCats = Object.entries(categories).filter(([, v]) => v.income > 0).sort((a, b) => b[1].income - a[1].income);

  const drilldownTxns = selected
    ? txns.filter((t) => selected.side === "expense" ? t.expenseAmount !== 0 : t.incomeAmount !== 0)
    : [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle>{label} 支出明細</CardTitle>
          <table className="data-table">
            <thead><tr><th>カテゴリ</th><th className="text-right">金額</th><th className="text-right">件数</th></tr></thead>
            <tbody>
              {expenseCats.map(([cat, v]) => {
                const isOpen = selected?.cat === cat && selected.side === "expense";
                return (
                  <tr key={cat}
                    onClick={() => toggle(cat, "expense")}
                    className={`cursor-pointer hover:bg-slate-800/50 transition ${isOpen ? "bg-slate-800/60" : ""}`}>
                    <td className={`${isOpen ? "text-blue-300" : "text-slate-300"}`}>{cat}</td>
                    <td className="text-right text-red-300">{formatCurrency(v.expense)}</td>
                    <td className="text-right text-slate-500 text-xs">{v.count}件</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="text-white">合計</td>
                <td className="text-right text-red-400">{formatCurrency(summary.totalExpense)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>{label} 収入明細</CardTitle>
          <table className="data-table">
            <thead><tr><th>カテゴリ</th><th className="text-right">金額</th><th className="text-right">件数</th></tr></thead>
            <tbody>
              {incomeCats.map(([cat, v]) => {
                const isOpen = selected?.cat === cat && selected.side === "income";
                return (
                  <tr key={cat}
                    onClick={() => toggle(cat, "income")}
                    className={`cursor-pointer hover:bg-slate-800/50 transition ${isOpen ? "bg-slate-800/60" : ""}`}>
                    <td className={`${isOpen ? "text-blue-300" : "text-slate-300"}`}>{cat}</td>
                    <td className="text-right text-green-300">{formatCurrency(v.income)}</td>
                    <td className="text-right text-slate-500 text-xs">{v.count}件</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="text-white">合計</td>
                <td className="text-right text-green-400">{formatCurrency(summary.totalIncome)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>

      {/* ドリルダウンパネル */}
      {selected && (
        <Card>
          <div className="flex justify-between items-center mb-3">
            <CardTitle>{selected.cat}の取引明細</CardTitle>
            <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-300 text-sm">✕ 閉じる</button>
          </div>
          {txLoading ? (
            <p className="text-slate-500 text-sm">読み込み中...</p>
          ) : drilldownTxns.length === 0 ? (
            <p className="text-slate-500 text-sm">取引がありません</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>日付</th>
                  <th>内容</th>
                  <th className="text-right">金額</th>
                  <th className="hidden sm:table-cell">支払方法</th>
                </tr>
              </thead>
              <tbody>
                {drilldownTxns
                  .sort((a, b) => (selected.side === "expense" ? b.expenseAmount - a.expenseAmount : b.incomeAmount - a.incomeAmount))
                  .map((t) => (
                    <tr key={t.id}>
                      <td className="text-slate-400 whitespace-nowrap">{t.date.slice(0, 10)}</td>
                      <td className="text-slate-300">{t.itemName}</td>
                      <td className={`text-right font-medium ${selected.side === "expense" ? "text-red-300" : "text-green-300"}`}>
                        {formatCurrency(selected.side === "expense" ? t.expenseAmount : t.incomeAmount)}
                      </td>
                      <td className="hidden sm:table-cell text-slate-500 text-xs">{t.paymentMethod ?? "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}

/** 月次・四半期・年次共用の収支KPIカード */
function KpiCards({ income, expense, label }: { income: number; expense: number; label: string }) {
  const net = income - expense;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
      <Card>
        <CardTitle>{label} 収入合計</CardTitle>
        <p className="text-xl sm:text-2xl font-bold text-green-400">{formatCurrency(income)}</p>
      </Card>
      <Card>
        <CardTitle>{label} 支出合計</CardTitle>
        <p className="text-xl sm:text-2xl font-bold text-red-400">{formatCurrency(expense)}</p>
      </Card>
      <Card>
        <CardTitle>{label} 純損益</CardTitle>
        <p className={`text-xl sm:text-2xl font-bold ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
          {formatCurrencySigned(net)}
        </p>
      </Card>
    </div>
  );
}

/** 月次 */
function PeriodPL({ summary, label, year, month }: { summary: MonthlySummary; label: string; year: number; month: number }) {
  const period: DrilldownPeriod = { type: "monthly", year, month };
  return (
    <div className="space-y-4">
      <KpiCards income={summary.totalIncome} expense={summary.totalExpense} label={label} />
      {summary.categories && <CategoryBreakdown summary={summary as CategorySummary} label={label} period={period} />}
    </div>
  );
}

/** 四半期 */
function QuarterlyPL({ year, quarterRows, yearTotal }: {
  year: number;
  quarterRows: QuarterRow[];
  yearTotal: { income: number; expense: number };
}) {
  const now = new Date();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);
  const [selectedQ, setSelectedQ] = useState(currentQ);
  const [detail, setDetail] = useState<CategorySummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/summary?year=${year}&quarter=${selectedQ}`)
      .then((r) => r.json())
      .then((json) => setDetail(json.data ?? null))
      .finally(() => setDetailLoading(false));
  }, [year, selectedQ]);

  const qRow = quarterRows.find((q) => q.quarter === selectedQ);
  const qLabel = `${year}年Q${selectedQ}`;

  return (
    <div className="space-y-4">
      {/* Q1〜Q4タブ */}
      <div className="flex bg-slate-800 rounded-lg p-0.5 w-fit">
        {[1, 2, 3, 4].map((q) => (
          <button key={q} onClick={() => setSelectedQ(q)}
            className={`px-4 py-1.5 text-sm rounded-md transition ${selectedQ === q ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
            Q{q}
          </button>
        ))}
      </div>

      {/* 選択四半期のKPI */}
      {qRow && (
        <KpiCards income={qRow.income} expense={qRow.expense} label={qLabel} />
      )}

      {/* カテゴリ内訳 */}
      {detailLoading ? (
        <p className="text-slate-500 text-sm">読み込み中...</p>
      ) : detail ? (
        <CategoryBreakdown summary={detail} label={qLabel} period={{ type: "quarterly", year, quarter: selectedQ }} />
      ) : null}

      {/* 四半期サマリーテーブル */}
      <Card>
        <CardTitle>{year}年 四半期別損益</CardTitle>
        <table className="data-table">
          <thead>
            <tr>
              <th>期間</th>
              <th className="text-right">収入</th>
              <th className="text-right">支出</th>
              <th className="text-right">純損益</th>
            </tr>
          </thead>
          <tbody>
            {quarterRows.map((q) => {
              const net = q.income - q.expense;
              return (
                <tr key={q.quarter}
                  onClick={() => setSelectedQ(q.quarter)}
                  className={`cursor-pointer hover:bg-slate-800/50 transition ${selectedQ === q.quarter ? "bg-slate-800/60" : ""}`}>
                  <td className={`font-medium ${selectedQ === q.quarter ? "text-blue-300" : "text-slate-300"}`}>
                    Q{q.quarter} ({(q.quarter - 1) * 3 + 1}〜{q.quarter * 3}月)
                  </td>
                  <td className="text-right text-green-400">{q.income > 0 ? formatCurrency(q.income) : "—"}</td>
                  <td className="text-right text-red-400">{q.expense > 0 ? formatCurrency(q.expense) : "—"}</td>
                  <td className={`text-right font-medium ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {q.income + q.expense > 0 ? formatCurrencySigned(net) : "—"}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold border-t border-slate-700">
              <td className="text-white">合計</td>
              <td className="text-right text-green-400">{formatCurrency(yearTotal.income)}</td>
              <td className="text-right text-red-400">{formatCurrency(yearTotal.expense)}</td>
              <td className={`text-right ${yearTotal.income - yearTotal.expense >= 0 ? "text-green-400" : "text-red-400"}`}>
                {formatCurrencySigned(yearTotal.income - yearTotal.expense)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/** 年次 */
function YearlyPL({ monthlyData, year, yearTotal, yearCategories }: {
  monthlyData: MonthlySummary[];
  year: number;
  yearTotal: { income: number; expense: number };
  yearCategories: CategorySummary | null;
}) {
  const net = yearTotal.income - yearTotal.expense;
  return (
    <div className="space-y-4">
      <KpiCards income={yearTotal.income} expense={yearTotal.expense} label={`${year}年`} />

      {/* カテゴリ別集計 */}
      {yearCategories && (
        <CategoryBreakdown summary={yearCategories} label={`${year}年`} period={{ type: "yearly", year }} />
      )}

      {/* 月別テーブル */}
      <Card>
        <CardTitle>月別損益</CardTitle>
        <table className="data-table">
          <thead>
            <tr>
              <th>月</th>
              <th className="text-right">収入</th>
              <th className="text-right">支出</th>
              <th className="text-right">純損益</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((d) => (
              <tr key={d.month}>
                <td className="text-slate-400">{d.month}月</td>
                <td className="text-right text-green-400">{formatCurrency(d.totalIncome)}</td>
                <td className="text-right text-red-400">{formatCurrency(d.totalExpense)}</td>
                <td className={`text-right font-medium ${d.netIncome >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {formatCurrencySigned(d.netIncome)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold border-t border-slate-700">
              <td className="text-white">合計</td>
              <td className="text-right text-green-400">{formatCurrency(yearTotal.income)}</td>
              <td className="text-right text-red-400">{formatCurrency(yearTotal.expense)}</td>
              <td className={`text-right ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
                {formatCurrencySigned(net)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
