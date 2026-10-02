/**
 * GET /api/kessan?mode=month|quarter|year
 * 決算画面用: 期間ごとの純資産（BS）と損益（PL）、純資産が増減した理由
 */
import { NextRequest, NextResponse } from "next/server";
import {
  ASSET_GROUP_LABELS,
  getAssetSeries,
  getInvestmentGainByMonth,
  getLatestData,
  getLatestValuationMonth,
  getMonthlyPL,
} from "@/lib/finance";
import { ymKey } from "@/lib/format";

type Mode = "month" | "quarter" | "year";

type Period = { label: string; shortLabel: string; startYm: number; endYm: number };

function buildPeriods(mode: Mode, latestYear: number, latestMonth: number, firstYear: number): Period[] {
  const periods: Period[] = [];
  if (mode === "month") {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(latestYear, latestMonth - 1 - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      periods.push({ label: `${y}年${m}月`, shortLabel: String(m), startYm: ymKey(y, m), endYm: ymKey(y, m) });
    }
  } else if (mode === "quarter") {
    const latestQ = Math.ceil(latestMonth / 3);
    for (let i = 7; i >= 0; i--) {
      const idx = latestYear * 4 + (latestQ - 1) - i;
      const y = Math.floor(idx / 4);
      const q = (idx % 4) + 1;
      periods.push({
        label: `${y}年Q${q}`,
        shortLabel: `${String(y).slice(2)}Q${q}`,
        startYm: ymKey(y, q * 3 - 2),
        endYm: Math.min(ymKey(y, q * 3), ymKey(latestYear, latestMonth)),
      });
    }
  } else {
    for (let y = firstYear; y <= latestYear; y++) {
      periods.push({
        label: `${y}年`,
        shortLabel: String(y).slice(2),
        startYm: ymKey(y, 1),
        endYm: Math.min(ymKey(y, 12), ymKey(latestYear, latestMonth)),
      });
    }
  }
  return periods;
}

/** 期間の直前の月 */
function beforeYm(ym: number) {
  const y = Math.floor(ym / 100);
  const m = ym % 100;
  return m === 1 ? ymKey(y - 1, 12) : ym - 1;
}

export async function GET(req: NextRequest) {
  try {
    const mode = (req.nextUrl.searchParams.get("mode") ?? "month") as Mode;
    const latest = await getLatestData();
    if (!latest) return NextResponse.json({ data: { periods: [] } });

    const [pl, assets, gains, valuation] = await Promise.all([
      getMonthlyPL(),
      getAssetSeries(),
      getInvestmentGainByMonth(),
      getLatestValuationMonth(),
    ]);
    const valuationYm = valuation ? ymKey(valuation.year, valuation.month) : 0;
    const firstYear = pl[0]?.year ?? latest.year;
    const periods = buildPeriods(mode, latest.year, latest.month, firstYear);

    // 資産のスナップショットがない月は、その時点より前で最新の値を使う
    const assetKeys = Array.from(assets.keys()).sort((a, b) => a - b);
    const assetAt = (ym: number) => {
      let found: { net: number; byType: Record<string, number> } | null = null;
      for (const k of assetKeys) {
        if (k > ym) break;
        found = assets.get(k)!;
      }
      return found;
    };

    const data = periods.map((p) => {
      const months = pl.filter((r) => {
        const k = ymKey(r.year, r.month);
        return k >= p.startYm && k <= p.endYm;
      });
      const income = months.reduce((s, r) => s + r.income, 0);
      const expense = months.reduce((s, r) => s + r.expense, 0);
      let investGain = 0;
      gains.forEach((g, k) => {
        if (k >= p.startYm && k <= p.endYm) investGain += g;
      });

      const end = assetAt(p.endYm);
      const start = assetAt(beforeYm(p.startYm));
      const netAssets = end?.net ?? null;
      const change = end && start ? end.net - start.net : null;
      const operating = income - expense;

      const types = Array.from(new Set([...Object.keys(end?.byType ?? {}), ...Object.keys(start?.byType ?? {})]));
      const breakdown = types
        .map((t) => ({
          type: t,
          label: ASSET_GROUP_LABELS[t] ?? t,
          value: end?.byType[t] ?? 0,
          change: (end?.byType[t] ?? 0) - (start?.byType[t] ?? 0),
        }))
        .filter((b) => b.value !== 0 || b.change !== 0)
        .sort((a, b) => Object.keys(ASSET_GROUP_LABELS).indexOf(a.type) - Object.keys(ASSET_GROUP_LABELS).indexOf(b.type));

      return {
        label: p.label,
        shortLabel: p.shortLabel,
        partial: p.endYm === ymKey(latest.year, latest.month) && mode !== "month",
        // 投資の評価額が未入力（運用損益が入っていない）
        valuationMissing: valuationYm > 0 && p.endYm > valuationYm,
        income,
        expense,
        operating,
        investGain,
        total: operating + investGain,
        netAssets,
        change,
        other: change === null ? null : change - operating - investGain,
        breakdown,
      };
    });

    return NextResponse.json({ data: { mode, latestDate: latest.date, latestValuation: valuation, periods: data } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
