/** 例年比ペースの計算（画面側でも使うので DB に依存させない） */

export type PaceData = {
  year: number;
  upToMonth: number;
  latestDate: string;
  /** 年ごとの月別支出（index 0 = 1月） */
  years: { year: number; monthly: number[] }[];
  /** カテゴリごとの、各年 1月〜upToMonth の累計 */
  categories: { category: string; byYear: Record<number, number> }[];
};

/** 選んだ年の累計から、幅（最小〜最大）と平均を出す */
export function paceBand(pace: PaceData, baseYears: number[]) {
  const base = pace.years.filter((y) => baseYears.includes(y.year));
  const cumulative = (monthly: number[]) => monthly.reduce<number[]>((acc, v, i) => [...acc, (acc[i - 1] ?? 0) + v], []);
  const baseCum = base.map((y) => cumulative(y.monthly));
  const band = Array.from({ length: 12 }, (_, i) => {
    const vals = baseCum.map((c) => c[i]);
    if (vals.length === 0) return { min: 0, max: 0, avg: 0 };
    return { min: Math.min(...vals), max: Math.max(...vals), avg: vals.reduce((s, v) => s + v, 0) / vals.length };
  });
  const current = pace.years.find((y) => y.year === pace.year);
  const currentCum = current ? cumulative(current.monthly).slice(0, pace.upToMonth) : [];

  const categories = pace.categories
    .map((c) => {
      const vals = baseYears.map((y) => c.byYear[y] ?? 0);
      const cur = c.byYear[pace.year] ?? 0;
      const min = vals.length ? Math.min(...vals) : 0;
      const max = vals.length ? Math.max(...vals) : 0;
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      const outside = cur > max ? cur - max : cur < min ? cur - min : 0;
      return { category: c.category, current: cur, min, max, avg, outside };
    })
    .filter((c) => c.current > 0 || c.max > 0);

  return { band, currentCum, categories };
}
