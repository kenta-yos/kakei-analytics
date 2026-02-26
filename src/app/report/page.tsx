"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from "recharts";

// ──────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────
type AnnualReport = {
  year: number;
  income: { current: number; prev: number; yoy: number | null };
  expense: { current: number; prev: number; yoy: number | null };
  netIncome: { current: number; prev: number };
  savingsRate: { current: number; prev: number };
  netAsset: { start: number; end: number; change: number; prevEnd: number; yoy: number | null };
  monthly: { month: number; totalIncome: number; totalExpense: number; netIncome: number }[];
  categories: { category: string; total: number; ratio: number }[];
  highlights: {
    bestMonth: { month: number; netIncome: number } | null;
    worstMonth: { month: number; netIncome: number } | null;
  };
};

type QuarterData = {
  q: number;
  label: string;
  months: number[];
  income: number;
  expense: number;
  netIncome: number;
  savingsRate: number;
  netAsset: number;
  netAssetChange: number | null;
  yoy: { income: number | null; expense: number | null; netIncome: number };
  topCategories: { category: string; total: number }[];
};

type QuarterlyReport = {
  year: number;
  quarters: QuarterData[];
  monthly: { month: number; quarter: string; totalIncome: number; totalExpense: number; netIncome: number }[];
};

type ReportAnalysis = {
  id: number;
  year: number;
  reportType: string;
  analysis: string;
  createdAt: string;
} | null;

// ──────────────────────────────────────────────
// 共通ヘルパー
// ──────────────────────────────────────────────
const QUARTER_COLORS = ["#3b82f6", "#22c55e", "#f97316", "#a855f7"];
const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function YoY({ value, inverse = false }: { value: number | null; inverse?: boolean }) {
  if (value === null) return <span className="text-slate-600 text-xs">前年比 —</span>;
  const up = inverse ? value < 0 : value > 0;
  const color = up ? "text-green-400" : value === 0 ? "text-slate-400" : "text-red-400";
  const arrow = value > 0 ? "▲" : value < 0 ? "▼" : "—";
  return (
    <span className={`text-xs font-medium ${color}`}>
      前年比 {arrow} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function KpiCard({
  label, value, sub, yoy, inverseYoy, highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  yoy?: number | null;
  inverseYoy?: boolean;
  highlight?: "green" | "red" | "blue" | "none";
}) {
  const colors = {
    green: "text-green-400",
    red: "text-red-400",
    blue: "text-blue-400",
    none: "text-white",
  };
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
      <span className={`text-2xl font-bold ${colors[highlight ?? "none"]}`}>{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
      {yoy !== undefined && <YoY value={yoy ?? null} inverse={inverseYoy} />}
    </Card>
  );
}

// ──────────────────────────────────────────────
// 定性分析セクション
// ──────────────────────────────────────────────
function AnalysisSection({
  year,
  period,
  analysis,
  onGenerated,
}: {
  year: number;
  period: "annual" | "quarterly";
  analysis: ReportAnalysis;
  onGenerated: (analysis: ReportAnalysis) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_analysis", year, period }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "生成に失敗しました");
        return;
      }
      onGenerated(json.data);
    } finally {
      setGenerating(false);
    }
  }

  const periodLabel = period === "annual" ? "年次" : "四半期";

  return (
    <Card className="border-purple-800/30 bg-purple-950/5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <CardTitle>定性分析レポート（AI）</CardTitle>
          <p className="text-slate-500 text-xs mt-0.5">
            Gemini が{year}年{periodLabel}データをもとに企業決算発表風の定性分析を生成します
          </p>
        </div>
        {!analysis && (
          <button
            onClick={generate}
            disabled={generating}
            className="px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center gap-2 bg-purple-700 hover:bg-purple-600 disabled:bg-slate-700 text-white shrink-0"
          >
            {generating ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                定性レポート作成中...
              </>
            ) : (
              "定性レポートを作成"
            )}
          </button>
        )}
        {analysis && (
          <span className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-700 text-slate-400 border border-slate-600 shrink-0">
            ✓ 作成済み
          </span>
        )}
      </div>

      {error && (
        <p className="mt-3 text-red-400 text-sm bg-red-950/20 border border-red-800/30 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {analysis && (
        <div className="mt-5 prose prose-invert prose-sm max-w-none">
          <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap border-t border-slate-700 pt-4">
            {analysis.analysis.split("\n").map((line, i) => {
              if (line.startsWith("### ")) {
                return (
                  <h3 key={i} className="text-white font-bold text-base mt-5 mb-2 first:mt-0">
                    {line.replace("### ", "")}
                  </h3>
                );
              }
              if (line.startsWith("## ")) {
                return (
                  <h2 key={i} className="text-white font-bold text-lg mt-6 mb-2 first:mt-0">
                    {line.replace("## ", "")}
                  </h2>
                );
              }
              if (line.startsWith("# ")) {
                return (
                  <h1 key={i} className="text-white font-bold text-xl mt-6 mb-3 first:mt-0">
                    {line.replace("# ", "")}
                  </h1>
                );
              }
              if (line.startsWith("- ") || line.startsWith("* ")) {
                return (
                  <div key={i} className="flex gap-2 my-0.5">
                    <span className="text-purple-400 shrink-0 mt-0.5">•</span>
                    <span>{line.replace(/^[-*] /, "")}</span>
                  </div>
                );
              }
              if (line.trim() === "") {
                return <div key={i} className="h-2" />;
              }
              return <p key={i} className="my-1">{line}</p>;
            })}
          </div>
          <p className="text-slate-600 text-xs mt-4 pt-3 border-t border-slate-800">
            生成日時: {new Date(analysis.createdAt).toLocaleString("ja-JP")}
          </p>
        </div>
      )}
    </Card>
  );
}

// ──────────────────────────────────────────────
// メインページ
// ──────────────────────────────────────────────
export default function ReportPage() {
  const now = new Date();
  const [tab, setTab] = useState<"annual" | "quarterly">("annual");
  const [year, setYear] = useState(now.getFullYear());
  const [annual, setAnnual] = useState<AnnualReport | null>(null);
  const [quarterly, setQuarterly] = useState<QuarterlyReport | null>(null);
  const [annualAnalysis, setAnnualAnalysis] = useState<ReportAnalysis>(null);
  const [quarterlyAnalysis, setQuarterlyAnalysis] = useState<ReportAnalysis>(null);
  const [loading, setLoading] = useState(false);

  const allYears = Array.from({ length: 8 }, (_, i) => 2019 + i).reverse();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, analysisRes] = await Promise.all([
        fetch(`/api/report?type=${tab}&year=${year}`),
        fetch(`/api/report?type=analysis&year=${year}&period=${tab}`),
      ]);
      const [reportJson, analysisJson] = await Promise.all([
        reportRes.json(),
        analysisRes.json(),
      ]);
      if (tab === "annual") {
        setAnnual(reportJson.data);
        setAnnualAnalysis(analysisJson.data);
      } else {
        setQuarterly(reportJson.data);
        setQuarterlyAnalysis(analysisJson.data);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, year]);

  useEffect(() => { load(); }, [load]);

  const currentAnalysis = tab === "annual" ? annualAnalysis : quarterlyAnalysis;
  const setCurrentAnalysis = tab === "annual" ? setAnnualAnalysis : setQuarterlyAnalysis;

  return (
    <div className="p-4 sm:p-6">
      {/* ヘッダー */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">決算レポート</h1>
          <p className="text-slate-400 text-sm mt-0.5">家計の年次・四半期決算サマリー</p>
        </div>
        <div className="flex items-center gap-2">
          {/* タブ */}
          <div className="flex rounded-lg border border-slate-700 overflow-hidden">
            {(["annual", "quarterly"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm transition ${
                  tab === t
                    ? "bg-blue-600 text-white font-semibold"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                {t === "annual" ? "年次" : "四半期"}
              </button>
            ))}
          </div>
          {/* 年選択 */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700"
          >
            {allYears.map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 text-slate-500">読み込み中...</div>
      ) : tab === "annual" && annual ? (
        <AnnualView
          data={annual}
          analysis={annualAnalysis}
          onAnalysisGenerated={setCurrentAnalysis}
          year={year}
        />
      ) : tab === "quarterly" && quarterly ? (
        <QuarterlyView
          data={quarterly}
          analysis={quarterlyAnalysis}
          onAnalysisGenerated={setCurrentAnalysis}
          year={year}
        />
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────
// 年次ビュー
// ──────────────────────────────────────────────
function AnnualView({
  data,
  analysis,
  onAnalysisGenerated,
  year,
}: {
  data: AnnualReport;
  analysis: ReportAnalysis;
  onAnalysisGenerated: (a: ReportAnalysis) => void;
  year: number;
}) {
  const net = data.netIncome.current;
  const monthlyChartData = data.monthly.map((m) => ({
    month: MONTH_LABELS[m.month - 1],
    収入: m.totalIncome,
    支出: m.totalExpense,
    純損益: m.netIncome,
  }));

  return (
    <div className="space-y-5">
      {/* 決算タイトル */}
      <div className="text-center py-4 border border-slate-700/50 rounded-xl bg-slate-900/50">
        <p className="text-slate-500 text-sm tracking-widest uppercase mb-1">Annual Financial Report</p>
        <h2 className="text-3xl font-bold text-white">{data.year}年 家計決算報告</h2>
        <p className="text-slate-400 text-sm mt-2">
          {data.year}年1月1日 〜 {data.year}年12月31日
        </p>
      </div>

      {/* KPI カード */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiCard
          label="年間収入"
          value={formatCurrency(data.income.current)}
          sub={`前年: ${formatCurrency(data.income.prev)}`}
          yoy={data.income.yoy}
          highlight="green"
        />
        <KpiCard
          label="年間支出"
          value={formatCurrency(data.expense.current)}
          sub={`前年: ${formatCurrency(data.expense.prev)}`}
          yoy={data.expense.yoy}
          inverseYoy
          highlight="red"
        />
        <KpiCard
          label="年間純損益（貯蓄額）"
          value={formatCurrencySigned(net)}
          sub={`前年: ${formatCurrencySigned(data.netIncome.prev)}`}
          highlight={net >= 0 ? "green" : "red"}
        />
        <KpiCard
          label="貯蓄率"
          value={`${data.savingsRate.current.toFixed(1)}%`}
          sub={`前年: ${data.savingsRate.prev.toFixed(1)}%`}
          yoy={data.savingsRate.current - data.savingsRate.prev}
          highlight="blue"
        />
        <KpiCard
          label="期末純資産"
          value={formatCurrency(data.netAsset.end)}
          sub={`前年末: ${formatCurrency(data.netAsset.prevEnd)}`}
          yoy={data.netAsset.yoy}
          highlight="blue"
        />
        <KpiCard
          label="純資産増減（年間）"
          value={formatCurrencySigned(data.netAsset.change)}
          sub={`期首: ${formatCurrency(data.netAsset.start)} → 期末: ${formatCurrency(data.netAsset.end)}`}
          highlight={data.netAsset.change >= 0 ? "green" : "red"}
        />
      </div>

      {/* ハイライト */}
      {(data.highlights.bestMonth || data.highlights.worstMonth) && (
        <div className="grid grid-cols-2 gap-3">
          {data.highlights.bestMonth && (
            <Card className="border-green-800/40 bg-green-950/10">
              <span className="text-xs text-slate-500">最高月（貯蓄額）</span>
              <p className="text-white font-bold">{data.highlights.bestMonth.month}月</p>
              <p className="text-green-400 font-semibold">{formatCurrencySigned(data.highlights.bestMonth.netIncome)}</p>
            </Card>
          )}
          {data.highlights.worstMonth && (
            <Card className="border-red-800/40 bg-red-950/10">
              <span className="text-xs text-slate-500">最低月（貯蓄額）</span>
              <p className="text-white font-bold">{data.highlights.worstMonth.month}月</p>
              <p className="text-red-400 font-semibold">{formatCurrencySigned(data.highlights.worstMonth.netIncome)}</p>
            </Card>
          )}
        </div>
      )}

      {/* 月別収支グラフ */}
      <Card>
        <CardTitle>月別収支</CardTitle>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={monthlyChartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="収入" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.8} />
            <Bar dataKey="支出" fill="#f87171" radius={[3, 3, 0, 0]} opacity={0.8} />
            <Bar dataKey="純損益" radius={[3, 3, 0, 0]}>
              {monthlyChartData.map((d, i) => (
                <Cell key={i} fill={d["純損益"] >= 0 ? "#3b82f6" : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-center text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />収入</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />支出</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />純損益</span>
        </div>
      </Card>

      {/* 支出カテゴリランキング */}
      <Card>
        <CardTitle>支出カテゴリ内訳</CardTitle>
        <div className="space-y-2">
          {data.categories.slice(0, 12).map((c, i) => (
            <div key={c.category}>
              <div className="flex justify-between text-sm mb-0.5">
                <span className="text-slate-300 flex items-center gap-2">
                  <span className="text-slate-600 text-xs w-4 text-right">{i + 1}</span>
                  {c.category}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-slate-500 text-xs">{c.ratio}%</span>
                  <span className="text-red-400 font-medium w-28 text-right">{formatCurrency(c.total)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${c.ratio}%`,
                    background: `hsl(${220 - i * 12}, 70%, 55%)`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 月次詳細テーブル */}
      <Card>
        <CardTitle>月次収支明細</CardTitle>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">月</th>
                <th className="text-right">収入</th>
                <th className="text-right">支出</th>
                <th className="text-right">純損益</th>
                <th className="text-right hidden sm:table-cell">貯蓄率</th>
              </tr>
            </thead>
            <tbody>
              {data.monthly.map((m) => {
                const rate = m.totalIncome > 0 ? ((m.totalIncome - m.totalExpense) / m.totalIncome) * 100 : 0;
                return (
                  <tr key={m.month}>
                    <td className="text-slate-400">{m.month}月</td>
                    <td className="text-right text-green-400">
                      {m.totalIncome > 0 ? formatCurrency(m.totalIncome) : "—"}
                    </td>
                    <td className="text-right text-red-400">
                      {m.totalExpense > 0 ? formatCurrency(m.totalExpense) : "—"}
                    </td>
                    <td className={`text-right font-medium ${m.netIncome >= 0 ? "text-blue-400" : "text-red-400"}`}>
                      {m.totalIncome > 0 || m.totalExpense > 0 ? formatCurrencySigned(m.netIncome) : "—"}
                    </td>
                    <td className="text-right text-slate-500 text-sm hidden sm:table-cell">
                      {m.totalIncome > 0 ? `${rate.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-600 font-semibold">
                <td className="text-slate-300 pt-3">合計</td>
                <td className="text-right pt-3 text-green-400">{formatCurrency(data.income.current)}</td>
                <td className="text-right pt-3 text-red-400">{formatCurrency(data.expense.current)}</td>
                <td className={`text-right pt-3 font-bold ${net >= 0 ? "text-blue-400" : "text-red-400"}`}>
                  {formatCurrencySigned(net)}
                </td>
                <td className="text-right pt-3 text-blue-400 hidden sm:table-cell">
                  {data.savingsRate.current.toFixed(1)}%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* 定性分析 */}
      <AnalysisSection
        year={year}
        period="annual"
        analysis={analysis}
        onGenerated={onAnalysisGenerated}
      />
    </div>
  );
}

// ──────────────────────────────────────────────
// 四半期ビュー
// ──────────────────────────────────────────────
function QuarterlyView({
  data,
  analysis,
  onAnalysisGenerated,
  year,
}: {
  data: QuarterlyReport;
  analysis: ReportAnalysis;
  onAnalysisGenerated: (a: ReportAnalysis) => void;
  year: number;
}) {
  const chartData = data.quarters.map((q, i) => ({
    name: q.label,
    収入: q.income,
    支出: q.expense,
    純損益: q.netIncome,
    fill: QUARTER_COLORS[i],
  }));

  return (
    <div className="space-y-5">
      {/* 決算タイトル */}
      <div className="text-center py-4 border border-slate-700/50 rounded-xl bg-slate-900/50">
        <p className="text-slate-500 text-sm tracking-widest uppercase mb-1">Quarterly Financial Report</p>
        <h2 className="text-3xl font-bold text-white">{data.year}年 四半期決算報告</h2>
        <p className="text-slate-400 text-sm mt-2">Q1（1-3月）/ Q2（4-6月）/ Q3（7-9月）/ Q4（10-12月）</p>
      </div>

      {/* Q別サマリーカード */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.quarters.map((q, i) => (
          <div
            key={q.q}
            className="bg-slate-900 border rounded-xl p-5"
            style={{ borderColor: QUARTER_COLORS[i] + "40" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: QUARTER_COLORS[i] }}
              >
                {q.label}
              </span>
              <span className="text-slate-500 text-xs">{q.months[0]}〜{q.months[2]}月</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">収入</span>
                <span className="text-green-400 font-medium">{formatCurrency(q.income)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">支出</span>
                <span className="text-red-400 font-medium">{formatCurrency(q.expense)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-700 pt-1 mt-1">
                <span className="text-slate-400">純損益</span>
                <span className={`font-bold ${q.netIncome >= 0 ? "text-blue-400" : "text-red-400"}`}>
                  {formatCurrencySigned(q.netIncome)}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">貯蓄率</span>
                <span className="text-slate-400">{q.savingsRate.toFixed(1)}%</span>
              </div>
              {q.yoy.income !== null && (
                <div className="pt-1 text-xs space-y-0.5">
                  <YoY value={q.yoy.income} />
                  <span className="text-slate-600 block">（収入 前年同期比）</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 四半期別収支グラフ */}
      <Card>
        <CardTitle>四半期別 収支比較</CardTitle>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <ReferenceLine y={0} stroke="#475569" />
            <Bar dataKey="収入" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.8} />
            <Bar dataKey="支出" fill="#f87171" radius={[3, 3, 0, 0]} opacity={0.8} />
            <Bar dataKey="純損益" radius={[3, 3, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d["純損益"] >= 0 ? QUARTER_COLORS[i] : "#ef4444"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 justify-center text-xs text-slate-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />収入</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />支出</span>
          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />純損益</span>
        </div>
      </Card>

      {/* 月次詳細（四半期ごとにまとめ） */}
      <Card>
        <CardTitle>月次明細（四半期別グループ）</CardTitle>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text-left">期間</th>
                <th className="text-right">収入</th>
                <th className="text-right">支出</th>
                <th className="text-right">純損益</th>
                <th className="text-right hidden sm:table-cell">貯蓄率</th>
              </tr>
            </thead>
            <tbody>
              {data.quarters.map((q, qi) => (
                <>
                  {data.monthly
                    .filter((m) => q.months.includes(m.month))
                    .map((m) => {
                      const rate = m.totalIncome > 0 ? ((m.totalIncome - m.totalExpense) / m.totalIncome) * 100 : 0;
                      return (
                        <tr key={m.month} className="text-sm">
                          <td className="text-slate-500 pl-4">{m.month}月</td>
                          <td className="text-right text-green-400 opacity-80">
                            {m.totalIncome > 0 ? formatCurrency(m.totalIncome) : "—"}
                          </td>
                          <td className="text-right text-red-400 opacity-80">
                            {m.totalExpense > 0 ? formatCurrency(m.totalExpense) : "—"}
                          </td>
                          <td className={`text-right ${m.netIncome >= 0 ? "text-blue-400 opacity-70" : "text-red-400"}`}>
                            {m.totalIncome > 0 || m.totalExpense > 0 ? formatCurrencySigned(m.netIncome) : "—"}
                          </td>
                          <td className="text-right text-slate-600 text-xs hidden sm:table-cell">
                            {m.totalIncome > 0 ? `${rate.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  {/* Q小計行 */}
                  <tr
                    key={`q${q.q}-sub`}
                    className="border-t border-slate-700 font-semibold"
                    style={{ background: QUARTER_COLORS[qi] + "10" }}
                  >
                    <td className="text-sm pt-2 pb-2" style={{ color: QUARTER_COLORS[qi] }}>
                      {q.label} 小計
                    </td>
                    <td className="text-right pt-2 pb-2 text-green-400">{formatCurrency(q.income)}</td>
                    <td className="text-right pt-2 pb-2 text-red-400">{formatCurrency(q.expense)}</td>
                    <td className={`text-right pt-2 pb-2 font-bold ${q.netIncome >= 0 ? "text-blue-400" : "text-red-400"}`}>
                      {formatCurrencySigned(q.netIncome)}
                    </td>
                    <td className="text-right pt-2 pb-2 text-slate-400 text-sm hidden sm:table-cell">
                      {q.savingsRate.toFixed(1)}%
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Q別 支出カテゴリTOP5 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {data.quarters.map((q, i) => (
          <Card key={q.q}>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                style={{ background: QUARTER_COLORS[i] }}
              >
                {q.label}
              </span>
              <span className="text-slate-500 text-xs">支出TOP5</span>
            </div>
            <div className="space-y-1.5">
              {q.topCategories.map((c, ci) => (
                <div key={c.category} className="flex justify-between text-xs">
                  <span className="text-slate-400 truncate mr-2">
                    <span className="text-slate-600 mr-1">{ci + 1}.</span>{c.category}
                  </span>
                  <span className="text-red-400 shrink-0">{formatCurrency(c.total)}</span>
                </div>
              ))}
              {q.topCategories.length === 0 && (
                <p className="text-slate-600 text-xs">データなし</p>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* 定性分析 */}
      <AnalysisSection
        year={year}
        period="quarterly"
        analysis={analysis}
        onGenerated={onAnalysisGenerated}
      />
    </div>
  );
}
