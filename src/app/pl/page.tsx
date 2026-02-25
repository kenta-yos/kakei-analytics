"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils";

type MonthlySummary = {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
  categories?: Record<string, { expense: number; income: number; count: number }>;
};

export default function PLPage() {
  const now = new Date();
  const [mode, setMode] = useState<"monthly" | "yearly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<MonthlySummary[]>([]);
  const [detail, setDetail] = useState<MonthlySummary | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "monthly") {
        const res = await fetch(`/api/summary?year=${year}&month=${month}`);
        const json = await res.json();
        setDetail(json.data);
        setData([]);
      } else {
        const res = await fetch(`/api/summary?year=${year}`);
        const json = await res.json();
        setData(json.data ?? []);
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [mode, year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const yearTotal = data.reduce(
    (acc, d) => ({
      income: acc.income + d.totalIncome,
      expense: acc.expense + d.totalExpense,
    }),
    { income: 0, expense: 0 }
  );

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">損益計算書</h1>
          <p className="text-slate-400 text-sm mt-0.5">振替・除外項目を除いた実際の収支</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            <button onClick={() => setMode("monthly")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${mode === "monthly" ? "bg-blue-600 text-white" : "text-slate-400"}`}>
              月次
            </button>
            <button onClick={() => setMode("yearly")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${mode === "yearly" ? "bg-blue-600 text-white" : "text-slate-400"}`}>
              年次
            </button>
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
      ) : mode === "monthly" && detail ? (
        <MonthlyPL detail={detail} />
      ) : mode === "yearly" ? (
        <YearlyPL data={data} year={year} yearTotal={yearTotal} />
      ) : null}
    </div>
  );
}

function MonthlyPL({ detail }: { detail: MonthlySummary }) {
  const categories = detail.categories ?? {};
  const expenseCategories = Object.entries(categories)
    .filter(([, v]) => v.expense > 0)
    .sort((a, b) => b[1].expense - a[1].expense);
  const incomeCategories = Object.entries(categories)
    .filter(([, v]) => v.income > 0)
    .sort((a, b) => b[1].income - a[1].income);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardTitle>収入合計</CardTitle>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(detail.totalIncome)}</p>
        </Card>
        <Card>
          <CardTitle>支出合計</CardTitle>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(detail.totalExpense)}</p>
        </Card>
        <Card>
          <CardTitle>当期純損益</CardTitle>
          <p className={`text-2xl font-bold ${detail.netIncome >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrencySigned(detail.netIncome)}
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardTitle>支出明細</CardTitle>
          <table className="data-table">
            <thead><tr><th>カテゴリ</th><th className="text-right">金額</th><th className="text-right">件数</th></tr></thead>
            <tbody>
              {expenseCategories.map(([cat, v]) => (
                <tr key={cat}>
                  <td className="text-slate-300">{cat}</td>
                  <td className="text-right text-red-300">{formatCurrency(v.expense)}</td>
                  <td className="text-right text-slate-500 text-xs">{v.count}件</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="text-white">合計</td>
                <td className="text-right text-red-400">{formatCurrency(detail.totalExpense)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>収入明細</CardTitle>
          <table className="data-table">
            <thead><tr><th>カテゴリ</th><th className="text-right">金額</th><th className="text-right">件数</th></tr></thead>
            <tbody>
              {incomeCategories.map(([cat, v]) => (
                <tr key={cat}>
                  <td className="text-slate-300">{cat}</td>
                  <td className="text-right text-green-300">{formatCurrency(v.income)}</td>
                  <td className="text-right text-slate-500 text-xs">{v.count}件</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="text-white">合計</td>
                <td className="text-right text-green-400">{formatCurrency(detail.totalIncome)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

function YearlyPL({
  data, year, yearTotal,
}: {
  data: MonthlySummary[];
  year: number;
  yearTotal: { income: number; expense: number };
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardTitle>{year}年 収入合計</CardTitle>
          <p className="text-2xl font-bold text-green-400">{formatCurrency(yearTotal.income)}</p>
        </Card>
        <Card>
          <CardTitle>{year}年 支出合計</CardTitle>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(yearTotal.expense)}</p>
        </Card>
        <Card>
          <CardTitle>{year}年 純損益</CardTitle>
          <p className={`text-2xl font-bold ${yearTotal.income - yearTotal.expense >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrencySigned(yearTotal.income - yearTotal.expense)}
          </p>
        </Card>
      </div>
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
            {data.map((d) => (
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
