"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "@/components/ui/icons";

/** JSON API を取得する小さなフック。reload で再取得できる */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "取得に失敗しました");
      setData(json.data as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load };
}

export function Page({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto flex flex-col gap-4 px-4 pb-32 pt-12 lg:px-10 lg:pb-12 lg:pt-8 ${wide ? "max-w-[1180px]" : "max-w-[720px]"}`}>
      {children}
    </main>
  );
}

export function PageTitle({ kicker, title, right }: { kicker: string; title: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="lbl">{kicker}</div>
        <h1 className="mt-0.5 text-[26px] font-bold leading-tight">{title}</h1>
      </div>
      {right}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card p-4 ${className}`}>{children}</section>;
}

export function CardTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold">{children}</h2>
      {right}
    </div>
  );
}

/** グレーの帯（読み込み中のプレースホルダー） */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-line2 motion-safe:animate-pulse ${className}`} />;
}

/** 読み込み中: 画面の形をしたスケルトン */
export function Loading({ cards = 3 }: { cards?: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="読み込み中">
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="card flex flex-col gap-3 p-4">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className={i === 0 ? "h-8 w-1/2" : "h-24 w-full"} />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="card p-4 text-sm text-over">{message}</div>;
}

/** 進捗バー。over のときはオレンジ */
export function Bar({ ratio, over = false, marker, height = 8 }: { ratio: number; over?: boolean; marker?: number; height?: number }) {
  return (
    <div className="relative overflow-visible rounded bg-line2" style={{ height }}>
      <div
        className={`h-full rounded ${over ? "bg-over-fill" : "bg-accent"}`}
        style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }}
      />
      {marker !== undefined && marker < 1 && (
        <div className="absolute -bottom-0.5 -top-0.5 w-0.5 bg-ink opacity-35" style={{ left: `${marker * 100}%` }} />
      )}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function MonthNav({ label, prevHref, nextHref, onPrev, onNext }: {
  label: string;
  prevHref?: string;
  nextHref?: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const cls = "flex h-11 w-10 items-center justify-center rounded-[10px] text-ink hover:bg-panel";
  const prev = prevHref ? (
    <Link href={prevHref} className={cls} aria-label="前の月"><ChevronLeft size={18} /></Link>
  ) : (
    <button type="button" className={cls} onClick={onPrev} aria-label="前の月"><ChevronLeft size={18} /></button>
  );
  const next = nextHref ? (
    <Link href={nextHref} className={cls} aria-label="次の月"><ChevronRight size={18} /></Link>
  ) : (
    <button type="button" className={cls} onClick={onNext} aria-label="次の月"><ChevronRight size={18} /></button>
  );
  return (
    <div className="flex items-center whitespace-nowrap">
      {prev}
      <span className="text-lg font-bold">{label}</span>
      {next}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; swatch: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-sub">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.swatch}
          {i.label}
        </span>
      ))}
    </div>
  );
}
