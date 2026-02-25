"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, CartesianGrid, Cell,
} from "recharts";

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

type NetAssetPoint = { year: number; month: number; netAssets: number };

const YEAR_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7", "#ec4899", "#14b8a6", "#f43f5e", "#eab308"];
const ALL_YEARS = Array.from({ length: 8 }, (_, i) => 2019 + i);
const getYearColor = (year: number) => YEAR_COLORS[ALL_YEARS.indexOf(year) % YEAR_COLORS.length];

const LoadingChart = ({ height }: { height: number }) => (
  <div className={`flex items-center justify-center text-slate-600 text-sm`} style={{ height }}>
    読み込み中...
  </div>
);

export default function TrendsPage() {
  const now = new Date();
  const allYears = ALL_YEARS;
  const currentYear = now.getFullYear();
  // デフォルト：直近3年
  const [selectedYears, setSelectedYears] = useState<number[]>([
    currentYear - 2, currentYear - 1, currentYear,
  ]);
  const [trendData, setTrendData] = useState<MonthlyPoint[]>([]);
  const [catTrend, setCatTrend] = useState<CategoryPoint[]>([]);
  const [netAssetData, setNetAssetData] = useState<NetAssetPoint[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("食費");
  const [trendCategories, setTrendCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // カテゴリ一覧を一度だけ取得
  useEffect(() => {
    fetch("/api/categories?type=expense")
      .then((r) => r.json())
      .then((json) => setTrendCategories((json.data ?? []).map((d: { category: string }) => d.category)))
      .catch(() => {});
  }, []); // fetch once on mount, no re-fetch on loading changes

  const fetchData = useCallback(async () => {
    if (selectedYears.length === 0) return;
    setLoading(true);
    try {
      const yearsParam = selectedYears.join(",");
      const [trendRes, catRes, netAssetRes] = await Promise.all([
        fetch(`/api/analytics?type=trend&years=${yearsParam}`),
        fetch(`/api/analytics?type=category_trend&category=${encodeURIComponent(selectedCategory)}`),
        fetch(`/api/analytics?type=net_asset_trend&years=${yearsParam}`),
      ]);
      const [trendJson, catJson, netAssetJson] = await Promise.all([
        trendRes.json(), catRes.json(), netAssetRes.json(),
      ]);
      setTrendData(trendJson.data ?? []);
      setCatTrend((catJson.data ?? []).filter((d: CategoryPoint) => selectedYears.includes(d.year)));
      setNetAssetData(netAssetJson.data ?? []);
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

  // 半年単位（H1: 6月末, H2: 12月末）の棒グラフ用データ
  const halfYearNetAssetData = (() => {
    // 全ての (year, half) を時系列順で生成
    const points: Array<{
      label: string;
      year: number;
      half: 1 | 2;
      [key: string]: number | string;
    }> = [];

    const sortedYears = [...selectedYears].sort();
    for (const y of sortedYears) {
      for (const half of [1, 2] as const) {
        const endMonth = half === 1 ? 6 : 12;
        const d = netAssetData.find((t) => t.year === y && t.month === endMonth);
        const point: typeof points[0] = {
          label: `${y}${half === 1 ? "上" : "下"}`,
          year: y,
          half,
          netAssets: d?.netAssets ?? 0,
        };
        points.push(point);
      }
    }

    // 前回比（前のポイントとの差）を計算
    for (let i = 1; i < points.length; i++) {
      const cur = points[i].netAssets as number;
      const prev = points[i - 1].netAssets as number;
      points[i].diff = cur - prev;
    }
    return points;
  })();

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
          {allYears.map((y) => (
            <button
              key={y}
              onClick={() => toggleYear(y)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition ${
                selectedYears.includes(y)
                  ? "border-transparent text-white"
                  : "border-slate-700 text-slate-500 hover:text-slate-300"
              }`}
              style={selectedYears.includes(y) ? { background: getYearColor(y) } : {}}
            >
              {y}年
            </button>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {/* 月別支出比較 */}
        <Card>
          <CardTitle>月別支出比較</CardTitle>
          {loading ? <LoadingChart height={280} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                {selectedYears.map((y) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={`${y}年_支出`}
                    stroke={getYearColor(y)}
                    strokeWidth={2}
                    dot={false}
                    name={`${y}年`}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* 月別純損益比較 */}
        <Card>
          <CardTitle>月別純損益比較</CardTitle>
          {loading ? <LoadingChart height={240} /> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                {selectedYears.map((y) => (
                  <Bar
                    key={y}
                    dataKey={`${y}年_純損益`}
                    fill={getYearColor(y)}
                    name={`${y}年`}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* 純資産推移（半年単位棒グラフ） */}
        <Card>
          <CardTitle>純資産推移（半年単位・資産 − 負債）</CardTitle>
          {loading ? <LoadingChart height={280} /> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={halfYearNetAssetData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                <Tooltip
                  formatter={(v: number, name: string) => [formatCurrency(v), name]}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = halfYearNetAssetData.find((p) => p.label === label);
                    return (
                      <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs">
                        <p className="text-slate-300 font-medium mb-1">{label}半期</p>
                        {payload.map((p) => (
                          <p key={p.name} style={{ color: p.fill as string }}>
                            純資産: {formatCurrency(Number(p.value))}
                          </p>
                        ))}
                        {d && d.diff !== undefined && (
                          <p className={`mt-1 font-medium ${(d.diff as number) >= 0 ? "text-green-400" : "text-red-400"}`}>
                            前期比: {(d.diff as number) >= 0 ? "+" : ""}{formatCurrency(d.diff as number)}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="netAssets"
                  name="純資産"
                  radius={[4, 4, 0, 0]}
                  label={{
                    position: "top",
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter: (_v: number, _name: string, props: any) => {
                      const diff = props?.payload?.diff;
                      if (diff === undefined) return "";
                      return `${diff >= 0 ? "+" : ""}${(diff / 10000).toFixed(0)}万`;
                    },
                    fontSize: 10,
                    fill: "#94a3b8",
                  }}
                >
                  {halfYearNetAssetData.map((entry) => (
                    <Cell key={entry.label} fill={getYearColor(entry.year as number)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* カテゴリ別トレンド */}
        <Card>
          <div className="flex items-center gap-3 mb-3">
            <CardTitle>カテゴリ別トレンド</CardTitle>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
            >
              {trendCategories.length > 0
                ? trendCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)
                : <option value={selectedCategory}>{selectedCategory}</option>
              }
            </select>
          </div>
          {loading ? <LoadingChart height={240} /> : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={catChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                {selectedYears.map((y) => (
                  <Line
                    key={y}
                    type="monotone"
                    dataKey={`${y}年`}
                    stroke={getYearColor(y)}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* 年次サマリー表 */}
        <Card>
          <CardTitle>年次比較サマリー</CardTitle>
          {loading ? <LoadingChart height={60} /> : (
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
                {selectedYears.map((y) => {
                  const yearData = trendData.filter((d) => d.year === y);
                  const income = yearData.reduce((sum, d) => sum + d.totalIncome, 0);
                  const expense = yearData.reduce((sum, d) => sum + d.totalExpense, 0);
                  const net = income - expense;
                  return (
                    <tr key={y}>
                      <td>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: getYearColor(y) }} />
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
          )}
        </Card>
      </div>
    </div>
  );
}
