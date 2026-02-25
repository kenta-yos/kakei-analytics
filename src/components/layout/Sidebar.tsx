"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/report", label: "決算レポート", icon: "📊" },
  { href: "/budget", label: "予算管理", icon: "◎" },
  { href: "/transactions", label: "取引明細", icon: "≡" },
  { href: "/pl", label: "損益計算書", icon: "%" },
  { href: "/balance-sheet", label: "貸借対照表", icon: "⊞" },
  { href: "/analytics", label: "分析", icon: "⊕" },
  { href: "/trends", label: "推移グラフ", icon: "↗" },
  { href: "/standard-budget", label: "標準予算", icon: "⊙" },
  { href: "/special-expense", label: "特別経費B", icon: "★" },
  { href: "/import", label: "CSVインポート", icon: "↑" },
];

type Props = { isOpen?: boolean; onClose?: () => void };

export default function Sidebar({ isOpen, onClose }: Props) {
  const pathname = usePathname();
  return (
    <>
      {/* モバイル用オーバーレイ背景 */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* サイドバー本体 */}
      <aside
        className={cn(
          "w-56 shrink-0 bg-slate-900 border-r border-slate-800 h-screen flex flex-col",
          // デスクトップ: 常時表示
          "hidden lg:flex",
          // モバイル: isOpen のときだけオーバーレイ表示
          isOpen && "!flex fixed inset-y-0 left-0 z-50"
        )}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-white font-bold text-base leading-tight">家計 Analytics</h1>
            <p className="text-slate-500 text-xs mt-0.5">Strategic Finance</p>
          </div>
          {/* モバイル用閉じるボタン */}
          <button
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="lg:hidden text-slate-500 hover:text-white p-1"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 py-3 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-blue-600/20 text-blue-400 border-r-2 border-blue-500"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                )}
              >
                <span className="text-base w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
