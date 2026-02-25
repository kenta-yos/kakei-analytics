"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, getCategoryColor } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import CategorySelect from "@/components/ui/CategorySelect";

type MonthlyPoint = {
  year: number;
  month: number;
  totalIncome: number;
  totalExpense: number;
  netIncome: number;
};

type CategoryPoint = {
  year: number;
  month: number;
  total: number;
};

const YEAR_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#f43f5e", "#eab308"];

export default function TrendsPage() {
  const now = new Date();
  const allYears = Array.from({ length: 8 }, (_, i) => 2019 + i);
  const [selectedYears, setSelectedYears] = useState<number[]>([now.getFullYear(), now.getFullYear() - 1]);
  const [trendData, setTrendData] = useState<MonthlyPoint[]>([]);
  const [catTrend, setCatTrend] = useState<CategoryPoint[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("食費");
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (selectedYears.length === 0) return;
    setLoading(true);
    try {
      const yearsParam = selectedYears.join(",");
      const [trendRes, catRes] = await Promise.all([
        fetch(`/api/analytics?type=trend&years=${yearsParam}`),
        fetch(`/api/analytics?type=category_trend&category=${encodeURIComponent(selectedCategory)}`),
      ]);
      const [trendJson, catJson] = await Promise.all([trendRes.json(), catRes.json()]);
      setTrendData(trendJson.data ?? []);
      setCatTrend((catJson.data ?? []).filter((d: CategoryPoint) => selectedYears.includes(d.year)));
    } finally {
      setLoading(false);
    }
  }, [selectedYears, selectedCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleYear(y: number) {
    setSelectedYears((prev) =>
      prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort()
    );
  }

  // 月別データを Recharts 用に変換（月を横軸、年ごとのライン）
  const monthlyChartData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const point: Record<string, number | string> = { month: `${m}月` };
    for (const year of selectedYears) {
      const d = trendData.find((t) => t.year === year && t.month === m);
      point[`${year}年_支出`] = d?.totalExpense ?? 0;
      point[`${year}年_収入`] = d?.totalIncome ?? 0;
      point[`${year}年_純損益`] = d?.netIncome ?? 0;
    }
    return point;
  });

  const catChartData = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const point: Record<string, number | string> = { month: `${m}月` };
    for (const year of selectedYears) {
      const d = catTrend.find((t) => t.year === year && t.month === m);
      point[`${year}年`] = d?.total ?? 0;
    }
    return point;
  });

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">推移グラフ</h1>
        <p className="text-slate-400 text-sm mt-0.5">年比較・トレンド分析</p>
      </div>

      {/* 年選択 */}
      <Card className="mb-5">
        <CardTitle>表示する年を選択（複数選択可）</CardTitle>
        <div className="flex flex-wrap gap-2">
          {allYears.map((y, i) => (
            <button
              key={y}
              onClick={() => toggleYear(y)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                selectedYears.includes(y)
                  ? "border-transparent text-white"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
              style={selectedYears.includes(y) ? { background: YEAR_COLORS[i % YEAR_COLORS.length] } : {}}
            >
              {y}年
            </button>
          ))}
        </div>
      </Card>

      {loading ? (
        <p className="text-slate-500">読み込み中...</p>
      ) : (
        <div className="space-y-4">
          {/* 月別支出比較 */}
          <Card>
            <CardTitle>月別支出比較</CardTitle>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                {selectedYears.map((y, i) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={`${y}年_支出`}
                    stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                    name={`${y}年`}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 月別純損益比較 */}
          <Card>
            <CardTitle>月別純損益比較</CardTitle>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                {selectedYears.map((y, i) => (
                  <Bar
                    key={y}
                    dataKey={`${y}年_純損益`}
                    fill={YEAR_COLORS[i % YEAR_COLORS.length]}
                    name={`${y}年`}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* カテゴリ別トレンド */}
          <Card>
            <div className="flex items-center gap-3 mb-3">
              <CardTitle>カテゴリ別トレンド</CardTitle>
                <CategorySelect
                value={selectedCategory}
                onChange={setSelectedCategory}
                type="expense"
                includeAll={false}
              />
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={catChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                {selectedYears.map((y, i) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={`${y}年`}
                    stroke={YEAR_COLORS[i % YEAR_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* 年次サマリー表 */}
          <Card>
            <CardTitle>年次比較サマリー</CardTitle>
            <table className="data-table">
              <thead>
                <tr>
                  <th>年</th>
                  <th className="text-right">収入合計</th>
                  <th className="text-right">支出合計</th>
                  <th className="text-right">純損益</th>
                </tr>
              </thead>
              <tbody>
                {selectedYears.map((y, i) => {
                  const yearData = trendData.filter((d) => d.year === y);
                  const income = yearData.reduce((sum, d) => sum + d.totalIncome, 0);
                  const expense = yearData.reduce((sum, d) => sum + d.totalExpense, 0);
                  const net = income - expense;
                  return (
                    <tr key={y}>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: YEAR_COLORS[i % YEAR_COLORS.length] }} />
                          {y}年
                        </span>
                      </td>
                      <td className="text-right text-green-400">{formatCurrency(income)}</td>
                      <td className="text-right text-red-400">{formatCurrency(expense)}</td>
                      <td className={`text-right font-medium ${net >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {net >= 0 ? "+" : ""}{formatCurrency(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
