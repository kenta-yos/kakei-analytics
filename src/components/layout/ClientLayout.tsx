"use client";
import { useState } from "react";
import Sidebar from "./Sidebar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar isOpen={open} onClose={() => setOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        {/* モバイル用ヘッダー */}
        <header className="lg:hidden sticky top-0 z-30 h-12 bg-slate-900 border-b border-slate-800 flex items-center gap-3 px-4 shrink-0">
          <button
            onClick={() => setOpen(true)}
            aria-label="メニューを開く"
            className="text-slate-400 hover:text-white p-1 -ml-1"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-white font-bold text-sm">家計 Analytics</span>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
