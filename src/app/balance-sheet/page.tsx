"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import type { AssetSnapshot } from "@/lib/schema";

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

export default function BalanceSheetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() > 0 ? now.getMonth() : 12);
  const [assets, setAssets] = useState<AssetSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?type=asset&year=${year}`);
      const json = await res.json();
      const all: AssetSnapshot[] = json.data ?? [];
      setAssets(all.filter((a) => a.year === year && a.month === month));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const grouped = assets.reduce<GroupedAssets>((acc, a) => {
    const key = a.assetType as keyof GroupedAssets;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, { bank: [], credit: [], investment: [], ic_card: [], qr_pay: [], cash: [], other: [] });

  // 資産合計（クレカを除く）
  const totalAssets = assets
    .filter((a) => a.assetType !== "credit" && a.closingBalance > 0)
    .reduce((sum, a) => sum + a.closingBalance, 0);

  // 負債合計（クレカのマイナス残高）
  const totalLiabilities = assets
    .filter((a) => a.assetType === "credit")
    .reduce((sum, a) => sum + Math.abs(Math.min(a.closingBalance, 0)), 0);

  const netAssets = totalAssets - totalLiabilities;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">貸借対照表</h1>
          <p className="text-slate-400 text-sm mt-0.5">月末時点の資産・負債・純資産</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
            {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月末</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardTitle>資産合計</CardTitle>
          <p className="text-2xl font-bold text-blue-400">{formatCurrency(totalAssets)}</p>
        </Card>
        <Card>
          <CardTitle>負債合計</CardTitle>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(totalLiabilities)}</p>
        </Card>
        <Card>
          <CardTitle>純資産</CardTitle>
          <p className={`text-2xl font-bold ${netAssets >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrency(netAssets)}
          </p>
        </Card>
      </div>

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
            {grouped.credit.length > 0 ? (
              <Card>
                <div className="flex justify-between items-center mb-2">
                  <CardTitle>クレジットカード未払い</CardTitle>
                  <span className="text-red-400 font-semibold text-sm">{formatCurrency(totalLiabilities)}</span>
                </div>
                <table className="data-table">
                  <tbody>
                    {grouped.credit.map((a) => (
                      <tr key={a.id}>
                        <td className="text-slate-400">{a.assetName}</td>
                        <td className="text-right text-red-400">{formatCurrency(Math.abs(a.closingBalance))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ) : (
              <Card>
                <p className="text-slate-500 text-sm">負債なし</p>
              </Card>
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
