"use client";
import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import GeminiUsageBadge from "@/components/ui/GeminiUsageBadge";
import CategorySelect from "@/components/ui/CategorySelect";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
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
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

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

  async function runAI() {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiError("");
    setAiResult("");
    try {
      const context = JSON.stringify({
        period: month !== "" ? `${year}年${month}月` : `${year}年`,
        categoryBreakdown: catData.slice(0, 10),
        paymentMethods: payData.slice(0, 6),
        topItems: topItems.slice(0, 10),
      }, null, 2);
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, prompt: aiPrompt }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiError(json.error ?? "エラーが発生しました");
      } else {
        setAiResult(json.text ?? "");
      }
    } finally {
      setAiLoading(false);
    }
  }

  const COLORS = catData.map((c) => getCategoryColor(c.category));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-xl sm:text-2xl font-bold text-white">分析</h1>
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

          {/* Gemini AI 分析 */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <CardTitle>Gemini AI 分析</CardTitle>
              <GeminiUsageBadge />
            </div>
            <div className="flex gap-2 mb-3">
              <input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAI()}
                placeholder="例: 今月の支出の特徴と改善点を教えて"
                className="flex-1 bg-slate-800 text-white text-sm px-3 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
              />
              <button
                onClick={runAI}
                disabled={aiLoading || !aiPrompt.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-sm rounded-lg transition"
              >
                {aiLoading ? "分析中..." : "分析"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[
                "今月の支出の特徴と改善ポイントを教えて",
                "どのカテゴリを節約すべき？",
                "食費が高い日のパターンを教えて",
                "支出のうち固定費と変動費を分けて分析して",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setAiPrompt(q)}
                  className="text-xs px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-full border border-slate-700"
                >
                  {q}
                </button>
              ))}
            </div>
            {aiError && <p className="text-red-400 text-sm mb-2">{aiError}</p>}
            {aiResult && (
              <div className="bg-slate-800 rounded-lg p-4 text-sm text-slate-300 leading-relaxed prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{aiResult}</ReactMarkdown>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
