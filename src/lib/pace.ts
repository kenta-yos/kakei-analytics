/** 例年比ペースの計算（画面側でも使うので DB に依存させない） */

type ByYear = { category: string; byYear: Record<number, number> }[];

export type PaceData = {
  year: number;
  upToMonth: number;
  latestDate: string;
  /** 年ごとの月別支出（index 0 = 1月） */
  years: { year: number; monthly: number[] }[];
  /** カテゴリごとの、各年 1月1日〜upToMonth の同じ日までの累計 */
  categories: ByYear;
  /** 今月（最新データの月）の、各年の同じ月・同じ日までの支出 */
  month: {
    month: number;
    day: number;
    daysInMonth: number;
    totals: Record<number, number>;
    categories: ByYear;
    /** 各年の、その月まるごと1か月分（カテゴリ別） */
    fullCategories: ByYear;
  };
};

/** 例年の幅の広さ（標準偏差の何倍か） */
const BAND_WIDTH = 0.5;

/**
 * 例年の幅 = 比べる年の平均 ± 標準偏差 × 0.5（下限は 0）。
 * 最小〜最大や ±標準偏差 だと、年によって出たり出なかったりするカテゴリで幅が広がりすぎるため。
 */
function stats(vals: number[]) {
  if (vals.length === 0) return { min: 0, max: 0, avg: 0 };
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = vals.length > 1 ? Math.sqrt(vals.reduce((s, v) => s + (v - avg) ** 2, 0) / (vals.length - 1)) : 0;
  return { min: Math.max(0, avg - sd * BAND_WIDTH), max: avg + sd * BAND_WIDTH, avg };
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

/** 年初からの累計: 選んだ年の幅と平均（対象の月は同じ日まで） */
export function paceBand(pace: PaceData, baseYears: number[]) {
  const base = pace.years.filter((y) => baseYears.includes(y.year));
  const cumulative = (monthly: number[]) => monthly.reduce<number[]>((acc, v, i) => [...acc, (acc[i - 1] ?? 0) + v], []);
  const baseCum = base.map((y) => cumulative(y.monthly));
  const band = Array.from({ length: 12 }, (_, i) => stats(baseCum.map((c) => c[i])));
  // 対象の月は、過去の年も同じ日までで比べる（1か月まるごとだと月の途中で今年が少なく見えるため）
  const m = pace.upToMonth - 1;
  const toDay = (y: { year: number; monthly: number[] }) => (m > 0 ? cumulative(y.monthly)[m - 1] : 0) + (pace.month.totals[y.year] ?? 0);
  band[m] = stats(base.map(toDay));
  const current = pace.years.find((y) => y.year === pace.year);
  const currentCum = current ? cumulative(current.monthly).slice(0, pace.upToMonth) : [];

  return { band, currentCum, categories: categoryBand(pace.categories, pace.year, baseYears) };
}

/**
 * 今月末の見込み: このままいけば、今月末の累計が例年平均とどれくらい差がつくか。
 * 今月の見込み = 今年のここまでの支出 + 例年の「同じ日の翌日〜月末」の平均
 */
export function monthProjection(pace: PaceData, baseYears: number[]) {
  const m = pace.upToMonth - 1;
  const monthlyOf = (year: number) => pace.years.find((y) => y.year === year)?.monthly ?? Array(12).fill(0);
  const cumBefore = (year: number) => monthlyOf(year).slice(0, m).reduce((s, v) => s + v, 0);
  const toDay = (year: number) => pace.month.totals[year] ?? 0;
  const avg = (vals: number[]) => (vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);

  const soFar = toDay(pace.year);
  const restAvg = avg(baseYears.map((y) => monthlyOf(y)[m] - toDay(y)));
  const projectedMonth = soFar + restAvg;
  const avgMonth = avg(baseYears.map((y) => monthlyOf(y)[m]));
  const startGap = cumBefore(pace.year) - avg(baseYears.map(cumBefore));
  const endCum = cumBefore(pace.year) + projectedMonth;
  const end = stats(baseYears.map((y) => cumBefore(y) + monthlyOf(y)[m]));

  // カテゴリ別: 今月末の見込みを、例年の同じ月（まるごと1か月）と比べる
  const full = new Map(pace.month.fullCategories.map((c) => [c.category, c.byYear]));
  const partial = new Map(pace.month.categories.map((c) => [c.category, c.byYear]));
  const names = new Set([...full.keys(), ...partial.keys()]);
  const projected = Array.from(names).map((category) => {
    const f = full.get(category) ?? {};
    const pt = partial.get(category) ?? {};
    const rest = avg(baseYears.map((y) => (f[y] ?? 0) - (pt[y] ?? 0)));
    return { category, byYear: { ...f, [pace.year]: (pt[pace.year] ?? 0) + rest } };
  });

  return {
    soFar,
    restAvg,
    projectedMonth,
    avgMonth,
    startGap,
    endGap: endCum - end.avg,
    change: projectedMonth - avgMonth,
    endCum,
    endBand: end,
    categories: categoryBand(projected, pace.year, baseYears),
  };
}
