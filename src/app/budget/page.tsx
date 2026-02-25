"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatCurrencySigned } from "@/lib/utils";

type BudgetItem = {
  categoryName: string;
  allocation: number;
  carryover: number;
  totalBudget: number;
  actual: number;
  remaining: number;
  notes: string | null;
  hasBudget: boolean;
};

export default function BudgetPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editMap, setEditMap] = useState<Record<string, { allocation: number; carryover: number }>>({});

  const fetchBudgets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budgets?year=${year}&month=${month}`);
      const json = await res.json();
      setItems(json.data ?? []);
      // edit map を初期化
      const map: Record<string, { allocation: number; carryover: number }> = {};
      (json.data ?? []).forEach((item: BudgetItem) => {
        map[item.categoryName] = { allocation: item.allocation, carryover: item.carryover };
      });
      setEditMap(map);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetchBudgets(); }, [fetchBudgets]);

  function setAllocation(cat: string, val: number) {
    setEditMap((prev) => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? { carryover: 0 }), allocation: val },
    }));
  }

  function setCarryover(cat: string, val: number) {
    setEditMap((prev) => ({
      ...prev,
      [cat]: { ...(prev[cat] ?? { allocation: 0 }), carryover: val },
    }));
  }

  async function saveBudgets() {
    setSaving(true);
    setSaved(false);
    try {
      const budgetItems = items.map((item) => {
        const edit = editMap[item.categoryName] ?? { allocation: 0, carryover: 0 };
        return {
          categoryName: item.categoryName,
          allocation: edit.allocation,
          carryover: edit.carryover,
        };
      });
      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, items: budgetItems }),
      });
      setSaved(true);
      await fetchBudgets();
    } finally {
      setSaving(false);
    }
  }

  // 自動繰越: 前月の実績と予算から差額を計算してセット
  async function autoCarryover() {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const res = await fetch(`/api/budgets?year=${prevYear}&month=${prevMonth}`);
    const json = await res.json();
    const prevItems: BudgetItem[] = json.data ?? [];
    const newEditMap = { ...editMap };
    prevItems.forEach((prev) => {
      if (prev.hasBudget) {
        const carryover = prev.remaining; // 前月の残り（±）
        newEditMap[prev.categoryName] = {
          allocation: editMap[prev.categoryName]?.allocation ?? 0,
          carryover,
        };
      }
    });
    setEditMap(newEditMap);
  }

  const totalAllocation = items.reduce((sum, item) => {
    return sum + (editMap[item.categoryName]?.allocation ?? 0);
  }, 0);
  const totalCarryover = items.reduce((sum, item) => {
    return sum + (editMap[item.categoryName]?.carryover ?? 0);
  }, 0);
  const totalActual = items.reduce((sum, item) => sum + item.actual, 0);

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">予算管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">前月繰越 + 今月割り当て = 月次予算</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700"
          >
            {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
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

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <Card>
          <CardTitle>今月の割り当て合計</CardTitle>
          <p className="text-xl font-bold text-blue-400">{formatCurrency(totalAllocation)}</p>
        </Card>
        <Card>
          <CardTitle>繰越合計</CardTitle>
          <p className={`text-xl font-bold ${totalCarryover >= 0 ? "text-green-400" : "text-red-400"}`}>
            {formatCurrencySigned(totalCarryover)}
          </p>
        </Card>
        <Card>
          <CardTitle>当月実績合計</CardTitle>
          <p className="text-xl font-bold text-white">{formatCurrency(totalActual)}</p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardTitle>カテゴリ別予算設定</CardTitle>
          <div className="flex gap-2">
            <button
              onClick={autoCarryover}
              className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
            >
              {prevYear}年{prevMonth}月の残りを自動繰越
            </button>
            <button
              onClick={saveBudgets}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-medium"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>
        {saved && <p className="text-green-400 text-xs mb-3">✓ 保存しました</p>}

        {loading ? (
          <p className="text-slate-500 text-sm">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-slate-500 text-sm">
            この月のデータがありません。先に CSV をインポートしてください。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>カテゴリ</th>
                  <th className="text-right">今月割り当て</th>
                  <th className="text-right">前月繰越</th>
                  <th className="text-right">合計予算</th>
                  <th className="text-right">実績</th>
                  <th className="text-right">残り</th>
                  <th className="w-32">進捗</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const edit = editMap[item.categoryName] ?? { allocation: 0, carryover: 0 };
                  const totalBudget = edit.allocation + edit.carryover;
                  const remaining = totalBudget - item.actual;
                  const pct = totalBudget > 0 ? Math.min((item.actual / totalBudget) * 100, 100) : 0;
                  const over = totalBudget > 0 && item.actual > totalBudget;

                  return (
                    <tr key={item.categoryName}>
                      <td className="text-slate-300 font-medium">{item.categoryName}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          value={edit.allocation}
                          onChange={(e) => setAllocation(item.categoryName, Number(e.target.value))}
                          className="w-28 bg-slate-800 text-white text-right text-sm px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          value={edit.carryover}
                          onChange={(e) => setCarryover(item.categoryName, Number(e.target.value))}
                          className={`w-28 bg-slate-800 text-right text-sm px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none ${edit.carryover >= 0 ? "text-green-400" : "text-red-400"}`}
                        />
                      </td>
                      <td className="text-right text-white">{formatCurrency(totalBudget)}</td>
                      <td className="text-right text-slate-300">{formatCurrency(item.actual)}</td>
                      <td className={`text-right font-medium ${remaining < 0 ? "text-red-400" : "text-green-400"}`}>
                        {formatCurrencySigned(remaining)}
                      </td>
                      <td>
                        {totalBudget > 0 && (
                          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${over ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-blue-500"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
