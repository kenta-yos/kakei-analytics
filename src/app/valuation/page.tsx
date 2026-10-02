"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, ErrorBox, Loading, MonthNav, Page, PageTitle, useApi } from "@/components/ui/kit";
import { ChevronLeft } from "@/components/ui/icons";
import { nextMonth, num, prevMonth, signed, yen } from "@/lib/format";

type Product = { productName: string; marketValue: number; costBasis: number; unrealizedGain: number; gainRate: number; hasRecord: boolean };
type InvestmentData = { year: number; month: number; products: Product[] };

export default function ValuationPage() {
  const [ym, setYm] = useState<{ year: number; month: number } | null>(null);
  // 初期表示は取引データが入っている最新の月（評価額は月末時点で入力するため）
  const home = useApi<{ year: number; month: number; latestDate: string | null }>(ym ? null : "/api/home");
  useEffect(() => {
    if (ym || !home.data) return;
    const d = home.data.latestDate;
    setYm(d ? { year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)) } : { year: home.data.year, month: home.data.month });
  }, [ym, home.data]);

  const { data, error, loading, reload } = useApi<InvestmentData>(ym ? `/api/investment?year=${ym.year}&month=${ym.month}` : null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    setValues(Object.fromEntries(data.products.map((p) => [p.productName, p.hasRecord ? num(p.marketValue) : ""])));
    setSaved(false);
  }, [data]);

  async function save() {
    if (!ym || !data) return;
    setSaving(true);
    try {
      await fetch("/api/investment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: ym.year,
          month: ym.month,
          valuations: data.products
            .filter((p) => values[p.productName]?.trim())
            .map((p) => ({ productName: p.productName, marketValue: parseInt(values[p.productName].replace(/[^0-9]/g, ""), 10) || 0 })),
        }),
      });
      setSaved(true);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page>
      <Link href="/" className="flex min-h-11 items-center gap-1 text-sm text-accent">
        <ChevronLeft size={18} />
        ホーム
      </Link>
      <PageTitle kicker="データ" title="投資の評価額" />
      {ym && (
        <div className="flex justify-center">
          <MonthNav
            label={`${ym.year}年${ym.month}月末`}
            onPrev={() => setYm(prevMonth(ym.year, ym.month))}
            onNext={() => setYm(nextMonth(ym.year, ym.month))}
          />
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {(loading || !ym) && !data && <Loading />}
      {data && (
        <>
          {data.products.map((p) => (
            <Card key={p.productName} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <label htmlFor={`val-${p.productName}`} className="text-[15px] font-bold">
                  {p.productName}
                </label>
                <span className="lbl">{p.hasRecord ? "入力済み" : "未入力"}</span>
              </div>
              <input
                id={`val-${p.productName}`}
                inputMode="numeric"
                placeholder={p.marketValue ? `前回 ${num(p.marketValue)}` : "評価額"}
                value={values[p.productName] ?? ""}
                onChange={(e) => setValues({ ...values, [p.productName]: e.target.value })}
                onFocus={(e) => e.target.select()}
                className="amt-input"
              />
              <span className="lbl">
                累計の拠出 {yen(p.costBasis)}
                {p.hasRecord && ` · 含み損益 ${signed(p.unrealizedGain)}（${p.gainRate}%）`}
              </span>
            </Card>
          ))}
          <button type="button" className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "保存しています…" : saved ? "保存しました" : `${data.month}月末の評価額を保存する`}
          </button>
        </>
      )}
    </Page>
  );
}
