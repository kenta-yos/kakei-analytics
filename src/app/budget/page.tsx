"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils";

type BudgetRow = {
  categoryName: string;
  allocation: number;
  carryover: number;
  totalBudget: number;
  actual: number;
  remaining: number;
  notes: string | null;
  hasBudget: boolean;
};

type CarryoverItem = {
  categoryName: string;
  prevTotalBudget: number;
  prevActual: number;
  carryover: number;
};

// 来月の年月を計算
function nextYearMonth(y: number, m: number) {
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}
function prevYearMonth(y: number, m: number) {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export default function BudgetPage() {
  const now = new Date();
  // デフォルトは「来月の予算を立てる」
  const next = nextYearMonth(now.getFullYear(), now.getMonth() + 1);
  const [year, setYear] = useState(next.year);
  const [month, setMonth] = useState(next.month);

  // 編集中の値 { カテゴリ名 → { allocation, carryover } }
  const [editMap, setEditMap] = useState<
    Record<string, { allocation: number; carryover: number; enabled: boolean }>
  >({});
  const [categories, setCategories] = useState<string[]>([]);
  const [prevMonthIncome, setPrevMonthIncome] = useState(0);
  const [prevActuals, setPrevActuals] = useState<Record<string, number>>({});
  const [existingBudgets, setExistingBudgets] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const prev = prevYearMonth(year, month);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. この月の既存予算 + 実績
      const budgetRes = await fetch(`/api/budgets?year=${year}&month=${month}`);
      const budgetJson = await budgetRes.json();
      const existing: BudgetRow[] = budgetJson.data ?? [];
      setExistingBudgets(existing);

      // 2. 前月の繰越計算
      const carryoverRes = await fetch(
        `/api/budgets/carryover?year=${year}&month=${month}`
      );
      const carryoverJson = await carryoverRes.json();
      const carryoverItems: CarryoverItem[] = carryoverJson.data ?? [];

      // 3. 前月の収入を取得
      const prevSummaryRes = await fetch(
        `/api/summary?year=${prev.year}&month=${prev.month}`
      );
      const prevSummaryJson = await prevSummaryRes.json();
      setPrevMonthIncome(prevSummaryJson.data?.totalIncome ?? 0);

      // 4. 前月の実績（参考値）
      const prevBudgetRes = await fetch(
        `/api/budgets?year=${prev.year}&month=${prev.month}`
      );
      const prevBudgetJson = await prevBudgetRes.json();
      const prevRows: BudgetRow[] = prevBudgetJson.data ?? [];
      const actualsMap: Record<string, number> = {};
      prevRows.forEach((r) => { actualsMap[r.categoryName] = r.actual; });
      setPrevActuals(actualsMap);

      // 5. この月に実際に使われているカテゴリ
      // 来月など実績がない月の場合、前月実績カテゴリをベースにする
      const allCats = Array.from(
        new Set([
          ...existing.map((r) => r.categoryName),
          ...carryoverItems.map((c) => c.categoryName),
          ...prevRows.map((r) => r.categoryName), // 前月実績ベース
        ])
      ).sort();
      setCategories(allCats);

      // 6. editMap を初期化
      // 既存予算がある場合はそれを使う、なければ繰越を自動設定
      const carryoverMap = new Map(
        carryoverItems.map((c) => [c.categoryName, c.carryover])
      );
      const existingMap = new Map(
        existing.filter((r) => r.hasBudget).map((r) => [r.categoryName, r])
      );

      const newEditMap: Record<
        string,
        { allocation: number; carryover: number; enabled: boolean }
      > = {};
      allCats.forEach((cat) => {
        const ex = existingMap.get(cat);
        if (ex) {
          // 既存予算あり → そのまま
          newEditMap[cat] = {
            allocation: ex.allocation,
            carryover: ex.carryover,
            enabled: true,
          };
        } else {
          // 繰越のみ自動設定（allocは0）
          newEditMap[cat] = {
            allocation: 0,
            carryover: carryoverMap.get(cat) ?? 0,
            enabled: (carryoverMap.get(cat) ?? 0) !== 0, // 繰越がある場合は自動ON
          };
        }
      });
      setEditMap(newEditMap);
    } finally {
      setLoading(false);
    }
  }, [year, month, prev.year, prev.month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function update(cat: string, key: "allocation" | "carryover" | "enabled", val: number | boolean) {
    setEditMap((prev) => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? { allocation: 0, carryover: 0, enabled: false }), [key]: val },
    }));
  }

  // 前月実績をallocationに一括コピー
  function fillFromPrevActuals() {
    setEditMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((cat) => {
        if (prevActuals[cat] !== undefined && prevActuals[cat] > 0) {
          next[cat] = { ...next[cat], allocation: prevActuals[cat], enabled: true };
        }
      });
      return next;
    });
  }

  async function saveBudgets() {
    setSaving(true);
    setSaved(false);
    try {
      const items = Object.entries(editMap)
        .filter(([, v]) => v.enabled)
        .map(([cat, v]) => ({
          categoryName: cat,
          allocation: v.allocation,
          carryover: v.carryover,
        }));

      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, items }),
      });
      setSaved(true);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  // 集計
  const enabledItems = Object.entries(editMap).filter(([, v]) => v.enabled);
  const totalAllocation = enabledItems.reduce((sum, [, v]) => sum + (v.allocation ?? 0), 0);
  const totalCarryover = enabledItems.reduce((sum, [, v]) => sum + (v.carryover ?? 0), 0);
  const totalBudget = totalAllocation + totalCarryover;
  const unallocated = prevMonthIncome - totalAllocation;
  const totalActual = existingBudgets.reduce((sum, r) => sum + r.actual, 0);

  const actualMap = new Map(existingBudgets.map((r) => [r.categoryName, r.actual]));

  return (
    <div className="p-4 sm:p-6">
      {/* ヘッダー */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">予算管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {prev.year}年{prev.month}月の収入を {year}年{month}月の各予算に配分する
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700"
          >
            {Array.from({ length: 9 }, (_, i) => 2019 + i).map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
      </div>

      {/* 収入配分サマリー */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Card className="border-green-800/40 bg-green-950/20">
          <CardTitle>前月収入（配分元）</CardTitle>
          <p className="text-xl font-bold text-green-400">{formatCurrency(prevMonthIncome)}</p>
          <p className="text-xs text-slate-500 mt-1">{prev.year}年{prev.month}月の実収入</p>
        </Card>
        <Card>
          <CardTitle>今月の新規割り当て</CardTitle>
          <p className="text-xl font-bold text-blue-400">{formatCurrency(totalAllocation)}</p>
          <p className={`text-xs mt-1 ${unallocated < 0 ? "text-red-400" : "text-slate-500"}`}>
            未配分: {formatCurrencySigned(unallocated)}
          </p>
        </Card>
        <Card>
          <CardTitle>前月繰越合計</CardTitle>
          <p className={`text-xl font-bold ${totalCarryover >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrencySigned(totalCarryover)}
          </p>
        </Card>
        <Card>
          <CardTitle>当月実績合計</CardTitle>
          <p className="text-xl font-bold text-white">{formatCurrency(totalActual)}</p>
          <p className="text-xs text-slate-500 mt-1">
            予算合計 {formatCurrency(totalBudget)}
          </p>
        </Card>
      </div>

      {/* 未配分アラート */}
      {unallocated < 0 && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-xl text-sm text-red-300">
          ⚠ 配分額が前月収入を {formatCurrency(-unallocated)} 超過しています
        </div>
      )}
      {unallocated > 0 && totalAllocation > 0 && (
        <div className="mb-4 p-3 bg-blue-900/20 border border-blue-800/50 rounded-xl text-sm text-blue-300">
          💡 {formatCurrency(unallocated)} がまだ未配分です
        </div>
      )}

      {/* メインテーブル */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <CardTitle>{year}年{month}月 カテゴリ別予算</CardTitle>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={fillFromPrevActuals}
              className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
            >
              前月実績で一括設定
            </button>
            <button
              onClick={saveBudgets}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {saved && <p className="text-green-400 text-xs mb-3">✓ 保存しました</p>}

        {loading ? (
          <p className="text-slate-500 text-sm py-8 text-center">読み込み中...</p>
        ) : categories.length === 0 ? (
          <p className="text-slate-500 text-sm py-8 text-center">
            CSVをインポートするとカテゴリが自動で表示されます
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="w-8">ON</th>
                  <th>カテゴリ</th>
                  <th className="text-right hidden sm:table-cell">
                    <span className="text-green-400">前月繰越</span>
                    <span className="text-slate-600 text-xs ml-1">(自動)</span>
                  </th>
                  <th className="text-right">今月割り当て</th>
                  <th className="text-right">合計予算</th>
                  <th className="text-right hidden sm:table-cell text-slate-400">前月実績<span className="text-slate-600 text-xs">（参考）</span></th>
                  <th className="text-right">当月実績</th>
                  <th className="text-right">残り</th>
                  <th className="w-28 hidden md:table-cell">進捗</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const edit = editMap[cat] ?? { allocation: 0, carryover: 0, enabled: false };
                  const totalB = (edit.allocation ?? 0) + (edit.carryover ?? 0);
                  const actual = actualMap.get(cat) ?? 0;
                  const remaining = totalB - actual;
                  const pct = totalB > 0 ? Math.min((actual / totalB) * 100, 100) : 0;
                  const over = totalB > 0 && actual > totalB;
                  const prevActual = prevActuals[cat] ?? 0;

                  return (
                    <tr key={cat} className={edit.enabled ? "" : "opacity-40"}>
                      {/* ON/OFF トグル */}
                      <td>
                        <input
                          type="checkbox"
                          checked={edit.enabled}
                          onChange={(e) => update(cat, "enabled", e.target.checked)}
                          className="w-4 h-4 accent-blue-500 cursor-pointer"
                        />
                      </td>
                      <td className="font-medium text-slate-200">{cat}</td>

                      {/* 前月繰越（読み取り専用 + 手動上書き可） */}
                      <td className="text-right hidden sm:table-cell">
                        <input
                          type="number"
                          value={edit.carryover}
                          onChange={(e) => update(cat, "carryover", Number(e.target.value))}
                          disabled={!edit.enabled}
                          className={`w-24 bg-slate-800 text-right text-sm px-2 py-1 rounded border border-slate-700 focus:border-green-500 outline-none disabled:opacity-50 ${
                            (edit.carryover ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                          }`}
                        />
                      </td>

                      {/* 今月割り当て */}
                      <td className="text-right">
                        <input
                          type="number"
                          value={edit.allocation}
                          onChange={(e) => update(cat, "allocation", Number(e.target.value))}
                          disabled={!edit.enabled}
                          className="w-20 sm:w-24 bg-slate-800 text-white text-right text-sm px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none disabled:opacity-50"
                        />
                      </td>

                      {/* 合計予算 */}
                      <td className="text-right text-white font-medium">
                        {edit.enabled ? formatCurrency(totalB) : "—"}
                      </td>

                      {/* 前月実績（参考） */}
                      <td className="text-right text-slate-500 text-xs hidden sm:table-cell">
                        {prevActual > 0 ? formatCurrency(prevActual) : "—"}
                      </td>

                      {/* 当月実績 */}
                      <td className="text-right text-slate-300">
                        {actual > 0 ? formatCurrency(actual) : "—"}
                      </td>

                      {/* 残り */}
                      <td className={`text-right font-medium ${
                        !edit.enabled ? "text-slate-600" : remaining < 0 ? "text-red-400" : "text-green-400"
                      }`}>
                        {edit.enabled && totalB > 0 ? formatCurrencySigned(remaining) : "—"}
                      </td>

                      {/* 進捗バー */}
                      <td className="hidden md:table-cell">
                        {edit.enabled && totalB > 0 && (
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                over ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-blue-500"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* 合計行 */}
                <tr className="border-t-2 border-slate-600 font-semibold">
                  <td colSpan={2} className="text-slate-300 pt-3">合計</td>
                  <td className={`text-right pt-3 hidden sm:table-cell ${totalCarryover >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatCurrencySigned(totalCarryover)}
                  </td>
                  <td className="text-right pt-3 text-blue-400">{formatCurrency(totalAllocation)}</td>
                  <td className="text-right pt-3 text-white">{formatCurrency(totalBudget)}</td>
                  <td className="text-right pt-3 text-slate-500 text-xs hidden sm:table-cell">
                    {Object.values(prevActuals).reduce((s, v) => s + v, 0) > 0
                      ? formatCurrency(Object.values(prevActuals).reduce((s, v) => s + v, 0))
                      : "—"}
                  </td>
                  <td className="text-right pt-3 text-slate-300">{formatCurrency(totalActual)}</td>
                  <td className={`text-right pt-3 font-medium ${
                    totalBudget - totalActual < 0 ? "text-red-400" : "text-green-400"
                  }`}>
                    {totalBudget > 0 ? formatCurrencySigned(totalBudget - totalActual) : "—"}
                  </td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 凡例 */}
      <Card className="mt-4">
        <CardTitle>操作ガイド</CardTitle>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>・<span className="text-white">ON チェック</span>: 予算管理するカテゴリをオンにする</li>
          <li>・<span className="text-green-400">前月繰越</span>: 前月の残り（±）が自動入力されます。手動上書き可</li>
          <li>・<span className="text-blue-400">今月割り当て</span>: 前月収入（{formatCurrency(prevMonthIncome)}）から配分する額を入力</li>
          <li>・<span className="text-slate-300">前月実績（参考）</span>: ボタン「前月実績で一括設定」で割り当て欄に一括コピーできます</li>
          <li>・予算を立てた後、当月中に実績が取り込まれると進捗バーが更新されます</li>
        </ul>
      </Card>
    </div>
  );
}
