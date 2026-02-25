"use client";
import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { getCategoryColor } from "@/lib/utils";

type CategoryItem = { category: string; total: number; count: number; ratio: number };
type PaymentItem = { assetName: string; total: number; count: number; ratio: number };
type TopItem = { category: string; itemName: string; total: number; count: number };

export default function AnalyticsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | "">(now.getMonth() + 1);
  const [catData, setCatData] = useState<CategoryItem[]>([]);
  const [payData, setPayData] = useState<PaymentItem[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 比較分析ステート
  const [cmpP1Year, setCmpP1Year] = useState(now.getFullYear() - 1);
  const [cmpP1Month, setCmpP1Month] = useState<number | "">("");
  const [cmpP2Year, setCmpP2Year] = useState(now.getFullYear());
  const [cmpP2Month, setCmpP2Month] = useState<number | "">(now.getMonth() + 1);
  const [cmpData, setCmpData] = useState<{
    comparison: Array<{ category: string; amount1: number; amount2: number; diff: number; diffPct: number | null }>;
    summary: { total1: number; total2: number };
  } | null>(null);
  const [cmpLoading, setCmpLoading] = useState(false);
  const [cmpAiLoading, setCmpAiLoading] = useState(false);
  const [cmpAiResult, setCmpAiResult] = useState("");
  const [cmpAiError, setCmpAiError] = useState("");

  const cmpLabel1 = `${cmpP1Year}年${cmpP1Month !== "" ? cmpP1Month + "月" : ""}`;
  const cmpLabel2 = `${cmpP2Year}年${cmpP2Month !== "" ? cmpP2Month + "月" : ""}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type: "category", year: String(year) });
      if (month !== "") params.set("month", String(month));

      const [catRes, payRes, topRes] = await Promise.all([
        fetch(`/api/analytics?${params}`),
        fetch(`/api/analytics?type=payment_method&year=${year}${month !== "" ? `&month=${month}` : ""}`),
        fetch(`/api/analytics?type=top_items&year=${year}${month !== "" ? `&month=${month}` : ""}`),
      ]);
      const [catJson, payJson, topJson] = await Promise.all([
        catRes.json(), payRes.json(), topRes.json(),
      ]);
      setCatData(catJson.data ?? []);
      setPayData(payJson.data ?? []);
      setTopItems(topJson.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function runComparison() {
    setCmpLoading(true);
    setCmpData(null);
    setCmpAiResult("");
    try {
      const params = new URLSearchParams({
        type: "compare",
        p1_year: String(cmpP1Year),
        p2_year: String(cmpP2Year),
      });
      if (cmpP1Month !== "") params.set("p1_month", String(cmpP1Month));
      if (cmpP2Month !== "") params.set("p2_month", String(cmpP2Month));
      const res = await fetch(`/api/analytics?${params}`);
      const json = await res.json();
      setCmpData(json.data ?? null);
    } finally {
      setCmpLoading(false);
    }
  }

  async function runCmpAI() {
    if (!cmpData) return;
    setCmpAiLoading(true);
    setCmpAiError("");
    setCmpAiResult("");
    try {
      const topDiffs = cmpData.comparison
        .filter((r) => r.amount1 > 0 || r.amount2 > 0)
        .slice(0, 15)
        .map((r) => `・${r.category}: ${r.amount1 > 0 ? formatCurrency(r.amount1) : "なし"} → ${r.amount2 > 0 ? formatCurrency(r.amount2) : "なし"}（${r.diff > 0 ? "+" : ""}${formatCurrency(r.diff)}${r.diffPct !== null ? `、${r.diff > 0 ? "+" : ""}${r.diffPct}%` : ""}）`)
        .join("\n");
      const context = `【${cmpLabel1}】合計支出: ${formatCurrency(cmpData.summary.total1)}\n【${cmpLabel2}】合計支出: ${formatCurrency(cmpData.summary.total2)}\n\nカテゴリ別増減（変化が大きい順）:\n${topDiffs}`;
      const prompt = `上記の2期間【${cmpLabel1}】vs【${cmpLabel2}】の支出比較データを分析してください。支出変化の要因として特に重要なものを上位5つ、それぞれ具体的な金額・増減率・考えられる理由を含めてわかりやすく説明してください。`;
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, prompt }),
      });
      const json = await res.json();
      if (!res.ok) setCmpAiError(json.error ?? "エラーが発生しました");
      else setCmpAiResult(json.text ?? "");
    } finally {
      setCmpAiLoading(false);
    }
  }

  const COLORS = catData.map((c) => getCategoryColor(c.category));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">分析</h1>
          <p className="text-slate-400 text-sm mt-0.5">支出パターンを深掘りする</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
            {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value === "" ? "" : Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
            <option value="">年全体</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">読み込み中...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* カテゴリ別支出 - 円グラフ */}
            <Card>
              <CardTitle>カテゴリ別支出</CardTitle>
              {catData.length > 0 ? (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={catData} dataKey="total" nameKey="category" cx="50%" cy="50%" outerRadius={100}>
                        {catData.map((entry, i) => (
                          <Cell key={entry.category} fill={COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="w-full mt-2 space-y-1">
                    {catData.slice(0, 8).map((c, i) => (
                      <div key={c.category} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i] }} />
                          <span className="text-slate-300">{c.category}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-500 text-xs">{c.ratio}%</span>
                          <span className="text-white text-xs w-24 text-right">{formatCurrency(c.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-slate-500 text-sm">データなし</p>}
            </Card>

            {/* 支払手段別 */}
            <Card>
              <CardTitle>支払手段別</CardTitle>
              {payData.length > 0 ? (
                <div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={payData.slice(0, 6)} layout="vertical">
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                      <YAxis type="category" dataKey="assetName" tick={{ fontSize: 10, fill: "#94a3b8" }} width={80} />
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                      <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-3 space-y-1">
                    {payData.slice(0, 6).map((p) => (
                      <div key={p.assetName} className="flex justify-between text-sm">
                        <span className="text-slate-400">{p.assetName}</span>
                        <span className="text-white">{p.ratio}%・{formatCurrency(p.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-slate-500 text-sm">データなし</p>}
            </Card>
          </div>

          {/* 支出ランキング（項目別） */}
          <Card>
            <CardTitle>支出ランキング（項目別）</CardTitle>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8">#</th>
                  <th>カテゴリ</th>
                  <th>項目名</th>
                  <th className="text-right">合計</th>
                  <th className="text-right">件数</th>
                </tr>
              </thead>
              <tbody>
                {topItems.slice(0, 15).map((item, i) => (
                  <tr key={i}>
                    <td className="text-slate-600 text-xs">{i + 1}</td>
                    <td className="text-slate-500 text-xs">{item.category}</td>
                    <td className="text-slate-300">{item.itemName || "（名称なし）"}</td>
                    <td className="text-right text-white">{formatCurrency(item.total)}</td>
                    <td className="text-right text-slate-500 text-xs">{item.count}回</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* 比較分析 */}
          <Card>
            <CardTitle>比較分析</CardTitle>
            <div className="space-y-4">
              {/* 期間セレクター */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">期間1</span>
                  <select value={cmpP1Year} onChange={(e) => setCmpP1Year(Number(e.target.value))}
                    className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
                    {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                  <select value={cmpP1Month} onChange={(e) => setCmpP1Month(e.target.value === "" ? "" : Number(e.target.value))}
                    className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
                    <option value="">年全体</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                </div>
                <span className="text-slate-500 font-bold">vs</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">期間2</span>
                  <select value={cmpP2Year} onChange={(e) => setCmpP2Year(Number(e.target.value))}
                    className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
                    {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
                      <option key={y} value={y}>{y}年</option>
                    ))}
                  </select>
                  <select value={cmpP2Month} onChange={(e) => setCmpP2Month(e.target.value === "" ? "" : Number(e.target.value))}
                    className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
                    <option value="">年全体</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m}月</option>
                    ))}
                  </select>
                </div>
                <button onClick={runComparison} disabled={cmpLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm rounded-lg transition">
                  {cmpLoading ? "比較中..." : "比較"}
                </button>
              </div>

              {/* 比較結果 */}
              {cmpData && (
                <>
                  <div className="flex gap-4 text-sm">
                    <span className="text-slate-400">{cmpLabel1}: <span className="text-white font-medium">{formatCurrency(cmpData.summary.total1)}</span></span>
                    <span className="text-slate-400">{cmpLabel2}: <span className="text-white font-medium">{formatCurrency(cmpData.summary.total2)}</span></span>
                    <span className={`font-medium ${cmpData.summary.total2 - cmpData.summary.total1 > 0 ? "text-red-400" : "text-green-400"}`}>
                      {cmpData.summary.total2 - cmpData.summary.total1 > 0 ? "+" : ""}{formatCurrency(cmpData.summary.total2 - cmpData.summary.total1)}
                    </span>
                  </div>

                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>カテゴリ</th>
                        <th className="text-right">{cmpLabel1}</th>
                        <th className="text-right">{cmpLabel2}</th>
                        <th className="text-right">増減</th>
                        <th className="text-right hidden sm:table-cell">増減率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cmpData.comparison.filter(r => r.amount1 > 0 || r.amount2 > 0).map((row) => (
                        <tr key={row.category}>
                          <td className="text-slate-300">{row.category}</td>
                          <td className="text-right text-slate-400">{row.amount1 > 0 ? formatCurrency(row.amount1) : "—"}</td>
                          <td className="text-right text-slate-300">{row.amount2 > 0 ? formatCurrency(row.amount2) : "—"}</td>
                          <td className={`text-right font-medium ${row.diff > 0 ? "text-red-400" : row.diff < 0 ? "text-green-400" : "text-slate-500"}`}>
                            {row.diff !== 0 ? (row.diff > 0 ? "+" : "") + formatCurrency(row.diff) : "±0"}
                          </td>
                          <td className={`text-right text-sm hidden sm:table-cell ${row.diff > 0 ? "text-red-400" : row.diff < 0 ? "text-green-400" : "text-slate-500"}`}>
                            {row.diffPct !== null ? `${row.diff > 0 ? "+" : ""}${row.diffPct}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Gemini 要因分析 */}
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-slate-400 text-sm">Gemini AI で要因分析（上位5つ）</span>
                    </div>
                    <button onClick={runCmpAI} disabled={cmpAiLoading}
                      className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-700 text-white text-sm rounded-lg transition">
                      {cmpAiLoading ? "分析中..." : "AIで要因分析"}
                    </button>
                    {cmpAiError && <p className="text-red-400 text-sm mt-2">{cmpAiError}</p>}
                    {cmpAiResult && (
                      <div className="bg-slate-800 rounded-lg p-4 text-sm text-slate-300 leading-relaxed mt-3">
                        <ReactMarkdown components={{
                          h1: ({ children }) => <h1 className="text-base font-bold text-white mb-2 mt-3">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-sm font-bold text-white mb-2 mt-3">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-200 mb-1 mt-2">{children}</h3>,
                          p: ({ children }) => <p className="text-slate-300 mb-2">{children}</p>,
                          ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
                          li: ({ children }) => <li className="text-slate-300">{children}</li>,
                          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                          hr: () => <hr className="border-slate-600 my-3" />,
                        }}>
                          {cmpAiResult}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
