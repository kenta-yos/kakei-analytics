"use client";
import Link from "next/link";
import { useState } from "react";
import { Card, Page, PageTitle } from "@/components/ui/kit";
import { ChevronLeft, UploadIcon } from "@/components/ui/icons";

type ImportResult = {
  success: boolean;
  transactions?: { inserted: number; skipped: number };
  assets?: { inserted: number };
  error?: string;
};

export default function ImportPage() {
  const [combined, setCombined] = useState<File | null>(null);
  const [asset, setAsset] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function run() {
    if (!combined && !asset) return;
    setLoading(true);
    setResult(null);
    const form = new FormData();
    if (combined) form.append("combined", combined);
    if (asset) form.append("asset", asset);
    try {
      const res = await fetch("/api/import", { method: "POST", body: form });
      setResult(await res.json());
    } catch {
      setResult({ success: false, error: "通信エラーが発生しました" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page>
      <Link href="/" className="flex min-h-11 items-center gap-1 text-sm text-accent">
        <ChevronLeft size={18} />
        ホーム
      </Link>
      <PageTitle kicker="データ" title="CSVを取り込む" />
      <p className="lbl leading-relaxed">月の途中でも取り込めます。同じ期間を取り込み直しても重複しません（上書き）。</p>

      <FilePick label="収支合算レポート.csv" note="すべての取引。まずこちらを選んでください" file={combined} onPick={setCombined} />
      <FilePick label="資産別レポート.csv" note="口座ごとの残高（貸借対照表に使います）" file={asset} onPick={setAsset} />

      <button type="button" className="btn-primary" onClick={run} disabled={loading || (!combined && !asset)}>
        <UploadIcon size={18} />
        {loading ? "取り込んでいます…" : "取り込む"}
      </button>

      {result && (
        <Card className={result.success ? "border-accent" : "border-over-fill"}>
          {result.success ? (
            <div className="flex flex-col gap-1 text-sm">
              <b>取り込みが完了しました</b>
              {result.transactions && (
                <span>
                  取引 {result.transactions.inserted}件を登録{result.transactions.skipped ? `（${result.transactions.skipped}件はスキップ）` : ""}
                </span>
              )}
              {result.assets && <span>資産の残高 {result.assets.inserted}件を更新</span>}
              <Link href="/" className="btn-ghost mt-2">
                ホームで確認する
              </Link>
            </div>
          ) : (
            <span className="text-sm text-over">{result.error ?? "取り込みに失敗しました"}</span>
          )}
        </Card>
      )}
    </Page>
  );
}

function FilePick({ label, note, file, onPick }: { label: string; note: string; file: File | null; onPick: (f: File | null) => void }) {
  return (
    <label className="card flex cursor-pointer items-center justify-between gap-3 p-4">
      <span className="min-w-0">
        <span className="block text-sm font-bold">{label}</span>
        <span className="lbl block truncate">{file ? file.name : note}</span>
      </span>
      <span className="btn-small shrink-0">{file ? "選び直す" : "選ぶ"}</span>
      <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </label>
  );
}
