"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";

// 2026年のカテゴリ順（budget/page.tsx と同じ）
const CATEGORY_ORDER = [
  "食費", "研究", "カフェ", "娯楽費", "交際費・贅沢費", "交通費", "美容費",
  "生活消耗品費", "医療費", "家賃・光熱費", "通信費", "特別経費S", "特別経費B",
  "ファッション", "旅行・帰省", "貯蓄", "貯蓄（投信）", "会社立替",
];

// 貯蓄・投資は固定比率
const FIXED_RATIO: Record<string, number> = {
  "貯蓄": 3,
  "貯蓄（投信）": 7,
};

type PastYearItem = {
  category: string;
  monthlyAvg: number;
  total: number;
  ratio: number;
};

type StandardBudgetItem = {
  id?: number;
  categoryName: string;
  allocation: number;
  notes: string | null;
};

function sortByOrder(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "ja");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function StandardBudgetPage() {
  const [referenceIncome, setReferenceIncome] = useState(0);
  const [incomeInput, setIncomeInput] = useState("");
  const [pastYear, setPastYear] = useState<PastYearItem[]>([]);
  const [editMap, setEditMap] = useState<Record<string, { allocation: number; notes: string }>>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sbRes, pastRes] = await Promise.all([
        fetch("/api/standard-budget"),
        fetch("/api/analytics?type=past_year_summary"),
      ]);
      const [sbJson, pastJson] = await Promise.all([sbRes.json(), pastRes.json()]);

      const income: number = sbJson.data?.referenceIncome ?? 0;
      setReferenceIncome(income);
      setIncomeInput(income > 0 ? String(income) : "");

      const pastData: PastYearItem[] = pastJson.data ?? [];
      setPastYear(pastData);

      const savedItems: StandardBudgetItem[] = sbJson.data?.items ?? [];
      const savedMap = new Map(savedItems.map((i) => [i.categoryName, i]));

      // カテゴリ一覧を統合（過去実績 + 保存済み + 固定）
      const allCats = sortByOrder(Array.from(new Set([
        ...pastData.map((p) => p.category),
        ...savedItems.map((i) => i.categoryName),
        ...Object.keys(FIXED_RATIO),
      ])));
      setCategories(allCats);

      // editMap 初期化
      const newEditMap: Record<string, { allocation: number; notes: string }> = {};
      for (const cat of allCats) {
        const saved = savedMap.get(cat);
        newEditMap[cat] = {
          allocation: saved?.allocation ?? 0,
          notes: saved?.notes ?? "",
        };
      }
      setEditMap(newEditMap);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function applyReferenceIncome() {
    const income = parseInt(incomeInput.replace(/,/g, ""), 10);
    if (!income || income <= 0) return;
    setReferenceIncome(income);

    // 参考値を allocation に適用
    const totalPastExpense = pastYear.reduce((s, p) => s + p.monthlyAvg, 0);
    setEditMap((prev) => {
      const next = { ...prev };
      for (const cat of categories) {
        const fixedRatio = FIXED_RATIO[cat];
        if (fixedRatio !== undefined) {
          next[cat] = { ...next[cat], allocation: Math.round(income * fixedRatio / 100) };
        } else {
          const p = pastYear.find((p) => p.category === cat);
          if (p && totalPastExpense > 0) {
            const ratio = p.monthlyAvg / totalPastExpense;
            next[cat] = { ...next[cat], allocation: Math.round(income * ratio) };
          }
        }
      }
      return next;
    });
  }

  function getRefValue(cat: string): number {
    const fixedRatio = FIXED_RATIO[cat];
    if (fixedRatio !== undefined && referenceIncome > 0) {
      return Math.round(referenceIncome * fixedRatio / 100);
    }
    const p = pastYear.find((p) => p.category === cat);
    if (!p) return 0;
    if (referenceIncome <= 0) return p.monthlyAvg;
    const totalPastExpense = pastYear.reduce((s, pp) => s + pp.monthlyAvg, 0);
    if (totalPastExpense <= 0) return p.monthlyAvg;
    return Math.round(referenceIncome * (p.monthlyAvg / totalPastExpense));
  }

  function getRatio(cat: string): string {
    const fixedRatio = FIXED_RATIO[cat];
    if (fixedRatio !== undefined) return `${fixedRatio}% (固定)`;
    const p = pastYear.find((p) => p.category === cat);
    return p ? `${p.ratio}%` : "—";
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const items = categories.map((cat) => ({
        categoryName: cat,
        allocation: editMap[cat]?.allocation ?? 0,
        notes: editMap[cat]?.notes || undefined,
      }));
      await fetch("/api/standard-budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceIncome: parseInt(incomeInput.replace(/,/g, ""), 10) || 0, items }),
      });
      setSaved(true);
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  const totalAllocation = categories.reduce((s, cat) => s + (editMap[cat]?.allocation ?? 0), 0);
  const unallocated = (parseInt(incomeInput.replace(/,/g, ""), 10) || referenceIncome) - totalAllocation;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-white">標準予算設定</h1>
        <p className="text-slate-400 text-sm mt-0.5">毎月の標準的な予算配分を設定します（新しい月の予算管理に自動適用）</p>
      </div>

      {/* 基準収入 */}
      <Card className="mb-5 border-blue-800/40 bg-blue-950/10">
        <CardTitle>基準収入（月収想定）</CardTitle>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">¥</span>
            <input
              type="number"
              value={incomeInput}
              onChange={(e) => setIncomeInput(e.target.value)}
              placeholder="例: 300000"
              style={{ fontSize: '16px' }}
              className="w-40 bg-slate-800 text-white px-3 py-2 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
            />
          </div>
          <button
            onClick={applyReferenceIncome}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-semibold"
          >
            過去12ヶ月の比率で参考値を計算
          </button>
          {referenceIncome > 0 && (
            <span className="text-slate-400 text-sm">現在の基準: {formatCurrency(referenceIncome)}</span>
          )}
        </div>
        {totalAllocation > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>配分済み: {formatCurrency(totalAllocation)}</span>
              <span className={unallocated < 0 ? "text-red-400" : unallocated === 0 ? "text-green-400" : "text-yellow-300"}>
                未配分: {unallocated >= 0 ? "+" : ""}{formatCurrency(unallocated)}
              </span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${unallocated < 0 ? "bg-red-500" : unallocated === 0 ? "bg-green-500" : "bg-blue-500"}`}
                style={{
                  width: `${(parseInt(incomeInput.replace(/,/g, ""), 10) || referenceIncome) > 0
                    ? Math.min(totalAllocation / ((parseInt(incomeInput.replace(/,/g, ""), 10) || referenceIncome)) * 100, 100)
                    : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </Card>

      {/* カテゴリ別設定 */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <CardTitle>カテゴリ別標準予算</CardTitle>
          <div className="flex gap-2">
            {saved && <span className="text-green-400 text-xs self-center">保存しました</span>}
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg transition font-semibold"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-500 text-sm py-8 text-center">読み込み中...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-left">カテゴリ</th>
                  <th className="text-right">過去12ヶ月平均</th>
                  <th className="text-right">割合</th>
                  <th className="text-right">参考値</th>
                  <th className="text-right">設定予算</th>
                  <th className="text-left hidden sm:table-cell">メモ</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const p = pastYear.find((p) => p.category === cat);
                  const refVal = getRefValue(cat);
                  const allocated = editMap[cat]?.allocation ?? 0;
                  const isFixed = FIXED_RATIO[cat] !== undefined;
                  return (
                    <tr key={cat}>
                      <td className="font-medium text-slate-200">
                        {cat}
                        {isFixed && <span className="ml-1.5 text-xs text-blue-400">固定</span>}
                      </td>
                      <td className="text-right text-slate-400 text-sm">
                        {isFixed ? "—" : p ? formatCurrency(p.monthlyAvg) : "—"}
                      </td>
                      <td className="text-right text-slate-400 text-sm">{getRatio(cat)}</td>
                      <td className="text-right text-blue-300 text-sm">
                        {refVal > 0 ? formatCurrency(refVal) : "—"}
                      </td>
                      <td className="text-right">
                        <input
                          type="number"
                          value={editMap[cat]?.allocation ?? 0}
                          onChange={(e) =>
                            setEditMap((prev) => ({
                              ...prev,
                              [cat]: { ...prev[cat], allocation: Number(e.target.value) },
                            }))
                          }
                          onFocus={(e) => e.target.select()}
                          style={{ fontSize: '16px' }}
                          className="w-24 bg-slate-800 text-white text-right px-2 py-1 rounded border border-slate-700 focus:border-blue-500 outline-none"
                        />
                        {refVal > 0 && allocated !== refVal && (
                          <button
                            onClick={() =>
                              setEditMap((prev) => ({
                                ...prev,
                                [cat]: { ...prev[cat], allocation: refVal },
                              }))
                            }
                            className="ml-1 text-xs text-blue-400 hover:text-blue-300"
                            title="参考値を適用"
                          >
                            ↑
                          </button>
                        )}
                      </td>
                      <td className="hidden sm:table-cell">
                        <input
                          type="text"
                          value={editMap[cat]?.notes ?? ""}
                          onChange={(e) =>
                            setEditMap((prev) => ({
                              ...prev,
                              [cat]: { ...prev[cat], notes: e.target.value },
                            }))
                          }
                          placeholder="メモ"
                          className="w-full bg-transparent text-slate-400 text-sm px-2 py-1 rounded border border-transparent focus:border-slate-600 outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}

                {/* 合計行 */}
                <tr className="border-t-2 border-slate-600 font-semibold">
                  <td className="text-slate-300 pt-3">合計</td>
                  <td className="text-right pt-3 text-slate-400 text-sm">
                    {formatCurrency(pastYear.reduce((s, p) => s + p.monthlyAvg, 0))}
                  </td>
                  <td className="text-right pt-3 text-slate-500 text-sm">—</td>
                  <td className="text-right pt-3 text-blue-300 text-sm">
                    {formatCurrency(categories.reduce((s, cat) => s + getRefValue(cat), 0))}
                  </td>
                  <td className="text-right pt-3 text-white">
                    {formatCurrency(totalAllocation)}
                  </td>
                  <td className="hidden sm:table-cell" />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <CardTitle>使い方</CardTitle>
        <ul className="text-xs text-slate-400 space-y-1">
          <li>・基準収入を入力して「過去12ヶ月の比率で参考値を計算」を押すと、各カテゴリに参考値が自動計算されます</li>
          <li>・「↑」ボタンで設定予算に参考値を一括適用できます</li>
          <li>・<span className="text-blue-400">固定</span>ラベルのカテゴリ（貯蓄3%・貯蓄（投信）7%）は基準収入に対する固定比率で計算されます</li>
          <li>・保存後、予算管理ページで未設定の月を開くと、この標準予算が自動的に適用されます</li>
        </ul>
      </Card>
    </div>
  );
}
