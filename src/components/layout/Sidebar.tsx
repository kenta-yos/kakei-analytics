"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "ダッシュボード", icon: "◉" },
  { href: "/budget", label: "予算管理", icon: "◎" },
  { href: "/transactions", label: "取引明細", icon: "≡" },
  { href: "/pl", label: "損益計算書", icon: "%" },
  { href: "/balance-sheet", label: "貸借対照表", icon: "⊞" },
  { href: "/analytics", label: "分析", icon: "⊕" },
  { href: "/trends", label: "推移グラフ", icon: "↗" },
  { href: "/import", label: "CSVインポート", icon: "↑" },
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 h-screen sticky top-0 flex flex-col">
      <div className="p-4 border-b border-slate-800">
        <h1 className="text-white font-bold text-base leading-tight">家計 Analytics</h1>
        <p className="text-slate-500 text-xs mt-0.5">Strategic Finance</p>
      </div>
      <nav className="flex-1 py-3 overflow-y-auto">
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
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
  );
}
