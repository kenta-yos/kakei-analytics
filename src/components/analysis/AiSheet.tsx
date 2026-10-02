"use client";
import { useEffect, useState } from "react";
import { ClipboardIcon, CloseIcon, ShareIcon } from "@/components/ui/icons";

const OPTIONS = [
  { key: "prompt", name: "分析の依頼文", sub: "知りたいこと・前提（予算の仕組み、特別経費B）" },
  { key: "aggregate", name: "集計", sub: "月別・カテゴリ別の表" },
  { key: "related", name: "関係する取引明細", sub: "差が出たカテゴリなどの明細" },
  { key: "all", name: "すべての取引明細", sub: "期間内の明細をすべて（大きくなります）" },
] as const;

type Key = (typeof OPTIONS)[number]["key"];

/** 「AIに渡す」シート: 依頼文と元データを Markdown でコピー／ファイル共有する */
export default function AiSheet({ query, label, onClose }: { query: string; label: string; onClose: () => void }) {
  const [on, setOn] = useState<Record<Key, boolean>>({ prompt: true, aggregate: true, related: true, all: false });
  const [md, setMd] = useState("");
  const [title, setTitle] = useState(label);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const flags = OPTIONS.map((o) => `${o.key}=${on[o.key] ? 1 : 0}`).join("&");
    fetch(`/api/export?${query}&${flags}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setMd(j.data?.markdown ?? "");
        setTitle(j.data?.title ?? label);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, on, label]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(md);
      flash("コピーしました");
    } catch {
      flash("コピーできませんでした");
    }
  }

  async function share() {
    const filename = `家計_${title.replace(/[\\/:*?"<>|（）()\s]/g, "_")}.md`;
    const file = new File([md], filename, { type: "text/markdown" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title });
      } catch {
        /* キャンセル */
      }
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    flash("ファイルを保存しました");
  }

  const chars = md.length;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 lg:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="AIに渡す"
        className="flex max-h-[88vh] w-full max-w-[560px] flex-col gap-3 rounded-t-[20px] bg-card px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-2.5 lg:rounded-[20px] lg:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-[5px] w-10 self-center rounded bg-field lg:hidden" />
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">AIに渡す</h2>
            <div className="lbl">{title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる" className="flex h-11 w-11 items-center justify-center">
            <CloseIcon />
          </button>
        </div>

        <div className="flex flex-col">
          {OPTIONS.map((o) => (
            <label key={o.key} className="flex min-h-[52px] cursor-pointer items-center gap-3 border-t border-line2">
              <input
                type="checkbox"
                className="h-[22px] w-[22px] shrink-0 accent-accent"
                checked={on[o.key]}
                onChange={() => setOn((s) => ({ ...s, [o.key]: !s[o.key] }))}
              />
              <span className="flex-1">
                <span className="block text-sm font-medium">{o.name}</span>
                <span className="lbl">{o.sub}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex items-baseline justify-between pt-1">
          <span className="text-[13px] font-bold">プレビュー</span>
          <span className="lbl">{loading ? "作成中…" : `約 ${chars.toLocaleString("ja-JP")} 文字`}</span>
        </div>
        <pre className="min-h-[120px] flex-1 overflow-auto whitespace-pre-wrap rounded-[10px] border border-line bg-panel p-3 font-mono text-[11px] leading-relaxed text-ink2">
          {md.slice(0, 3000)}
          {md.length > 3000 ? "\n…" : ""}
        </pre>

        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-ghost h-[52px]" onClick={share} disabled={loading || !md}>
            <ShareIcon size={18} />
            ファイルで共有
          </button>
          <button type="button" className="btn-primary" onClick={copy} disabled={loading || !md}>
            <ClipboardIcon size={18} />
            コピー
          </button>
        </div>
        <div className="lbl text-center">
          {toast || (chars > 50000 ? "大きいので「ファイルで共有」がおすすめ（.md を AI アプリに直接渡す）" : "コピーして AI アプリに貼り付け")}
        </div>
      </div>
    </div>
  );
}
