"use client";
import { useState, useEffect, useCallback } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import type { Transaction } from "@/lib/schema";

export default function TransactionsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const LIMIT = 50;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        page: String(page),
        limit: String(LIMIT),
      });
      if (type) params.set("type", type);
      if (category) params.set("category", category);
      const res = await fetch(`/api/transactions?${params}`);
      const json = await res.json();
      setData(json.data ?? []);
      setTotal(json.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [year, month, type, category, page]);

  useEffect(() => { setPage(1); }, [year, month, type, category]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-5">取引明細</h1>

      {/* フィルター */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
          {Array.from({ length: 8 }, (_, i) => 2019 + i).map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
          className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700">
          <option value="">すべての種別</option>
          <option value="支出">支出</option>
          <option value="収入">収入</option>
          <option value="振替">振替</option>
        </select>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="カテゴリで絞り込み"
          className="bg-slate-800 text-white text-sm rounded-lg px-3 py-2 border border-slate-700 focus:border-blue-500 outline-none"
        />
        <span className="text-slate-500 text-sm self-center">{total.toLocaleString()}件</span>
      </div>

      <Card>
        {loading ? (
          <p className="text-slate-500 text-sm">読み込み中...</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日付</th>
                    <th>種別</th>
                    <th>カテゴリ</th>
                    <th>項目名</th>
                    <th className="text-right">金額</th>
                    <th>支払手段</th>
                    <th>メモ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((tx) => (
                    <tr key={tx.id}>
                      <td className="text-slate-500 text-xs whitespace-nowrap">{tx.date}</td>
                      <td>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          tx.type === "収入" ? "bg-green-900/50 text-green-400" :
                          tx.type === "振替" ? "bg-slate-700 text-slate-400" :
                          "bg-red-900/50 text-red-400"
                        }`}>{tx.type}</span>
                      </td>
                      <td className="text-slate-400 text-sm">{tx.category}</td>
                      <td className="text-slate-300 text-sm">{tx.itemName}</td>
                      <td className={`text-right font-medium text-sm ${
                        tx.type === "収入" ? "text-green-400" :
                        tx.type === "振替" ? "text-slate-400" :
                        "text-slate-200"
                      }`}>
                        {tx.type === "収入"
                          ? `+${formatCurrency(tx.incomeAmount)}`
                          : formatCurrency(tx.expenseAmount)}
                      </td>
                      <td className="text-slate-500 text-xs">{tx.assetName}</td>
                      <td className="text-slate-500 text-xs max-w-32 truncate">{tx.memo}</td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-slate-500 py-8">データがありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* ページネーション */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg"
                >
                  前へ
                </button>
                <span className="text-slate-500 text-sm">{page} / {totalPages}</span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white rounded-lg"
                >
                  次へ
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
