"use client";
import { useState, useRef } from "react";
import { Card, CardTitle } from "@/components/ui/Card";

type ImportResult = {
  success: boolean;
  transactions?: { inserted: number; skipped: number };
  assets?: { inserted: number };
  error?: string;
};

export default function ImportPage() {
  const combinedRef = useRef<HTMLInputElement>(null);
  const assetRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [combinedFile, setCombinedFile] = useState<File | null>(null);
  const [assetFile, setAssetFile] = useState<File | null>(null);

  async function handleImport() {
    if (!combinedFile && !assetFile) {
      alert("少なくとも1つのファイルを選択してください");
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    if (combinedFile) formData.append("combined", combinedFile);
    if (assetFile) formData.append("asset", assetFile);

    try {
      const res = await fetch("/api/import", { method: "POST", body: formData });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "通信エラーが発生しました" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">CSV インポート</h1>
      <p className="text-slate-400 text-sm mb-6">
        マネーフォワード等のアプリから出力した CSV をアップロードしてください。<br />
        2019年以降のデータが取り込まれます。重複データは自動スキップされます。
      </p>

      <div className="space-y-4 mb-6">
        {/* 収支合算レポート */}
        <Card>
          <CardTitle>収支合算レポート.csv（必須）</CardTitle>
          <p className="text-xs text-slate-500 mb-3">
            全取引が含まれる主データファイルです。まずこちらをインポートしてください。
          </p>
          <input
            ref={combinedRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setCombinedFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => combinedRef.current?.click()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition"
          >
            ファイルを選択
          </button>
          {combinedFile && (
            <span className="ml-3 text-sm text-green-400">✓ {combinedFile.name}</span>
          )}
        </Card>

        {/* 資産別レポート */}
        <Card>
          <CardTitle>資産別レポート.csv（任意）</CardTitle>
          <p className="text-xs text-slate-500 mb-3">
            口座・カードの残高推移データです。貸借対照表に使用されます。
          </p>
          <input
            ref={assetRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setAssetFile(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => assetRef.current?.click()}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition"
          >
            ファイルを選択
          </button>
          {assetFile && (
            <span className="ml-3 text-sm text-green-400">✓ {assetFile.name}</span>
          )}
        </Card>
      </div>

      <button
        onClick={handleImport}
        disabled={loading || (!combinedFile && !assetFile)}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition text-sm"
      >
        {loading ? "インポート中..." : "インポート実行"}
      </button>

      {result && (
        <Card className="mt-6">
          {result.success ? (
            <div className="text-green-400">
              <p className="font-semibold mb-2">✓ インポート完了</p>
              {result.transactions && (
                <p className="text-sm">取引: {result.transactions.inserted.toLocaleString()} 件取り込み</p>
              )}
              {result.assets && (
                <p className="text-sm">資産スナップショット: {result.assets.inserted.toLocaleString()} 件取り込み</p>
              )}
            </div>
          ) : (
            <div className="text-red-400">
              <p className="font-semibold mb-1">エラー</p>
              <p className="text-sm">{result.error}</p>
            </div>
          )}
        </Card>
      )}

      <Card className="mt-6">
        <CardTitle>インポート手順</CardTitle>
        <ol className="text-sm text-slate-400 space-y-1.5 list-decimal list-inside">
          <li>スマホアプリでレポートフォルダを出力する（月次 or 全期間）</li>
          <li>PC に転送して、このページで「収支合算レポート.csv」を選択</li>
          <li>資産残高も更新したい場合は「資産別レポート.csv」も選択</li>
          <li>「インポート実行」ボタンを押す</li>
          <li>完了後、ダッシュボードで最新データが反映されます</li>
        </ol>
      </Card>
    </div>
  );
}
