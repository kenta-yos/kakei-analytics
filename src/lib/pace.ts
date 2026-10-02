/** 例年比ペースの計算（画面側でも使うので DB に依存させない） */

type ByYear = { category: string; byYear: Record<number, number> }[];

export type PaceData = {
  year: number;
  upToMonth: number;
  latestDate: string;
  /** 年ごとの月別支出（index 0 = 1月） */
  years: { year: number; monthly: number[] }[];
  /** カテゴリごとの、各年 1月〜upToMonth の累計 */
  categories: ByYear;
  /** 今月（最新データの月）の、各年の同じ月・同じ日までの支出 */
  month: {
    month: number;
    day: number;
    daysInMonth: number;
    totals: Record<number, number>;
    categories: ByYear;
  };
};

/**
 * 例年の幅 = 比べる年の平均 ± 標準偏差（下限は 0）。
 * 最小〜最大だと、1年だけ多い・少ない年があると幅が広がりすぎるため。
 */
function stats(vals: number[]) {
  if (vals.length === 0) return { min: 0, max: 0, avg: 0 };
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / (vals.length - 1)) : 0;
  return { min: Math.max(0, avg - sd), max: avg + sd, avg };
}

/** カテゴリごとに、比べる年の幅と今年の位置を出す */
export function categoryBand(cats: ByYear, year: number, baseYears: number[]) {
  return cats
    .map((c) => {
      const cur = c.byYear[year] ?? 0;
      const { min, max, avg } = stats(baseYears.map((y) => c.byYear[y] ?? 0));
      const outside = cur > max ? cur - max : cur < min ? cur - min : 0;
      return { category: c.category, current: cur, min, max, avg, outside };
    })
    .filter((c) => c.current > 0 || c.max > 0);
}

export type CategoryBand = ReturnType<typeof categoryBand>[number];

/** 年初からの累計: 選んだ年の幅（最小〜最大）と平均 */
export function paceBand(pace: PaceData, baseYears: number[]) {
  const base = pace.years.filter((y) => baseYears.includes(y.year));
  const cumulative = (monthly: number[]) => monthly.reduce<number[]>((acc, v, i) => [...acc, (acc[i - 1] ?? 0) + v], []);
  const baseCum = base.map((y) => cumulative(y.monthly));
  const band = Array.from({ length: 12 }, (_, i) => stats(baseCum.map((c) => c[i])));
  const current = pace.years.find((y) => y.year === pace.year);
  const currentCum = current ? cumulative(current.monthly).slice(0, pace.upToMonth) : [];

  return { band, currentCum, categories: categoryBand(pace.categories, pace.year, baseYears) };
}

/** 今月: 同じ月・同じ日までの支出を、選んだ年と比べる */
export function monthBand(pace: PaceData, baseYears: number[]) {
  const m = pace.month;
  return {
    current: m.totals[pace.year] ?? 0,
    ...stats(baseYears.map((y) => m.totals[y] ?? 0)),
    perYear: baseYears.map((y) => ({ year: y, amount: m.totals[y] ?? 0 })),
    categories: categoryBand(m.categories, pace.year, baseYears),
  };
}
