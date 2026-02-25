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

// エクセルと同じカテゴリ表示順（年別固定）
const CATEGORY_ORDER_BY_YEAR: Record<string, string[]> = {
  "2019": ["研究費", "カフェ", "娯楽費", "交際費", "交通費", "衣服・美容費", "生活費", "医療費", "光熱費", "通信費", "法律", "教育ビジネス", "特別経費M", "特別経費B", "旅行・帰省"],
  "2020": ["研究費", "カフェ", "娯楽費", "交際費", "交通費", "衣服・美容費", "生活費", "医療費", "家賃", "家賃補助", "通信費", "法律", "教育ビジネス", "特別経費M", "特別経費B", "旅行・帰省"],
  "2021": ["研究費", "カフェ", "娯楽費", "交際費", "交通費", "衣服・美容費", "生活費", "医療費", "家賃", "家賃補助", "通信費", "法律・教育", "特別経費M", "特別経費B", "脱毛", "旅行・帰省", "投資損益", "貯蓄"],
  "2022": ["研究費", "カフェ", "娯楽費", "交際費", "交通費", "美容費", "生活費", "医療費", "家賃", "通信費", "テニス", "特別経費M", "特別経費B", "ファッション", "旅行・帰省", "投資損益", "貯蓄（投信）"],
  "2023": ["研究費", "カフェ", "娯楽費", "交際費", "交通費", "美容費", "生活費", "医療費", "家賃", "通信費", "特別経費S", "特別経費B", "ファッション", "旅行・帰省", "FjordBootCamp", "投資損益", "貯蓄", "貯蓄（投信）", "会社立替"],
  "2024": ["食費", "研究", "カフェ", "娯楽費", "交際費・贅沢費", "交通費", "美容費", "生活消耗品費", "医療費", "家賃・光熱費", "通信費", "特別経費S", "特別経費B", "ファッション", "旅行・帰省", "FjordBootCamp", "投資損益", "貯蓄", "貯蓄（投信）", "会社立替"],
  "2025": ["食費", "研究", "カフェ", "娯楽費", "交際費・贅沢費", "交通費", "美容費", "生活消耗品費", "医療費", "家賃・光熱費", "通信費", "特別経費S", "特別経費B", "ファッション", "旅行・帰省", "同棲費", "貯蓄", "貯蓄（投信）", "会社立替"],
  "2026": ["食費", "研究", "カフェ", "娯楽費", "交際費・贅沢費", "交通費", "美容費", "生活消耗品費", "医療費", "家賃・光熱費", "通信費", "特別経費S", "特別経費B", "ファッション", "旅行・帰省", "貯蓄", "貯蓄（投信）", "会社立替"],
};

function sortByExcelOrder(cats: string[], year: number): string[] {
  const order = CATEGORY_ORDER_BY_YEAR[String(year)] ?? CATEGORY_ORDER_BY_YEAR["2026"];
  return [...cats].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "ja");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function prevYearMonth(y: number, m: number) {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}

export default function BudgetPage() {
  const now = new Date();
  // デフォルトは当月
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [isEditing, setIsEditing] = useState(false);

  // 編集中の値 { カテゴリ名 → { allocation, carryover } }
  const [editMap, setEditMap] = useState<
    Record<string, { allocation: number; carryover: number; enabled: boolean }>
  >({});
  const [categories, setCategories] = useState<string[]>([]);
  const [prevMonthIncome, setPrevMonthIncome] = useState(0);
  const [prevIncomeBreakdown, setPrevIncomeBreakdown] = useState<{ category: string; income: number }[]>([]);
  const [showIncomeBreakdown, setShowIncomeBreakdown] = useState(false);
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

      // 3. 前月の収入を取得（内訳含む）
      const prevSummaryRes = await fetch(
        `/api/summary?year=${prev.year}&month=${prev.month}`
      );
      const prevSummaryJson = await prevSummaryRes.json();
      setPrevMonthIncome(prevSummaryJson.data?.totalIncome ?? 0);
      const cats = prevSummaryJson.data?.categories ?? {};
      const breakdown = Object.entries(cats)
        .filter(([, v]) => (v as { income: number }).income > 0)
        .map(([cat, v]) => ({ category: cat, income: (v as { income: number }).income }))
        .sort((a, b) => b.income - a.income);
      setPrevIncomeBreakdown(breakdown);

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
      const allCats = sortByExcelOrder(Array.from(
        new Set([
          ...existing.map((r) => r.categoryName),
          ...carryoverItems.map((c) => c.categoryName),
          ...prevRows.map((r) => r.categoryName),
        ])
      ), year);
      setCategories(allCats);

      // 6. editMap を初期化
      const carryoverMap = new Map(
        carryoverItems.map((c) => [c.categoryName, c.carryover])
      );
      const existingMap = new Map(
        existing.filter((r) => r.hasBudget).map((r) => [r.categoryName, r])
      );

      // 標準予算を取得（既存予算が1件もない月のみ適用）
      let standardMap = new Map<string, number>();
      const hasBudgetCount = existing.filter((r) => r.hasBudget).length;
      if (hasBudgetCount === 0) {
        try {
          const sbRes = await fetch("/api/standard-budget");
          const sbJson = await sbRes.json();
          const standardItems: { categoryName: string; allocation: number }[] = sbJson.data?.items ?? [];
          standardMap = new Map(standardItems.filter((i) => i.allocation > 0).map((i) => [i.categoryName, i.allocation]));
        } catch {
          // 取得失敗時は無視
        }
      }

      const newEditMap: Record<
        string,
        { allocation: number; carryover: number; enabled: boolean }
      > = {};
      allCats.forEach((cat) => {
        const ex = existingMap.get(cat);
        if (ex) {
          newEditMap[cat] = {
            allocation: ex.allocation,
            carryover: ex.carryover,
            enabled: true,
          };
        } else {
          const stdAllocation = standardMap.get(cat) ?? 0;
          const carryover = carryoverMap.get(cat) ?? 0;
          newEditMap[cat] = {
            allocation: stdAllocation,
            carryover,
            enabled: stdAllocation !== 0 || carryover !== 0,
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

      {/* 前月収入 + 配分パネル */}
      <Card className="mb-4 border-green-800/40 bg-green-950/10">
        <div className="flex items-start justify-between flex-wrap gap-4">
          {/* 左: 前月収入 */}
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-slate-400 text-sm">{prev.year}年{prev.month}月の収入</span>
              {prevIncomeBreakdown.length > 0 && (
                <button
                  onClick={() => setShowIncomeBreakdown(!showIncomeBreakdown)}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition"
                >
                  内訳 {showIncomeBreakdown ? "▲" : "▼"}
                </button>
              )}
            </div>
            <p className="text-3xl sm:text-4xl font-bold text-green-400">{formatCurrency(prevMonthIncome)}</p>
          </div>

          {/* 右: 未配分残り */}
          <div className="text-right">
            <p className="text-slate-400 text-sm mb-1">未配分残り</p>
            {unallocated === 0 ? (
              <p className="text-2xl sm:text-3xl font-bold text-green-400">配分完了</p>
            ) : (
              <p className={`text-2xl sm:text-3xl font-bold ${unallocated < 0 ? "text-red-400" : "text-yellow-300"}`}>
                {formatCurrencySigned(unallocated)}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1">配分済み {formatCurrency(totalAllocation)}</p>
          </div>
        </div>

        {/* 配分進捗バー */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 mb-1.5">
            <span>0</span>
            <span>{prevMonthIncome > 0 ? Math.min(Math.round((totalAllocation / prevMonthIncome) * 100), 100) : 0}% 配分済み</span>
            <span>{formatCurrency(prevMonthIncome)}</span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                unallocated < 0 ? "bg-red-500" : unallocated === 0 ? "bg-green-500" : "bg-blue-500"
              }`}
              style={{ width: `${prevMonthIncome > 0 ? Math.min((totalAllocation / prevMonthIncome) * 100, 100) : 0}%` }}
            />
          </div>
        </div>

        {/* 収入内訳（展開時） */}
        {showIncomeBreakdown && prevIncomeBreakdown.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700/60">
            <p className="text-xs text-slate-500 mb-2">収入内訳</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1">
              {prevIncomeBreakdown.map(({ category, income }) => (
                <div key={category} className="flex justify-between text-sm py-0.5">
                  <span className="text-slate-400">{category}</span>
                  <span className="text-green-400 font-medium">{formatCurrency(income)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* サブ指標 */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Card>
          <CardTitle>前月繰越合計</CardTitle>
          <p className={`text-lg font-bold ${totalCarryover >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrencySigned(totalCarryover)}
          </p>
        </Card>
        <Card>
          <CardTitle>合計予算</CardTitle>
          <p className="text-lg font-bold text-white">{formatCurrency(totalBudget)}</p>
        </Card>
        <Card>
          <CardTitle>当月実績合計</CardTitle>
          <p className="text-lg font-bold text-slate-300">{formatCurrency(totalActual)}</p>
        </Card>
      </div>

      {/* メインテーブル */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <CardTitle>{year}年{month}月 カテゴリ別予算</CardTitle>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
            >
              編集
            </button>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => { loadData(); setIsEditing(false); }}
                className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
              >
                キャンセル
              </button>
              <button
                onClick={async () => { await saveBudgets(); setIsEditing(false); }}
                disabled={saving}
                className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>

        {saved && <p className="text-green-400 text-xs mb-3">保存しました</p>}

        {loading ? (
          <p className="text-slate-500 text-sm py-8 text-center">読み込み中...</p>
        ) : categories.length === 0 ? (
          <p className="text-slate-500 text-sm py-8 text-center">
            CSVをインポートするとカテゴリが自動で表示されます
          </p>
        ) : !isEditing ? (
          /* ---- 閲覧モード ---- */
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">カテゴリ</th>
                  <th className="text-right">合計予算</th>
                  <th className="text-right">当月実績</th>
                  <th className="text-right">残り</th>
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
                  return (
                    <tr key={cat}>
                      <td className="font-medium text-slate-200">{cat}</td>
                      <td className="text-right text-white">{totalB !== 0 ? formatCurrency(totalB) : "—"}</td>
                      <td className="text-right text-slate-300">{actual > 0 ? formatCurrency(actual) : "—"}</td>
                      <td className={`text-right font-medium ${remaining < 0 ? "text-red-400" : totalB !== 0 ? "text-green-400" : "text-slate-600"}`}>
                        {totalB !== 0 || actual > 0 ? formatCurrencySigned(remaining) : "—"}
                        {totalB > 0 && (
                          <div className="h-1 bg-slate-700 rounded-full overflow-hidden mt-1 w-full min-w-[60px]">
                            <div
                              className={`h-full rounded-full ${over ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-blue-500"}`}
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
                  <td className="text-slate-300 pt-3">合計</td>
                  <td className="text-right pt-3 text-white">{formatCurrency(totalBudget)}</td>
                  <td className="text-right pt-3 text-slate-300">{formatCurrency(totalActual)}</td>
                  <td className={`text-right pt-3 font-medium ${totalBudget - totalActual < 0 ? "text-red-400" : "text-green-400"}`}>
                    {totalBudget !== 0 ? formatCurrencySigned(totalBudget - totalActual) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          /* ---- 編集モード ---- */
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">カテゴリ</th>
                  {/* 前月繰越: モバイルでも表示 */}
                  <th className="text-right border-l-2 border-l-blue-800/50 text-blue-300/80">
                    前月繰越<span className="text-slate-600 text-xs ml-1">(自動)</span>
                  </th>
                  <th className="text-right text-blue-300/80">今月割り当て</th>
                  <th className="text-right text-blue-300/80">合計予算</th>
                  {/* 前月実績 */}
                  <th className="text-right hidden sm:table-cell border-l-2 border-l-slate-600/40">前月実績<span className="text-slate-600 text-xs">（参考）</span></th>
                  <th className="text-right">当月実績</th>
                  {/* 残高 */}
                  <th className="text-right border-l-2 border-l-emerald-700/50 text-emerald-300/80">残り</th>
                  <th className="w-28 hidden md:table-cell text-emerald-300/80">進捗</th>
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
                    <tr key={cat}>
                      <td className="font-medium text-slate-200">{cat}</td>

                      {/* 前月繰越（読み取り専用）- 常時表示 */}
                      <td className={`text-right border-l-2 border-l-blue-800/30 font-medium ${
                        (edit.carryover ?? 0) >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {formatCurrencySigned(edit.carryover)}
                      </td>

                      {/* 今月割り当て */}
                      <td className="text-right">
                        <input
                          type="number"
                          value={edit.allocation}
                          onChange={(e) => update(cat, "allocation", Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          style={{ fontSize: '16px' }}
                          className="w-20 sm:w-24 bg-slate-800 text-white text-right px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                        />
                      </td>

                      {/* 合計予算 */}
                      <td className="text-right text-white font-medium">
                        {formatCurrency(totalB)}
                      </td>

                      {/* 前月実績（参考） */}
                      <td className="text-right text-slate-500 text-xs hidden sm:table-cell border-l-2 border-l-slate-600/30">
                        {prevActual > 0 ? formatCurrency(prevActual) : "—"}
                      </td>

                      {/* 当月実績 */}
                      <td className="text-right text-slate-300">
                        {actual > 0 ? formatCurrency(actual) : "—"}
                      </td>

                      {/* 残り */}
                      <td className={`text-right font-medium border-l-2 border-l-emerald-800/30 ${
                        remaining < 0 ? "text-red-400" : totalB !== 0 ? "text-green-400" : "text-slate-600"
                      }`}>
                        {totalB !== 0 || actual > 0 ? formatCurrencySigned(remaining) : "—"}
                      </td>

                      {/* 進捗バー */}
                      <td className="hidden md:table-cell">
                        {totalB > 0 && (
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
                  <td className="text-slate-300 pt-3">合計</td>
                  <td className={`text-right pt-3 border-l-2 border-l-blue-800/30 ${totalCarryover >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatCurrencySigned(totalCarryover)}
                  </td>
                  <td className="text-right pt-3 text-blue-400">{formatCurrency(totalAllocation)}</td>
                  <td className="text-right pt-3 text-white">{formatCurrency(totalBudget)}</td>
                  <td className="text-right pt-3 text-slate-500 text-xs hidden sm:table-cell border-l-2 border-l-slate-600/30">
                    {Object.values(prevActuals).reduce((s, v) => s + v, 0) > 0
                      ? formatCurrency(Object.values(prevActuals).reduce((s, v) => s + v, 0))
                      : "—"}
                  </td>
                  <td className="text-right pt-3 text-slate-300">{formatCurrency(totalActual)}</td>
                  <td className={`text-right pt-3 font-medium border-l-2 border-l-emerald-800/30 ${
                    totalBudget - totalActual < 0 ? "text-red-400" : "text-green-400"
                  }`}>
                    {totalBudget !== 0 ? formatCurrencySigned(totalBudget - totalActual) : "—"}
                  </td>
                  <td className="hidden md:table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 凡例 */}
      {isEditing && (
        <Card className="mt-4">
          <CardTitle>操作ガイド</CardTitle>
          <ul className="text-xs text-slate-400 space-y-1">
            <li>・<span className="text-green-400">前月収入</span>を見ながら各カテゴリに予算を割り振る。未配分残りが 0 になるまで入力する</li>
            <li>・<span className="text-blue-300/80">予算列</span>（前月繰越・今月割り当て・合計予算）: 前月繰越は自動入力。今月割り当てを入力すると未配分残りにリアルタイム反映</li>
            <li>・実績列（前月実績・当月実績）: 参考値。編集不可</li>
            <li>・<span className="text-emerald-300/80">残高列</span>（残り・進捗）: 合計予算 − 当月実績を自動計算</li>
            <li>・予算が未設定の月は標準予算が自動的に適用されます。標準予算は<a href="/standard-budget" className="text-blue-400 hover:underline">標準予算設定</a>ページで変更できます</li>
          </ul>
        </Card>
      )}
    </div>
  );
}
