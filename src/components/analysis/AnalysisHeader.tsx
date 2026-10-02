"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ClipboardIcon } from "@/components/ui/icons";
import AiSheet from "@/components/analysis/AiSheet";

const TABS = [
  { href: "/analysis/pace", label: "例年比" },
  { href: "/analysis/why", label: "今月の要因" },
  { href: "/analysis/bonus", label: "特別経費B" },
  { href: "/analysis/upcoming", label: "大型支出" },
];

export default function AnalysisHeader({
  title,
  exportQuery,
  exportLabel,
}: {
  title: string;
  /** /api/export に渡すクエリ（view=... 含む） */
  exportQuery: string | null;
  exportLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="lbl">分析</div>
          <h1 className="mt-0.5 text-[26px] font-bold leading-tight">{title}</h1>
        </div>
        <button type="button" className="btn-small shrink-0" onClick={() => setOpen(true)} disabled={!exportQuery}>
          <ClipboardIcon size={18} />
          AIに渡す
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`flex h-11 items-center justify-center rounded-full border px-1 text-[12.5px] ${
              pathname.startsWith(t.href) ? "border-ink bg-ink font-bold text-white" : "border-line bg-card text-ink"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {open && exportQuery && <AiSheet query={exportQuery} label={exportLabel} onClose={() => setOpen(false)} />}
    </>
  );
}
