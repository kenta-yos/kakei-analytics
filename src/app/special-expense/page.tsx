"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";

type PlannedItem = {
  id?: number;
  itemName: string;
  plannedAmount: number;
  memo: string;
};

type ActualItem = {
  label: string;
  total: number;
  count: number;
};

type MonthSummary = {
  month: number;
  plannedTotal: number;
  actualTotal: number;
};

type ApiData = {
  planned: { id: number; itemName: string; plannedAmount: number; memo: string | null }[];
  actuals: ActualItem[];
  yearSummary: MonthSummary[];
};

export default function SpecialExpensePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [planned, setPlanned] = useState<PlannedItem[]>([]);
  const [actuals, setActuals] = useState<ActualItem[]>([]);
  const [yearSummary, setYearSummary] = useState<MonthSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/special-expense?year=${year}&month=${month}`);
      const json = await res.json();
      const data: ApiData = json.data ?? { planned: [], actuals: [], yearSummary: [] };

      setPlanned(
        data.planned.length > 0
          ? data.planned.map((p) => ({ id: p.id, itemName: p.itemName, plannedAmount: p.plannedAmount, memo: p.memo ?? "" }))
          : []
      );
      setActuals(data.actuals);
      setYearSummary(data.yearSummary);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  function addRow() {
    setPlanned((prev) => [...prev, { itemName: "", plannedAmount: 0, memo: "" }]);
  }

  function updateRow(idx: number, key: keyof PlannedItem, value: string | number) {
    setPlanned((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  }

  function removeRow(idx: number) {
    setPlanned((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setSaving(true);
    try {
      await fetch("/api/special-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          month,
          items: planned.filter((p) => p.itemName.trim() !== "").map((p) => ({
            itemName: p.itemName,
            plannedAmount: p.plannedAmount,
            memo: p.memo || undefined,
          })),
        }),
      });
      setSaved(true);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  const plannedTotal = planned.reduce((s, p) => s + (p.plannedAmount || 0), 0);
  const actualTotal = actuals.reduce((s, a) => s + a.total, 0);
  const diff = actualTotal - plannedTotal;

  const yearPlannedGrand = yearSummary.reduce((s, m) => s + m.plannedTotal, 0);
  const yearActualGrand = yearSummary.reduce((s, m) => s + m.actualTotal, 0);

  return (
    <div className="p-4 sm:p-6">
      {/* ヘッダー */}
      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">特別経費B管理</h1>
          <p className="text-slate-400 text-sm mt-0.5">月別の予測と実績を管理します</p>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700"
        >
          {Array.from({ length: 9 }, (_, i) => 2019 + i).map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
      </div>

      {/* 月タブ */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const s = yearSummary[m - 1];
          const hasPlanned = s?.plannedTotal > 0;
          const hasActual = s?.actualTotal > 0;
          const isCurrentMonth = m === now.getMonth() + 1 && year === now.getFullYear();
          return (
            <button
              key={m}
              onClick={() => setMonth(m)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition relative ${
                month === m
                  ? "border-blue-500 bg-blue-600/20 text-blue-300"
                  : "border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-600"
              }`}
            >
              {m}月
              {isCurrentMonth && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
              )}
              {(hasPlanned || hasActual) && !isCurrentMonth && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full opacity-60" />
              )}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-slate-500 text-sm py-8 text-center">読み込み中...</p>
      ) : (
        <>
          {/* 予測セクション */}
          <Card className="mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <CardTitle>{year}年{month}月 予測</CardTitle>
              <div className="flex gap-2 items-center">
                {saved && <span className="text-green-400 text-xs">保存しました</span>}
                <button
                  onClick={addRow}
                  className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg transition"
                >
                  + 行追加
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>

            {planned.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">
                「+ 行追加」から予測を入力してください
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">項目名</th>
                      <th className="text-right">金額</th>
                      <th className="text-left hidden sm:table-cell">メモ</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {planned.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <input
                            type="text"
                            value={row.itemName}
                            onChange={(e) => updateRow(idx, "itemName", e.target.value)}
                            placeholder="例: 家電購入"
                            style={{ fontSize: '16px' }}
                            className="w-full bg-slate-800 text-white px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={row.plannedAmount}
                            onChange={(e) => updateRow(idx, "plannedAmount", Number(e.target.value))}
                            onFocus={(e) => e.target.select()}
                            style={{ fontSize: '16px' }}
                            className="w-24 bg-slate-800 text-white text-right px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                          />
                        </td>
                        <td className="hidden sm:table-cell">
                          <input
                            type="text"
                            value={row.memo}
                            onChange={(e) => updateRow(idx, "memo", e.target.value)}
                            placeholder="メモ"
                            className="w-full bg-transparent text-slate-400 text-sm px-2 py-1 rounded border border-transparent focus:border-slate-600 outline-none"
                          />
                        </td>
                        <td>
                          <button
                            onClick={() => removeRow(idx)}
                            className="text-slate-500 hover:text-red-400 transition p-1"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-600 font-semibold">
                      <td className="text-slate-300 pt-3">小計</td>
                      <td className="text-right pt-3 text-white">{formatCurrency(plannedTotal)}</td>
                      <td className="hidden sm:table-cell" />
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 実績セクション */}
          <Card className="mb-4">
            <CardTitle>{year}年{month}月 実績（CSV取込済・編集不可）</CardTitle>
            {actuals.length === 0 ? (
              <p className="text-slate-500 text-sm py-4 text-center">
                この月の特別経費B取引はありません
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="text-left">項目名</th>
                      <th className="text-right">合計</th>
                      <th className="text-right">件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actuals.map((a, idx) => (
                      <tr key={idx}>
                        <td className="text-slate-300">{a.label}</td>
                        <td className="text-right text-red-400">{formatCurrency(a.total)}</td>
                        <td className="text-right text-slate-500 text-sm">{a.count}件</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-slate-600 font-semibold">
                      <td className="text-slate-300 pt-3">小計</td>
                      <td className="text-right pt-3 text-red-400">{formatCurrency(actualTotal)}</td>
                      <td className="text-right pt-3 text-slate-500 text-sm">
                        {actuals.reduce((s, a) => s + a.count, 0)}件
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* 差異 */}
          {(plannedTotal > 0 || actualTotal > 0) && (
            <Card className="mb-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-slate-400 text-xs mb-1">予測</p>
                  <p className="text-xl font-bold text-blue-400">{formatCurrency(plannedTotal)}</p>
                </div>
                <div className="text-slate-600 text-xl">→</div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">実績</p>
                  <p className="text-xl font-bold text-red-400">{formatCurrency(actualTotal)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">差異（実績 - 予測）</p>
                  <p className={`text-xl font-bold ${diff > 0 ? "text-red-400" : diff < 0 ? "text-green-400" : "text-slate-400"}`}>
                    {diff >= 0 ? "+" : ""}{formatCurrency(diff)}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* 年間サマリー */}
          <Card>
            <CardTitle>{year}年 年間サマリー</CardTitle>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="text-left">月</th>
                    <th className="text-right">予測合計</th>
                    <th className="text-right">実績合計</th>
                    <th className="text-right">差異</th>
                  </tr>
                </thead>
                <tbody>
                  {yearSummary.map((s) => {
                    const d = s.actualTotal - s.plannedTotal;
                    return (
                      <tr
                        key={s.month}
                        className={s.month === month ? "bg-blue-900/20" : ""}
                        onClick={() => setMonth(s.month)}
                        style={{ cursor: "pointer" }}
                      >
                        <td className={s.month === month ? "text-blue-300 font-semibold" : "text-slate-400"}>
                          {s.month}月
                        </td>
                        <td className="text-right text-slate-300">
                          {s.plannedTotal > 0 ? formatCurrency(s.plannedTotal) : "—"}
                        </td>
                        <td className="text-right text-red-400">
                          {s.actualTotal > 0 ? formatCurrency(s.actualTotal) : "—"}
                        </td>
                        <td className={`text-right font-medium ${
                          d > 0 ? "text-red-400" : d < 0 ? "text-green-400" : "text-slate-600"
                        }`}>
                          {s.plannedTotal > 0 || s.actualTotal > 0
                            ? `${d >= 0 ? "+" : ""}${formatCurrency(d)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}

                  {/* 合計行 */}
                  <tr className="border-t-2 border-slate-600 font-semibold">
                    <td className="text-slate-300 pt-3">合計</td>
                    <td className="text-right pt-3 text-slate-300">{formatCurrency(yearPlannedGrand)}</td>
                    <td className="text-right pt-3 text-red-400">{formatCurrency(yearActualGrand)}</td>
                    <td className={`text-right pt-3 font-medium ${
                      yearActualGrand - yearPlannedGrand > 0 ? "text-red-400" : "text-green-400"
                    }`}>
                      {yearPlannedGrand > 0 || yearActualGrand > 0
                        ? `${yearActualGrand - yearPlannedGrand >= 0 ? "+" : ""}${formatCurrency(yearActualGrand - yearPlannedGrand)}`
                        : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
