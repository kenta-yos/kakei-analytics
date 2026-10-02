"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnalysisIcon, FireIcon, HomeIcon, KessanIcon, SettingsIcon } from "@/components/ui/icons";

const NAV = [
  { href: "/", label: "ホーム", icon: HomeIcon, match: (p: string) => p === "/" },
  { href: "/kessan", label: "決算", icon: KessanIcon, match: (p: string) => p.startsWith("/kessan") },
  { href: "/analysis/pace", label: "分析", icon: AnalysisIcon, match: (p: string) => p.startsWith("/analysis") },
  { href: "/fire", label: "FIRE", icon: FireIcon, match: (p: string) => p.startsWith("/fire") },
];

/** 下のタブを出さない画面（独自のフッターを持つ編集画面など） */
const NO_TABS = ["/login", "/budget"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  const showTabs = !NO_TABS.some((p) => pathname.startsWith(p));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-1 border-r border-line bg-card px-4 py-7 lg:flex">
        <div className="px-3 pb-5 text-base font-bold">家計の締め</div>
        {NAV.map(({ href, label, icon: Icon, match }) => (
          <Link
            key={href}
            href={href}
            className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm ${
              match(pathname) ? "bg-accent-soft font-bold text-accent" : "text-ink2 hover:bg-panel"
            }`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
        <div className="flex-1" />
        <Link
          href="/settings"
          className={`flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm ${
            pathname.startsWith("/settings") ? "bg-accent-soft font-bold text-accent" : "text-ink2 hover:bg-panel"
          }`}
        >
          <SettingsIcon size={20} />
          設定（標準予算）
        </Link>
      </aside>

      <div className="min-w-0">{children}</div>

      {showTabs && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-card px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-1 lg:hidden">
          {NAV.map(({ href, label, icon: Icon, match }) => (
            <Link
              key={href}
              href={href}
              className={`flex min-h-14 flex-col items-center justify-center gap-[3px] text-[11px] ${
                match(pathname) ? "font-bold text-accent" : "text-sub"
              }`}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
