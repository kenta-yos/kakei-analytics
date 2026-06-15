"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import type { AssetSnapshot } from "@/lib/schema";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";

type GroupedAssets = {
  bank: AssetSnapshot[];
  credit: AssetSnapshot[];
  investment: AssetSnapshot[];
  ic_card: AssetSnapshot[];
  qr_pay: AssetSnapshot[];
  cash: AssetSnapshot[];
  other: AssetSnapshot[];
};

const TYPE_LABELS: Record<string, string> = {
  bank: "銀行口座",
  credit: "クレジットカード（負債）",
  investment: "投資・証券",
  ic_card: "IC カード",
  qr_pay: "QR 決済",
  cash: "現金",
  other: "その他",
};

// 四半期末月
const Q_MONTH: Record<number, number> = { 1: 3, 2: 6, 3: 9, 4: 12 };

export default function BalanceSheetPage() {
  const now = new Date();
  const [mode, setMode] = useState<"yearly" | "quarterly" | "monthly">("monthly");
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((now.getMonth() + 1) / 3));
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [assets, setAssets] = useState<AssetSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<{ key: string; label: string; netAssets: number }[]>([]);

  // 実際に使う月を計算
  const effectiveMonth = mode === "yearly" ? 12 : mode === "quarterly" ? Q_MONTH[quarter] : month;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?type=asset&year=${year}&month=${effectiveMonth}`);
      const json = await res.json();
      setAssets((json.data ?? []) as AssetSnapshot[]);
    } finally {
      setLoading(false);
    }
  }, [year, effectiveMonth]);

  // チャートデータ取得
  const fetchChartData = useCallback(async () => {
    const periods: { key: string; label: string; y: number; m: number }[] = [];
    if (mode === "monthly") {
      for (let m = 1; m <= 12; m++) periods.push({ key: String(m), label: `${m}月`, y: year, m });
    } else if (mode === "quarterly") {
      for (let q = 1; q <= 4; q++) periods.push({ key: String(q), label: `Q${q}`, y: year, m: Q_MONTH[q] });
    } else {
      for (let y = 2019; y <= new Date().getFullYear(); y++) periods.push({ key: String(y), label: String(y), y, m: 12 });
    }
    const results = await Promise.all(
      periods.map(async (p) => {
        const res = await fetch(`/api/analytics?type=asset&year=${p.y}&month=${p.m}`);
        const json = await res.json();
        const snapshots = (json.data ?? []) as AssetSnapshot[];
        const totalA = snapshots.filter(a => a.closingBalance > 0).reduce((s, a) => s + a.closingBalance, 0);
        const totalL = snapshots.filter(a => a.closingBalance < 0).reduce((s, a) => s + Math.abs(a.closingBalance), 0);
        return { key: p.key, label: p.label, netAssets: totalA - totalL };
      })
    );
    setChartData(results);
  }, [mode, year]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchChartData(); }, [fetchChartData]);

  const grouped = assets.reduce<GroupedAssets>((acc, a) => {
    const key = a.assetType as keyof GroupedAssets;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, { bank: [], credit: [], investment: [], ic_card: [], qr_pay: [], cash: [], other: [] });

  const totalAssets = assets.filter((a) => a.closingBalance > 0).reduce((sum, a) => sum + a.closingBalance, 0);
  const totalLiabilities = assets.filter((a) => a.closingBalance < 0).reduce((sum, a) => sum + Math.abs(a.closingBalance), 0);
  const netAssets = totalAssets - totalLiabilities;

  // 表示ラベル
  const periodLabel = mode === "yearly"
    ? `${year}年12月末`
    : mode === "quarterly"
    ? `${year}年Q${quarter}末（${Q_MONTH[quarter]}月末）`
    : `${year}年${month}月末`;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">貸借対照表</h1>
          <p className="text-slate-400 text-sm mt-0.5">{periodLabel}時点の資産・負債・純資産</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* モード切り替え */}
          <div className="flex bg-slate-800 rounded-lg p-0.5">
            {(["yearly", "quarterly", "monthly"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm rounded-md transition ${mode === m ? "bg-blue-600 text-white" : "text-slate-400"}`}>
                {m === "yearly" ? "年次" : m === "quarterly" ? "四半期" : "月次"}
              </button>
            ))}
          </div>

          {/* 年 */}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
            {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>

          {/* 四半期選択 */}
          {mode === "quarterly" && (
            <div className="flex bg-slate-800 rounded-lg p-0.5">
              {[1, 2, 3, 4].map((q) => (
                <button key={q} onClick={() => setQuarter(q)}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${quarter === q ? "bg-blue-600 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                  Q{q}
                </button>
              ))}
            </div>
          )}

          {/* 月選択 */}
          {mode === "monthly" && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{m}月末</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardTitle>資産合計</CardTitle>
          <p className="text-xl sm:text-2xl font-bold text-blue-400">{formatCurrency(totalAssets)}</p>
        </Card>
        <Card>
          <CardTitle>負債合計</CardTitle>
          <p className="text-xl sm:text-2xl font-bold text-red-400">{formatCurrency(totalLiabilities)}</p>
        </Card>
        <Card>
          <CardTitle>純資産</CardTitle>
          <p className={`text-xl sm:text-2xl font-bold ${netAssets >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrency(netAssets)}
          </p>
        </Card>
      </div>

      {/* 純資産推移チャート */}
      {chartData.length > 0 && (
        <Card className="mb-6">
          <CardTitle>純資産推移</CardTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}万`} />
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v: number) => [formatCurrency(v), "純資産"]}
              />
              <ReferenceLine y={0} stroke="#475569" />
              <Bar dataKey="netAssets" name="純資産" cursor="pointer"
                onClick={(d: { key: string }) => {
                  if (mode === "monthly") setMonth(Number(d.key));
                  else if (mode === "quarterly") setQuarter(Number(d.key));
                  else setYear(Number(d.key));
                }}>
                {chartData.map((d) => {
                  const selected = mode === "monthly" ? String(month) : mode === "quarterly" ? String(quarter) : String(year);
                  return (
                    <Cell key={d.key} fill={d.netAssets >= 0 ? "#22c55e" : "#ef4444"}
                      opacity={d.key === selected ? 1 : 0.5} />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {loading ? (
        <p className="text-slate-500">読み込み中...</p>
      ) : assets.length === 0 ? (
        <Card>
          <p className="text-slate-500 text-sm">この期間のデータがありません。資産別レポートをインポートしてください。</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 資産側 */}
          <div className="space-y-4">
            <h2 className="text-white font-semibold text-base">資産</h2>
            {(["bank", "investment", "ic_card", "qr_pay", "cash", "other"] as const).map((type) => {
              const items = grouped[type].filter((a) => a.closingBalance >= 0);
              if (items.length === 0) return null;
              const subtotal = items.reduce((sum, a) => sum + a.closingBalance, 0);
              return (
                <Card key={type}>
                  <div className="flex justify-between items-center mb-2">
                    <CardTitle>{TYPE_LABELS[type]}</CardTitle>
                    <span className="text-blue-400 font-semibold text-sm">{formatCurrency(subtotal)}</span>
                  </div>
                  <table className="data-table">
                    <tbody>
                      {items.sort((a, b) => b.closingBalance - a.closingBalance).map((a) => (
                        <tr key={a.id}>
                          <td className="text-slate-400">{a.assetName}</td>
                          <td className="text-right text-white">{formatCurrency(a.closingBalance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              );
            })}
          </div>

          {/* 負債側 */}
          <div className="space-y-4">
            <h2 className="text-white font-semibold text-base">負債</h2>
            {assets.filter((a) => a.closingBalance < 0).length > 0 ? (
              <Card>
                <div className="flex justify-between items-center mb-2">
                  <CardTitle>負債</CardTitle>
                  <span className="text-red-400 font-semibold text-sm">{formatCurrency(totalLiabilities)}</span>
                </div>
                <table className="data-table">
                  <tbody>
                    {assets.filter((a) => a.closingBalance < 0).sort((a, b) => a.closingBalance - b.closingBalance).map((a) => (
                      <tr key={a.id}>
                        <td className="text-slate-400">{a.assetName}</td>
                        <td className="text-right text-red-400">{formatCurrency(Math.abs(a.closingBalance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <Card><p className="text-slate-500 text-sm">負債なし</p></Card>
            )}

            {/* 純資産サマリー */}
            <Card className="border-blue-800/50">
              <CardTitle>純資産計算</CardTitle>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">資産合計</span>
                  <span className="text-blue-400">{formatCurrency(totalAssets)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">負債合計</span>
                  <span className="text-red-400">− {formatCurrency(totalLiabilities)}</span>
                </div>
                <div className="flex justify-between font-bold border-t border-slate-700 pt-2">
                  <span className="text-white">純資産</span>
                  <span className={netAssets >= 0 ? "text-green-400" : "text-red-400"}>
                    {formatCurrency(netAssets)}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
