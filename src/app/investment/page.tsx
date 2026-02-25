"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";

type ProductData = {
  productName: string;
  marketValue: number;
  costBasis: number;
  unrealizedGain: number;
  gainRate: number;
  hasRecord: boolean;
};

type HistoryPoint = {
  year: number;
  month: number;
  label: string;
  products: Record<string, { marketValue: number; costBasis: number }>;
  totalMarket: number;
  totalCost: number;
  totalGain: number;
};

const PRODUCT_COLORS: Record<string, { market: string; cost: string }> = {
  "iDeCo": { market: "#3b82f6", cost: "#93c5fd" },
  "SBI投資信託": { market: "#22c55e", cost: "#86efac" },
};

export default function InvestmentPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadCurrent = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/investment?year=${year}&month=${month}`);
      const json = await res.json();
      const data: ProductData[] = json.data?.products ?? [];
      setProducts(data);
      const initInputs: Record<string, string> = {};
      data.forEach((p) => {
        initInputs[p.productName] = p.hasRecord ? String(p.marketValue) : "";
      });
      setInputValues(initInputs);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/investment?history=true");
    const json = await res.json();
    setHistory(json.data ?? []);
  }, []);

  useEffect(() => { loadCurrent(); }, [loadCurrent]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function save() {
    setSaving(true);
    try {
      const valuations = Object.entries(inputValues)
        .filter(([, v]) => v !== "" && !isNaN(Number(v)))
        .map(([productName, v]) => ({ productName, marketValue: Number(v) }));

      await fetch("/api/investment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, valuations }),
      });
      setSaved(true);
      await loadCurrent();
      await loadHistory();
    } finally {
      setSaving(false);
    }
  }

  // グラフデータ（過去12ヶ月に絞る）
  const chartData = history.slice(-24).map((h) => ({
    label: `${h.year}/${String(h.month).padStart(2, "0")}`,
    iDeCo評価額: h.products["iDeCo"]?.marketValue ?? 0,
    iDeCoコスト: h.products["iDeCo"]?.costBasis ?? 0,
    SBI評価額: h.products["SBI投資信託"]?.marketValue ?? 0,
    SBIコスト: h.products["SBI投資信託"]?.costBasis ?? 0,
    合計評価額: h.totalMarket,
    合計コスト: h.totalCost,
  }));

  const totalMarket = products.reduce((s, p) => s + p.marketValue, 0);
  const totalCost = products.reduce((s, p) => s + p.costBasis, 0);
  const totalGain = totalMarket - totalCost;
  const totalGainRate = totalCost > 0 ? Math.round(((totalGain / totalCost) * 1000)) / 10 : 0;

  function navMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">投資管理</h1>
        <p className="text-slate-400 text-sm mt-0.5">月末評価額を登録すると家計簿の資産が自動更新されます</p>
      </div>

      {/* 月ナビゲーター */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navMonth(-1)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
        >
          ← 前月
        </button>
        <span className="text-white font-semibold text-lg min-w-[100px] text-center">
          {year}年{month}月
        </span>
        <button
          onClick={() => navMonth(1)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
        >
          翌月 →
        </button>
      </div>

      {/* 評価額入力 */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <CardTitle>{year}年{month}月末 評価額登録</CardTitle>
          <div className="flex items-center gap-2">
            {saved && <span className="text-green-400 text-xs">保存・資産反映しました</span>}
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
            >
              {saving ? "保存中..." : "保存（家計簿の資産も更新）"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500 text-sm py-4 text-center">読み込み中...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {products.map((p) => {
              const inputVal = inputValues[p.productName] ?? "";
              const inputNum = inputVal !== "" ? Number(inputVal) : p.marketValue;
              const gain = inputNum - p.costBasis;
              const gainRate = p.costBasis > 0 ? ((gain / p.costBasis) * 100) : 0;
              const color = PRODUCT_COLORS[p.productName];
              return (
                <div
                  key={p.productName}
                  className="bg-slate-800/50 rounded-xl p-4 border border-slate-700"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ background: color?.market ?? "#94a3b8" }}
                    />
                    <span className="text-white font-semibold">{p.productName}</span>
                    {p.hasRecord && (
                      <span className="text-xs text-green-400 border border-green-800 rounded px-1.5 py-0.5">登録済</span>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="text-slate-400 text-xs mb-1 block">評価額（月末時点）</label>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">¥</span>
                      <input
                        type="number"
                        value={inputVal}
                        onChange={(e) =>
                          setInputValues((prev) => ({ ...prev, [p.productName]: e.target.value }))
                        }
                        onFocus={(e) => e.target.select()}
                        placeholder="例: 500000"
                        style={{ fontSize: "16px" }}
                        className="flex-1 bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-slate-500 text-xs">累計投資コスト</p>
                      <p className="text-slate-300 font-medium">
                        {p.costBasis > 0 ? formatCurrency(p.costBasis) : "集計中..."}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 text-xs">含み損益</p>
                      <p className={`font-semibold ${gain >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {inputNum > 0 || p.marketValue > 0
                          ? `${gain >= 0 ? "+" : ""}${formatCurrency(gain)} (${gainRate >= 0 ? "+" : ""}${gainRate.toFixed(1)}%)`
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 合計 */}
        {totalMarket > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700 grid grid-cols-3 gap-4">
            <div>
              <p className="text-slate-500 text-xs">合計評価額</p>
              <p className="text-blue-400 font-bold text-lg">{formatCurrency(totalMarket)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">合計コスト</p>
              <p className="text-slate-300 font-medium">{formatCurrency(totalCost)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs">合計含み損益</p>
              <p className={`font-bold text-lg ${totalGain >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalGain >= 0 ? "+" : ""}{formatCurrency(totalGain)}
                <span className="text-sm ml-1">({totalGainRate >= 0 ? "+" : ""}{totalGainRate}%)</span>
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* 推移グラフ */}
      {chartData.length > 0 && (
        <Card className="mb-5">
          <CardTitle>評価額 vs 累計コスト 推移</CardTitle>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Legend />
              <Line type="monotone" dataKey="iDeCo評価額" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="iDeCoコスト" stroke="#93c5fd" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <Line type="monotone" dataKey="SBI評価額" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="SBIコスト" stroke="#86efac" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-slate-600 mt-1">実線 = 評価額、破線 = 累計投資コスト（振替から自動算出）</p>
        </Card>
      )}

      {/* 履歴テーブル */}
      {history.length > 0 && (
        <Card>
          <CardTitle>月次記録</CardTitle>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">年月</th>
                  <th className="text-right">iDeCo 評価額</th>
                  <th className="text-right">iDeCo 損益</th>
                  <th className="text-right">SBI投信 評価額</th>
                  <th className="text-right">SBI投信 損益</th>
                  <th className="text-right">合計評価額</th>
                  <th className="text-right">合計含み損益</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().slice(0, 24).map((h) => {
                  const ideco = h.products["iDeCo"];
                  const sbi = h.products["SBI投資信託"];
                  return (
                    <tr key={h.label}>
                      <td className="text-slate-400">{h.year}/{String(h.month).padStart(2, "0")}</td>
                      <td className="text-right text-slate-300">
                        {ideco ? formatCurrency(ideco.marketValue) : "—"}
                      </td>
                      <td className={`text-right text-sm font-medium ${
                        ideco && ideco.marketValue - ideco.costBasis >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {ideco && ideco.costBasis > 0
                          ? `${ideco.marketValue - ideco.costBasis >= 0 ? "+" : ""}${formatCurrency(ideco.marketValue - ideco.costBasis)}`
                          : "—"}
                      </td>
                      <td className="text-right text-slate-300">
                        {sbi ? formatCurrency(sbi.marketValue) : "—"}
                      </td>
                      <td className={`text-right text-sm font-medium ${
                        sbi && sbi.marketValue - sbi.costBasis >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {sbi && sbi.costBasis > 0
                          ? `${sbi.marketValue - sbi.costBasis >= 0 ? "+" : ""}${formatCurrency(sbi.marketValue - sbi.costBasis)}`
                          : "—"}
                      </td>
                      <td className="text-right text-blue-400 font-medium">
                        {formatCurrency(h.totalMarket)}
                      </td>
                      <td className={`text-right font-medium ${h.totalGain >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {h.totalCost > 0
                          ? `${h.totalGain >= 0 ? "+" : ""}${formatCurrency(h.totalGain)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
