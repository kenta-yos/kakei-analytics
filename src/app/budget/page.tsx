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

type TxRow = {
  id: number;
  date: string;
  itemName: string | null;
  expenseAmount: number;
  incomeAmount: number;
  type: string;
};

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

// 貯蓄・積立扱いのカテゴリ（支出として発生しない）
const SAVINGS_CATEGORIES = new Set(["貯蓄", "貯蓄（投信）"]);

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
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [isEditing, setIsEditing] = useState(false);

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

  // 内訳展開
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [txCache, setTxCache] = useState<Record<string, TxRow[]>>({});
  const [txLoading, setTxLoading] = useState(false);

  const prev = prevYearMonth(year, month);

  const loadData = useCallback(async () => {
    setLoading(true);
    setExpandedCategory(null);
    setTxCache({});
    try {
      const [budgetRes, carryoverRes, prevSummaryRes, prevBudgetRes] = await Promise.all([
        fetch(`/api/budgets?year=${year}&month=${month}`),
        fetch(`/api/budgets/carryover?year=${year}&month=${month}`),
        fetch(`/api/summary?year=${prev.year}&month=${prev.month}`),
        fetch(`/api/budgets?year=${prev.year}&month=${prev.month}`),
      ]);
      const [budgetJson, carryoverJson, prevSummaryJson, prevBudgetJson] = await Promise.all([
        budgetRes.json(), carryoverRes.json(), prevSummaryRes.json(), prevBudgetRes.json(),
      ]);

      const existing: BudgetRow[] = budgetJson.data ?? [];
      setExistingBudgets(existing);

      const carryoverItems: CarryoverItem[] = carryoverJson.data ?? [];

      setPrevMonthIncome(prevSummaryJson.data?.totalIncome ?? 0);
      const cats = prevSummaryJson.data?.categories ?? {};
      const breakdown = Object.entries(cats)
        .filter(([, v]) => (v as { income: number }).income > 0)
        .map(([cat, v]) => ({ category: cat, income: (v as { income: number }).income }))
        .sort((a, b) => b.income - a.income);
      setPrevIncomeBreakdown(breakdown);

      const prevRows: BudgetRow[] = prevBudgetJson.data ?? [];
      const actualsMap: Record<string, number> = {};
      prevRows.forEach((r) => { actualsMap[r.categoryName] = r.actual; });
      setPrevActuals(actualsMap);

      const allCats = sortByExcelOrder(Array.from(
        new Set([
          ...existing.map((r) => r.categoryName),
          ...carryoverItems.map((c) => c.categoryName),
          ...prevRows.map((r) => r.categoryName),
        ])
      ), year);
      setCategories(allCats);

      const carryoverMap = new Map(carryoverItems.map((c) => [c.categoryName, c.carryover]));
      const existingMap = new Map(existing.filter((r) => r.hasBudget).map((r) => [r.categoryName, r]));

      let standardMap = new Map<string, number>();
      const hasBudgetCount = existing.filter((r) => r.hasBudget).length;
      if (hasBudgetCount === 0) {
        try {
          const sbRes = await fetch("/api/standard-budget");
          const sbJson = await sbRes.json();
          const standardItems: { categoryName: string; allocation: number }[] = sbJson.data?.items ?? [];
          standardMap = new Map(standardItems.filter((i) => i.allocation > 0).map((i) => [i.categoryName, i.allocation]));
        } catch { /* ignore */ }
      }

      const newEditMap: Record<string, { allocation: number; carryover: number; enabled: boolean }> = {};
      allCats.forEach((cat) => {
        const ex = existingMap.get(cat);
        if (ex) {
          newEditMap[cat] = { allocation: ex.allocation, carryover: carryoverMap.get(cat) ?? 0, enabled: true };
        } else {
          const stdAllocation = standardMap.get(cat) ?? 0;
          const carryover = carryoverMap.get(cat) ?? 0;
          newEditMap[cat] = { allocation: stdAllocation, carryover, enabled: stdAllocation !== 0 || carryover !== 0 };
        }
      });
      setEditMap(newEditMap);
    } finally {
      setLoading(false);
    }
  }, [year, month, prev.year, prev.month]);

  useEffect(() => { loadData(); }, [loadData]);

  function update(cat: string, key: "allocation" | "carryover" | "enabled", val: number | boolean) {
    setEditMap((prev) => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? { allocation: 0, carryover: 0, enabled: false }), [key]: val },
    }));
  }

  async function saveBudgets() {
    setSaving(true);
    setSaved(false);
    try {
      const items = Object.entries(editMap).map(([cat, v]) => ({
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

  async function toggleExpand(cat: string) {
    if (expandedCategory === cat) {
      setExpandedCategory(null);
      return;
    }
    setExpandedCategory(cat);
    if (txCache[cat]) return;
    setTxLoading(true);
    try {
      const res = await fetch(
        `/api/transactions?year=${year}&month=${month}&category=${encodeURIComponent(cat)}&type=支出&limit=20`
      );
      const json = await res.json();
      setTxCache((prev) => ({ ...prev, [cat]: json.data ?? [] }));
    } finally {
      setTxLoading(false);
    }
  }

  // 集計
  const enabledItems = Object.entries(editMap).filter(([, v]) => v.enabled);
  const totalAllocation = enabledItems.reduce((sum, [, v]) => sum + (v.allocation ?? 0), 0);
  const totalCarryover = enabledItems.reduce((sum, [, v]) => sum + (v.carryover ?? 0), 0);
  const totalBudget = totalAllocation + totalCarryover;
  const unallocated = prevMonthIncome - totalAllocation;
  const actualMap = new Map(existingBudgets.map((r) => [r.categoryName, r.actual]));

  const expenseCats = categories.filter((c) => !SAVINGS_CATEGORIES.has(c));
  const savingsCats = categories.filter((c) => SAVINGS_CATEGORIES.has(c));

  const expenseTotal = {
    budget: expenseCats.reduce((s, c) => s + (editMap[c]?.allocation ?? 0) + (editMap[c]?.carryover ?? 0), 0),
    actual: expenseCats.reduce((s, c) => s + (actualMap.get(c) ?? 0), 0),
  };
  const savingsTotal = {
    budget: savingsCats.reduce((s, c) => s + (editMap[c]?.allocation ?? 0) + (editMap[c]?.carryover ?? 0), 0),
    actual: savingsCats.reduce((s, c) => s + (actualMap.get(c) ?? 0), 0),
  };

  return (
    <div className="p-4 sm:p-6">
      {/* ヘッダー */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">予算管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {year}年{month}月の予算と実績
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
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
            >
              編集
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { loadData(); setIsEditing(false); }}
                className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
              >
                キャンセル
              </button>
              <button
                onClick={async () => { await saveBudgets(); setIsEditing(false); }}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          )}
        </div>
      </div>

      {saved && <p className="text-green-400 text-xs mb-3">保存しました</p>}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-500">読み込み中...</div>
      ) : categories.length === 0 ? (
        <p className="text-slate-500 text-sm py-8 text-center">CSVをインポートするとカテゴリが自動で表示されます</p>
      ) : !isEditing ? (
        /* ────────────────────────────────
           閲覧モード
        ──────────────────────────────── */
        <div className="space-y-2">
          {/* 支出カテゴリ */}
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700/60 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">支出</span>
              <span className={`text-xs font-semibold tabular-nums ${expenseTotal.budget - expenseTotal.actual < 0 ? "text-red-400" : "text-green-400"}`}>
                残 {formatCurrencySigned(expenseTotal.budget - expenseTotal.actual)}
              </span>
            </div>

            <div className="divide-y divide-slate-800/60">
              {expenseCats.map((cat) => {
                const edit = editMap[cat] ?? { allocation: 0, carryover: 0, enabled: false };
                const totalB = (edit.allocation ?? 0) + (edit.carryover ?? 0);
                const actual = actualMap.get(cat) ?? 0;
                const remaining = totalB - actual;
                const pct = totalB > 0 ? Math.min((actual / totalB) * 100, 100) : 0;
                const over = totalB > 0 && actual > totalB;
                const isExpanded = expandedCategory === cat;
                const txList = txCache[cat];
                const hasData = totalB > 0 || actual > 0;

                return (
                  <div key={cat}>
                    <div className="px-4 py-3">
                      <p className="font-medium text-slate-200 text-sm mb-2 leading-tight">{cat}</p>

                      {/* 予算 / 実績 / 残り — 3列 */}
                      <div className="grid grid-cols-3 gap-1 mb-2">
                        <div>
                          <p className="text-xs text-slate-500 mb-0.5">予算</p>
                          <p className="text-sm font-medium text-slate-300 tabular-nums">
                            {hasData ? formatCurrencySigned(totalB) : "—"}
                          </p>
                          {(edit.carryover ?? 0) !== 0 && (
                            <p className={`text-xs tabular-nums ${edit.carryover > 0 ? "text-blue-400" : "text-red-400"}`}>
                              繰越 {formatCurrencySigned(edit.carryover)}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-0.5">実績</p>
                          <button
                            onClick={() => toggleExpand(cat)}
                            disabled={actual === 0}
                            className={`text-sm font-medium tabular-nums flex items-center gap-0.5 transition ${
                              actual > 0 ? "text-slate-300 hover:text-white" : "text-slate-600 cursor-default"
                            }`}
                          >
                            {actual > 0 ? formatCurrency(actual) : "—"}
                            {actual > 0 && <span className="text-slate-500 text-xs">{isExpanded ? "▲" : "▼"}</span>}
                          </button>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-0.5">残り</p>
                          <p className={`text-sm font-bold tabular-nums ${
                            !hasData ? "text-slate-600"
                            : remaining < 0 ? "text-red-400"
                            : remaining === 0 ? "text-slate-400"
                            : "text-green-400"
                          }`}>
                            {hasData ? formatCurrencySigned(remaining) : "—"}
                          </p>
                        </div>
                      </div>

                      {/* 進捗バー */}
                      {totalB > 0 && (
                        <div className="h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-blue-500"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* 取引内訳（展開時） */}
                    {isExpanded && (
                      <div className="bg-slate-900/60 border-t border-slate-700/40 px-4 py-2">
                        {txLoading && !txList ? (
                          <p className="text-xs text-slate-500 py-2 text-center">読み込み中...</p>
                        ) : txList && txList.length > 0 ? (
                          <div className="space-y-1">
                            {txList.map((tx) => (
                              <div key={tx.id} className="flex items-center justify-between py-0.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-slate-500 text-xs shrink-0 tabular-nums">{tx.date.slice(5)}</span>
                                  <span className="text-slate-400 text-xs truncate">
                                    {tx.itemName || "(項目名なし)"}
                                  </span>
                                </div>
                                <span className="text-slate-300 text-xs font-medium tabular-nums shrink-0 ml-2">
                                  {formatCurrency(tx.expenseAmount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-600 py-1">取引明細なし</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* 貯蓄・積立セクション（配分額の確認のみ） */}
          {savingsCats.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-800/60 border-b border-slate-700/60">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">貯蓄・積立</span>
              </div>
              <div className="divide-y divide-slate-800/60">
                {savingsCats.map((cat) => {
                  const edit = editMap[cat] ?? { allocation: 0, carryover: 0, enabled: false };
                  const allocation = edit.allocation ?? 0;
                  const total = (edit.carryover ?? 0) + allocation;
                  return (
                    <div key={cat} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-200 text-sm">{cat}</span>
                        <span className="text-purple-200 font-bold tabular-nums text-sm">
                          {total > 0 ? formatCurrency(total) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">今月配分</span>
                        <span className="text-xs text-purple-400 tabular-nums">{allocation > 0 ? formatCurrency(allocation) : "—"}</span>
                      </div>
                    </div>
                  );
                })}
                {/* 合計行 */}
                <div className="px-4 py-3 bg-slate-800/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-sm font-semibold">合計</span>
                    <span className="text-purple-200 font-bold tabular-nums text-sm">
                      {formatCurrency(savingsCats.reduce((s, c) => s + (editMap[c]?.carryover ?? 0) + (editMap[c]?.allocation ?? 0), 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">今月配分</span>
                    <span className="text-xs text-purple-400 tabular-nums">
                      {formatCurrency(savingsCats.reduce((s, c) => s + (editMap[c]?.allocation ?? 0), 0))}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 合計サマリー（貯蓄を除く支出のみ） */}
          <div className="grid grid-cols-3 gap-2 mt-1">
            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
              <p className="text-slate-500 text-xs mb-1">支出予算</p>
              <p className="text-white font-bold text-sm tabular-nums">{formatCurrency(expenseTotal.budget)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
              <p className="text-slate-500 text-xs mb-1">支出実績</p>
              <p className="text-slate-300 font-bold text-sm tabular-nums">{formatCurrency(expenseTotal.actual)}</p>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50 text-center">
              <p className="text-slate-500 text-xs mb-1">残り</p>
              <p className={`font-bold text-sm tabular-nums ${
                expenseTotal.budget - expenseTotal.actual < 0 ? "text-red-400" : "text-green-400"
              }`}>
                {formatCurrencySigned(expenseTotal.budget - expenseTotal.actual)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ────────────────────────────────
           編集モード
        ──────────────────────────────── */
        <div className="space-y-4">
          {/* 収入 + 未配分バー（編集時のみ表示） */}
          <Card className="border-green-800/40 bg-green-950/10">
            <div className="flex items-start justify-between flex-wrap gap-4">
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
                <p className="text-3xl font-bold text-green-400 tabular-nums">{formatCurrency(prevMonthIncome)}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm mb-1">未配分残り</p>
                {unallocated === 0 ? (
                  <p className="text-2xl font-bold text-green-400">配分完了</p>
                ) : (
                  <p className={`text-2xl font-bold tabular-nums ${unallocated < 0 ? "text-red-400" : "text-yellow-300"}`}>
                    {formatCurrencySigned(unallocated)}
                  </p>
                )}
                <p className="text-xs text-slate-500 mt-1 tabular-nums">配分済み {formatCurrency(totalAllocation)}</p>
              </div>
            </div>

            <div className="mt-3">
              <div className="h-2.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    unallocated < 0 ? "bg-red-500" : unallocated === 0 ? "bg-green-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${prevMonthIncome > 0 ? Math.min((totalAllocation / prevMonthIncome) * 100, 100) : 0}%` }}
                />
              </div>
            </div>

            {showIncomeBreakdown && prevIncomeBreakdown.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-700/60">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                  {prevIncomeBreakdown.map(({ category, income }) => (
                    <div key={category} className="flex justify-between text-sm py-0.5">
                      <span className="text-slate-400">{category}</span>
                      <span className="text-green-400 font-medium tabular-nums">{formatCurrency(income)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* 編集テーブル */}
          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 bg-slate-800/60">
                    <th className="text-left px-3 py-2.5 text-slate-400 font-medium min-w-[7rem]">カテゴリ</th>
                    <th className="text-right px-3 py-2.5 text-blue-300/80 font-medium whitespace-nowrap">繰越</th>
                    <th className="text-right px-3 py-2.5 text-blue-300/80 font-medium whitespace-nowrap">今月割当</th>
                    <th className="text-right px-3 py-2.5 text-white font-medium whitespace-nowrap">合計予算</th>
                    <th className="text-right px-3 py-2.5 text-slate-500 font-medium whitespace-nowrap hidden sm:table-cell">前月実績</th>
                    <th className="text-right px-3 py-2.5 text-slate-400 font-medium whitespace-nowrap">当月実績</th>
                    <th className="text-right px-3 py-2.5 text-emerald-300/80 font-medium whitespace-nowrap">残り</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {/* 支出カテゴリ */}
                  {expenseCats.map((cat) => {
                    const edit = editMap[cat] ?? { allocation: 0, carryover: 0, enabled: false };
                    const totalB = (edit.allocation ?? 0) + (edit.carryover ?? 0);
                    const actual = actualMap.get(cat) ?? 0;
                    const remaining = totalB - actual;
                    const prevActual = prevActuals[cat] ?? 0;

                    return (
                      <tr key={cat} className="hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-medium text-slate-200">{cat}</td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium text-sm ${
                          (edit.carryover ?? 0) >= 0 ? "text-blue-400" : "text-red-400"
                        }`}>
                          {(edit.carryover ?? 0) !== 0 ? formatCurrencySigned(edit.carryover) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={edit.allocation}
                            onChange={(e) => update(cat, "allocation", Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            style={{ fontSize: "16px" }}
                            className="w-24 bg-slate-800 text-white text-right px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none tabular-nums"
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-white font-medium tabular-nums whitespace-nowrap">
                          {formatCurrency(totalB)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500 text-xs tabular-nums whitespace-nowrap hidden sm:table-cell">
                          {prevActual > 0 ? formatCurrency(prevActual) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-300 tabular-nums whitespace-nowrap">
                          {actual > 0 ? formatCurrency(actual) : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap ${
                          remaining < 0 ? "text-red-400" : totalB !== 0 ? "text-green-400" : "text-slate-600"
                        }`}>
                          {totalB !== 0 || actual > 0 ? formatCurrencySigned(remaining) : "—"}
                        </td>
                      </tr>
                    );
                  })}

                  {/* 貯蓄カテゴリ（区切り） */}
                  {savingsCats.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={7} className="px-3 py-1.5 bg-slate-800/40">
                          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">貯蓄・積立</span>
                        </td>
                      </tr>
                      {savingsCats.map((cat) => {
                        const edit = editMap[cat] ?? { allocation: 0, carryover: 0, enabled: false };
                        const totalB = (edit.allocation ?? 0) + (edit.carryover ?? 0);
                        const actual = actualMap.get(cat) ?? 0;
                        const remaining = totalB - actual;
                        const prevActual = prevActuals[cat] ?? 0;

                        return (
                          <tr key={cat} className="hover:bg-slate-800/30 bg-purple-950/5">
                            <td className="px-3 py-2 font-medium text-slate-200">{cat}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-medium text-sm ${
                              (edit.carryover ?? 0) >= 0 ? "text-blue-400" : "text-red-400"
                            }`}>
                              {(edit.carryover ?? 0) !== 0 ? formatCurrencySigned(edit.carryover) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                value={edit.allocation}
                                onChange={(e) => update(cat, "allocation", Number(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                style={{ fontSize: "16px" }}
                                className="w-24 bg-slate-800 text-white text-right px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none tabular-nums"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-white font-medium tabular-nums whitespace-nowrap">
                              {formatCurrency(totalB)}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500 text-xs tabular-nums whitespace-nowrap hidden sm:table-cell">
                              {prevActual > 0 ? formatCurrency(prevActual) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-300 tabular-nums whitespace-nowrap">
                              {actual > 0 ? formatCurrency(actual) : "—"}
                            </td>
                            <td className={`px-3 py-2 text-right font-medium tabular-nums whitespace-nowrap ${
                              remaining < 0 ? "text-red-400" : totalB !== 0 ? "text-purple-400" : "text-slate-600"
                            }`}>
                              {totalB !== 0 || actual > 0 ? formatCurrencySigned(remaining) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </>
                  )}

                  {/* 合計行 */}
                  <tr className="border-t-2 border-slate-600 font-semibold bg-slate-800/30">
                    <td className="px-3 pt-3 pb-2 text-slate-300">合計</td>
                    <td className={`px-3 pt-3 pb-2 text-right tabular-nums ${totalCarryover >= 0 ? "text-blue-400" : "text-red-400"}`}>
                      {formatCurrencySigned(totalCarryover)}
                    </td>
                    <td className="px-3 pt-3 pb-2 text-right text-blue-400 tabular-nums">
                      {formatCurrency(totalAllocation)}
                    </td>
                    <td className="px-3 pt-3 pb-2 text-right text-white tabular-nums">
                      {formatCurrency(totalBudget)}
                    </td>
                    <td className="px-3 pt-3 pb-2 text-right text-slate-500 text-xs tabular-nums hidden sm:table-cell">
                      {Object.values(prevActuals).reduce((s, v) => s + v, 0) > 0
                        ? formatCurrency(Object.values(prevActuals).reduce((s, v) => s + v, 0))
                        : "—"}
                    </td>
                    <td className="px-3 pt-3 pb-2 text-right text-slate-300 tabular-nums">
                      {formatCurrency(expenseTotal.actual + savingsTotal.actual)}
                    </td>
                    <td className={`px-3 pt-3 pb-2 text-right tabular-nums ${
                      totalBudget - (expenseTotal.actual + savingsTotal.actual) < 0 ? "text-red-400" : "text-green-400"
                    }`}>
                      {totalBudget !== 0 ? formatCurrencySigned(totalBudget - (expenseTotal.actual + savingsTotal.actual)) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
