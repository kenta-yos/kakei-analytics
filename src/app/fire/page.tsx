"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";

type CurrentState = {
  netAssets: number;
  monthlyExpenseAuto: number;
  monthlySavingsAuto: number;
};

type Settings = {
  currentAge: number;
  expectedReturnRate: number; // 500 = 5.00%
  inflationRate: number;      // 200 = 2.00%
  fireMultiplier: number;
  monthlyExpenseOverride: number | null;
  monthlySavingsOverride: number | null;
};

type ScenarioResult = {
  label: string;
  returnRate: number;
  yearsToFire: number | null;
  fireAge: number | null;
  chartData: { year: number; assets: number }[];
};

function calcScenario(
  currentAssets: number,
  monthlySavings: number,
  annualReturnRate: number, // decimal e.g. 0.05
  inflationRate: number,    // decimal e.g. 0.02
  fireTarget: number,
  currentAge: number,
  maxYears = 60
): { years: number | null; chartData: { year: number; assets: number }[] } {
  const chartData: { year: number; assets: number }[] = [];
  let assets = currentAssets;
  const realReturn = annualReturnRate - inflationRate;
  const monthlyReal = realReturn / 12;

  for (let y = 0; y <= maxYears; y++) {
    chartData.push({ year: currentAge + y, assets: Math.round(assets) });
    if (y > 0 && chartData[y].assets >= fireTarget && chartData[y - 1].assets < fireTarget) {
      // already recorded, years = y
    }
    // advance one year
    for (let m = 0; m < 12; m++) {
      assets = assets * (1 + monthlyReal) + monthlySavings;
    }
    if (assets > fireTarget * 10) break; // cap for chart
  }

  // find first year where assets >= fireTarget
  const hitYear = chartData.find((d) => d.assets >= fireTarget);
  const years = hitYear ? hitYear.year - currentAge : null;

  return { years, chartData };
}

export default function FirePage() {
  const [currentState, setCurrentState] = useState<CurrentState | null>(null);
  const [settings, setSettings] = useState<Settings>({
    currentAge: 30,
    expectedReturnRate: 500,
    inflationRate: 200,
    fireMultiplier: 25,
    monthlyExpenseOverride: null,
    monthlySavingsOverride: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // local form state (strings for inputs)
  const [ageInput, setAgeInput] = useState("30");
  const [returnRateInput, setReturnRateInput] = useState("5.0");
  const [inflationInput, setInflationInput] = useState("2.0");
  const [multiplierInput, setMultiplierInput] = useState("25");
  const [expenseOverride, setExpenseOverride] = useState("");
  const [savingsOverride, setSavingsOverride] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/fire");
      const json = await res.json();
      const { settings: s, currentState: cs } = json.data;
      setCurrentState(cs);
      setSettings(s);
      setAgeInput(String(s.currentAge));
      setReturnRateInput((s.expectedReturnRate / 100).toFixed(1));
      setInflationInput((s.inflationRate / 100).toFixed(1));
      setMultiplierInput(String(s.fireMultiplier));
      setExpenseOverride(s.monthlyExpenseOverride ? String(s.monthlyExpenseOverride) : "");
      setSavingsOverride(s.monthlySavingsOverride ? String(s.monthlySavingsOverride) : "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/fire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentAge: parseInt(ageInput) || 30,
          expectedReturnRate: Math.round(parseFloat(returnRateInput) * 100) || 500,
          inflationRate: Math.round(parseFloat(inflationInput) * 100) || 200,
          fireMultiplier: parseInt(multiplierInput) || 25,
          monthlyExpenseOverride: expenseOverride ? parseInt(expenseOverride) : null,
          monthlySavingsOverride: savingsOverride ? parseInt(savingsOverride) : null,
        }),
      });
      setSaved(true);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  // compute derived values
  const currentAge = parseInt(ageInput) || 30;
  const returnRate = (parseFloat(returnRateInput) || 5.0) / 100;
  const inflation = (parseFloat(inflationInput) || 2.0) / 100;
  const multiplier = parseInt(multiplierInput) || 25;

  const monthlyExpense = expenseOverride
    ? parseInt(expenseOverride)
    : (currentState?.monthlyExpenseAuto ?? 0);
  const monthlySavings = savingsOverride
    ? parseInt(savingsOverride)
    : (currentState?.monthlySavingsAuto ?? 0);
  const currentAssets = currentState?.netAssets ?? 0;

  const fireTarget = monthlyExpense * 12 * multiplier;
  const achievementRate = fireTarget > 0 ? Math.min((currentAssets / fireTarget) * 100, 100) : 0;

  const scenarios: ScenarioResult[] = [
    { label: "悲観", returnRate: returnRate - 0.02 },
    { label: "基本", returnRate: returnRate },
    { label: "楽観", returnRate: returnRate + 0.02 },
  ].map((s) => {
    const r = calcScenario(currentAssets, monthlySavings, s.returnRate, inflation, fireTarget, currentAge);
    return {
      label: s.label,
      returnRate: s.returnRate,
      yearsToFire: r.years,
      fireAge: r.years !== null ? currentAge + r.years : null,
      chartData: r.chartData,
    };
  });

  // merge chart data for all 3 scenarios
  const maxLen = Math.max(...scenarios.map((s) => s.chartData.length));
  const mergedChart = Array.from({ length: maxLen }, (_, i) => {
    const age = currentAge + i;
    const point: Record<string, number> = { age };
    scenarios.forEach((s) => {
      const d = s.chartData[i];
      if (d) point[s.label] = Math.round(d.assets / 10000);
    });
    return point;
  });

  const SCENARIO_COLORS: Record<string, string> = {
    悲観: "#f59e0b",
    基本: "#3b82f6",
    楽観: "#22c55e",
  };

  const baseScenario = scenarios[1];
  const yearsText = baseScenario.yearsToFire !== null
    ? `${baseScenario.yearsToFire}年後（${baseScenario.fireAge}歳）`
    : "60年以内に達成困難";

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <p className="text-slate-500">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">FIRE計算機</h1>
        <p className="text-slate-400 text-sm mt-0.5">4%ルール（年間支出×倍率）でFIRE達成をシミュレーション</p>
      </div>

      {/* 現在の財務状況 */}
      <Card className="mb-5">
        <CardTitle>現在の財務状況（自動算出）</CardTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-3">
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">現在の純資産</p>
            <p className="text-blue-400 font-bold text-lg">{formatCurrency(currentAssets)}</p>
            <p className="text-slate-600 text-xs mt-0.5">最新月の資産合計</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">月間支出（12ヶ月平均）</p>
            <p className="text-white font-bold text-lg">{formatCurrency(currentState?.monthlyExpenseAuto ?? 0)}</p>
            {expenseOverride && (
              <p className="text-amber-400 text-xs mt-0.5">上書き: {formatCurrency(parseInt(expenseOverride))}</p>
            )}
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">月間積立（12ヶ月平均）</p>
            <p className={`font-bold text-lg ${(currentState?.monthlySavingsAuto ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
              {(currentState?.monthlySavingsAuto ?? 0) >= 0 ? "+" : ""}{formatCurrency(currentState?.monthlySavingsAuto ?? 0)}
            </p>
            {savingsOverride && (
              <p className="text-amber-400 text-xs mt-0.5">上書き: {formatCurrency(parseInt(savingsOverride))}</p>
            )}
          </div>
        </div>
      </Card>

      {/* FIRE目標サマリー */}
      <Card className="mb-5">
        <CardTitle>FIRE目標サマリー</CardTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700 col-span-2 sm:col-span-1">
            <p className="text-slate-500 text-xs mb-1">FIRE目標額</p>
            <p className="text-purple-400 font-bold text-lg">{formatCurrency(fireTarget)}</p>
            <p className="text-slate-600 text-xs mt-0.5">月{formatCurrency(monthlyExpense)} × 12 × {multiplier}倍</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">現在の達成率</p>
            <p className={`font-bold text-lg ${achievementRate >= 80 ? "text-green-400" : achievementRate >= 50 ? "text-yellow-400" : "text-white"}`}>
              {achievementRate.toFixed(1)}%
            </p>
            <div className="mt-2 bg-slate-700 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all"
                style={{ width: `${achievementRate}%` }}
              />
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">FIRE達成予測（基本）</p>
            <p className="text-blue-400 font-bold">{yearsText}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
            <p className="text-slate-500 text-xs mb-1">残り必要額</p>
            <p className="text-slate-300 font-bold text-lg">
              {fireTarget > currentAssets ? formatCurrency(fireTarget - currentAssets) : "達成済み！"}
            </p>
          </div>
        </div>
      </Card>

      {/* 設定 */}
      <Card className="mb-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <CardTitle>シミュレーション設定</CardTitle>
          <div className="flex items-center gap-2">
            {saved && <span className="text-green-400 text-xs">保存しました</span>}
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
            >
              {saving ? "保存中..." : "設定を保存"}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* 現在年齢 */}
          <div>
            <label className="text-slate-400 text-xs mb-1.5 block">現在年齢</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={ageInput}
                onChange={(e) => setAgeInput(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="w-24 bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 outline-none text-sm"
                style={{ fontSize: "16px" }}
              />
              <span className="text-slate-400 text-sm">歳</span>
            </div>
          </div>

          {/* 期待リターン率 */}
          <div>
            <label className="text-slate-400 text-xs mb-1.5 block">
              期待リターン率（年利）: <span className="text-white font-medium">{returnRateInput}%</span>
            </label>
            <input
              type="range"
              min="1" max="15" step="0.5"
              value={parseFloat(returnRateInput) || 5}
              onChange={(e) => setReturnRateInput(e.target.value)}
              className="w-full accent-blue-500"
            />
            <div className="flex justify-between text-slate-600 text-xs mt-0.5">
              <span>1%</span><span>8%</span><span>15%</span>
            </div>
          </div>

          {/* インフレ率 */}
          <div>
            <label className="text-slate-400 text-xs mb-1.5 block">
              インフレ率: <span className="text-white font-medium">{inflationInput}%</span>
            </label>
            <input
              type="range"
              min="0" max="5" step="0.5"
              value={parseFloat(inflationInput) || 2}
              onChange={(e) => setInflationInput(e.target.value)}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-slate-600 text-xs mt-0.5">
              <span>0%</span><span>2.5%</span><span>5%</span>
            </div>
          </div>

          {/* FIRE基準倍率 */}
          <div>
            <label className="text-slate-400 text-xs mb-1.5 block">FIRE基準倍率</label>
            <div className="flex gap-2">
              {[20, 25, 30, 33].map((m) => (
                <button
                  key={m}
                  onClick={() => setMultiplierInput(String(m))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    multiplierInput === String(m)
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {m}倍
                </button>
              ))}
            </div>
            <p className="text-slate-600 text-xs mt-1">
              {multiplierInput === "25" ? "4%ルール（標準）" :
               multiplierInput === "33" ? "3%ルール（保守的）" :
               multiplierInput === "20" ? "5%ルール（積極的）" : "カスタム"}
            </p>
          </div>

          {/* 月間支出（上書き） */}
          <div>
            <label className="text-slate-400 text-xs mb-1.5 block">
              月間支出（上書き）
              <span className="text-slate-600 ml-1">空欄 = 自動（{formatCurrency(currentState?.monthlyExpenseAuto ?? 0)}）</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">¥</span>
              <input
                type="number"
                value={expenseOverride}
                onChange={(e) => setExpenseOverride(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder={String(currentState?.monthlyExpenseAuto ?? "")}
                className="flex-1 bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 outline-none text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>

          {/* 月間積立（上書き） */}
          <div>
            <label className="text-slate-400 text-xs mb-1.5 block">
              月間積立（上書き）
              <span className="text-slate-600 ml-1">空欄 = 自動（{formatCurrency(currentState?.monthlySavingsAuto ?? 0)}）</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">¥</span>
              <input
                type="number"
                value={savingsOverride}
                onChange={(e) => setSavingsOverride(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder={String(currentState?.monthlySavingsAuto ?? "")}
                className="flex-1 bg-slate-700 text-white px-3 py-2 rounded-lg border border-slate-600 focus:border-blue-500 outline-none text-sm"
                style={{ fontSize: "16px" }}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* 3シナリオ比較 */}
      <Card className="mb-5">
        <CardTitle>シナリオ比較（リターン率別）</CardTitle>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 pb-2 pr-4">シナリオ</th>
                <th className="text-right text-slate-400 pb-2 pr-4">リターン率</th>
                <th className="text-right text-slate-400 pb-2 pr-4">実質リターン</th>
                <th className="text-right text-slate-400 pb-2 pr-4">達成年数</th>
                <th className="text-right text-slate-400 pb-2">達成年齢</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.label} className="border-b border-slate-800">
                  <td className="py-3 pr-4">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full mr-2"
                      style={{ background: SCENARIO_COLORS[s.label] }}
                    />
                    <span className="text-white font-medium">{s.label}</span>
                  </td>
                  <td className="text-right py-3 pr-4 text-slate-300">
                    {(s.returnRate * 100).toFixed(1)}%
                  </td>
                  <td className="text-right py-3 pr-4 text-slate-300">
                    {((s.returnRate - inflation) * 100).toFixed(1)}%
                  </td>
                  <td className="text-right py-3 pr-4">
                    {s.yearsToFire !== null ? (
                      <span className="text-white font-semibold">{s.yearsToFire}年後</span>
                    ) : (
                      <span className="text-red-400">60年超</span>
                    )}
                  </td>
                  <td className="text-right py-3">
                    {s.fireAge !== null ? (
                      <span
                        className="font-bold"
                        style={{ color: SCENARIO_COLORS[s.label] }}
                      >
                        {s.fireAge}歳
                      </span>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 資産推移グラフ */}
      <Card>
        <CardTitle>資産推移シミュレーション</CardTitle>
        <p className="text-xs text-slate-500 mt-1 mb-3">インフレ調整済み実質値・万円単位</p>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={mergedChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v) => `${v}歳`}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              tickFormatter={(v) => `${v}万`}
            />
            <Tooltip
              formatter={(v: number) => [`${v.toLocaleString()}万円`, ""]}
              labelFormatter={(l) => `${l}歳`}
            />
            <Legend />
            <ReferenceLine
              y={Math.round(fireTarget / 10000)}
              stroke="#a855f7"
              strokeDasharray="6 3"
              label={{ value: "FIRE目標", fill: "#a855f7", fontSize: 11 }}
            />
            {scenarios.map((s) => (
              <Line
                key={s.label}
                type="monotone"
                dataKey={s.label}
                stroke={SCENARIO_COLORS[s.label]}
                strokeWidth={s.label === "基本" ? 2.5 : 1.5}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
