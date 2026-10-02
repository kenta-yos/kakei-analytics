/**
 * 分析画面の集計。画面の API と「AIに渡す」の両方から使う。
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { BONUS_CATEGORY } from "@/lib/categories";
import {
  getBonusLedger,
  getConsumptionByMonthCategory,
  getConsumptionMonthToDay,
  getConsumptionTransactions,
  getLatestData,
  getSavedBudgets,
  getStandardBudgets,
  type TxItem,
} from "@/lib/finance";
import { nextMonth, prevMonth, ymKey } from "@/lib/format";
import type { PaceData } from "@/lib/pace";

// ─────────────────────────────────────────────────────────────────────────────
// 例年比ペース
// ─────────────────────────────────────────────────────────────────────────────

export async function getPaceData(): Promise<PaceData | null> {
  const latest = await getLatestData();
  if (!latest) return null;
  const fromYear = latest.year - 7;
  const [data, monthData] = await Promise.all([
    getConsumptionByMonthCategory(fromYear),
    getConsumptionMonthToDay(fromYear, latest.month, latest.day),
  ]);

  const monthTotals: Record<number, number> = {};
  const monthCats = new Map<string, Record<number, number>>();
  for (const r of monthData) {
    monthTotals[r.year] = (monthTotals[r.year] ?? 0) + r.amount;
    if (!monthCats.has(r.category)) monthCats.set(r.category, {});
    monthCats.get(r.category)![r.year] = r.amount;
  }

  const yearMap = new Map<number, number[]>();
  const catMap = new Map<string, Record<number, number>>();
  for (const r of data) {
    if (!yearMap.has(r.year)) yearMap.set(r.year, Array(12).fill(0));
    yearMap.get(r.year)![r.month - 1] += r.amount;
    // カテゴリ別の累計: 対象の月より前は1か月分まるごと、対象の月は同じ日までの分（下で足す）
    if (r.month < latest.month) {
      if (!catMap.has(r.category)) catMap.set(r.category, {});
      const byYear = catMap.get(r.category)!;
      byYear[r.year] = (byYear[r.year] ?? 0) + r.amount;
    }
  }

  for (const r of monthData) {
    if (!catMap.has(r.category)) catMap.set(r.category, {});
    const byYear = catMap.get(r.category)!;
    byYear[r.year] = (byYear[r.year] ?? 0) + r.amount;
  }

  return {
    year: latest.year,
    upToMonth: latest.month,
    latestDate: latest.date,
    years: Array.from(yearMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, monthly]) => ({ year, monthly })),
    categories: Array.from(catMap.entries()).map(([category, byYear]) => ({ category, byYear })),
    month: {
      month: latest.month,
      day: latest.day,
      daysInMonth: new Date(latest.year, latest.month, 0).getDate(),
      totals: monthTotals,
      categories: Array.from(monthCats.entries()).map(([category, byYear]) => ({ category, byYear })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 今月はなぜ多いか
// ─────────────────────────────────────────────────────────────────────────────

export async function getWhyData(year: number, month: number) {
  const p = prevMonth(year, month);
  const data = await getConsumptionByMonthCategory(Math.min(p.year, year - 3));

  const pick = (y: number, m: number) => {
    const map = new Map<string, number>();
    data.filter((r) => r.year === y && r.month === m).forEach((r) => map.set(r.category, r.amount));
    return map;
  };
  const current = pick(year, month);
  const prev = pick(p.year, p.month);
  const baseYears = [year - 1, year - 2, year - 3].filter((y) => data.some((r) => r.year === y && r.month === month));
  const sameMonths = baseYears.map((y) => pick(y, month));

  const cats = new Set([...current.keys(), ...prev.keys(), ...sameMonths.flatMap((m) => Array.from(m.keys()))]);
  const rows = Array.from(cats).map((category) => ({
    category,
    current: current.get(category) ?? 0,
    prev: prev.get(category) ?? 0,
    yearAvg: baseYears.length
      ? sameMonths.reduce((s, m) => s + (m.get(category) ?? 0), 0) / baseYears.length
      : 0,
  }));

  const sum = (key: "current" | "prev" | "yearAvg") => rows.reduce((s, r) => s + r[key], 0);
  const transactions = await getConsumptionTransactions({
    fromYm: ymKey(year, month),
    toYm: ymKey(year, month),
    limitPerCategory: 5,
  });

  return {
    year,
    month,
    prevMonth: p,
    baseYears,
    totals: { current: sum("current"), prev: sum("prev"), yearAvg: sum("yearAvg") },
    rows,
    transactions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 特別経費B
// ─────────────────────────────────────────────────────────────────────────────

export async function getBonusData() {
  const [latest, ledger, standard] = await Promise.all([getLatestData(), getBonusLedger(), getStandardBudgets()]);
  if (!latest || ledger.length === 0) return null;

  const latestYm = ymKey(latest.year, latest.month);
  const done = ledger.filter((l) => l.ym <= latestYm);
  const current = done[done.length - 1];
  const bonusIdx = done.map((l, i) => (l.isBonus ? i : -1)).filter((i) => i >= 0);
  const lastBonusIdx = bonusIdx[bonusIdx.length - 1] ?? 0;
  const monthsSince = done.length - lastBonusIdx;

  const usageAfter = (startIdx: number, months: number) => {
    const start = done[startIdx];
    const window = done.slice(startIdx, startIdx + months);
    if (window.length < months || start.allocation <= 0) return null;
    const used = window.reduce((s, l) => s + l.spent, 0);
    // 積み増した額（賞与）のうち、同じ期間で使った割合
    return { year: start.year, month: start.month, bonus: start.allocation, used, rate: used / start.allocation };
  };
  const usage = usageAfter(lastBonusIdx, monthsSince);
  const pastUsage = bonusIdx
    .slice(0, -1)
    .map((i) => usageAfter(i, monthsSince))
    .filter((u): u is NonNullable<typeof u> => u !== null)
    .reverse();

  // 予定: 今後6か月
  const horizon: { year: number; month: number }[] = [];
  let cursor = nextMonth(latest.year, latest.month);
  for (let i = 0; i < 6; i++) {
    horizon.push(cursor);
    cursor = nextMonth(cursor.year, cursor.month);
  }
  const planRows = await db.execute(sql`
    SELECT id, year, month, item_name, planned_amount FROM special_expenses_b
    WHERE (year * 100 + month) BETWEEN ${ymKey(horizon[0].year, horizon[0].month)} AND ${ymKey(horizon[5].year, horizon[5].month)}
    ORDER BY year, month, id
  `);
  const plans = (planRows.rows as Record<string, unknown>[]).map((r) => ({
    year: Number(r.year),
    month: Number(r.month),
    itemName: String(r.item_name),
    amount: Number(r.planned_amount),
  }));

  // 見込み: 毎月の配分（保存済みの予算があればそれ、なければ標準予算）− 予定
  const stdAlloc = standard.get(BONUS_CATEGORY) ?? 0;
  const savedAlloc = await Promise.all(horizon.map((h) => getSavedBudgets(h.year, h.month)));
  let balance = current.balanceEnd;
  const projection = horizon.map((h, i) => {
    const allocation = savedAlloc[i].get(BONUS_CATEGORY)?.allocation ?? stdAlloc;
    const planned = plans.filter((p) => p.year === h.year && p.month === h.month).reduce((s, p) => s + p.amount, 0);
    balance += allocation - planned;
    return { ...h, allocation, planned, balance };
  });

  const yearSeries = (y: number) =>
    Array.from({ length: 12 }, (_, i) => ledger.find((l) => l.year === y && l.month === i + 1 && l.ym <= latestYm)?.balanceEnd ?? null);

  return {
    latestDate: latest.date,
    current: { year: current.year, month: current.month, balance: current.balanceEnd },
    lastBonus: { year: done[lastBonusIdx].year, month: done[lastBonusIdx].month, allocation: done[lastBonusIdx].allocation },
    monthsSince,
    usage,
    pastUsage,
    plans,
    projection,
    series: { year: latest.year, current: yearSeries(latest.year), previous: yearSeries(latest.year - 1) },
    ledger: done.slice(-24),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 大きな支出の見通し（過去の実績から、年に数回だけ発生する支出を拾う）
// ─────────────────────────────────────────────────────────────────────────────

export const BIG_THRESHOLD = 10000;

export async function getUpcomingData() {
  const latest = await getLatestData();
  if (!latest) return null;
  const fromYear = latest.year - 3;
  const txs = await getConsumptionTransactions({
    fromYm: ymKey(fromYear, 1),
    toYm: ymKey(latest.year, latest.month),
  });

  const groups = new Map<string, TxItem[]>();
  for (const t of txs) {
    if (t.amount < BIG_THRESHOLD || !t.itemName.trim()) continue;
    const key = `${t.category}\u0000${t.itemName.trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const items = Array.from(groups.entries())
    .map(([key, list]) => {
      const [category, itemName] = key.split("\u0000");
      const years = Array.from(new Set(list.map((t) => Number(t.date.slice(0, 4))))).sort();
      if (years.length < 2) return null;
      const perYear = list.length / years.length;
      if (perYear > 3) return null; // 毎月・隔月のような支出は除く

      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      const recent = sorted.slice(0, 3).map((t) => t.amount).sort((a, b) => a - b);
      const amount = recent[Math.floor(recent.length / 2)];

      const gaps = years.slice(1).map((y, i) => y - years[i]);
      const biennial = gaps.every((g) => g === 2);

      const monthYears = new Map<number, Set<number>>();
      list.forEach((t) => {
        const m = Number(t.date.slice(5, 7));
        if (!monthYears.has(m)) monthYears.set(m, new Set());
        monthYears.get(m)!.add(Number(t.date.slice(0, 4)));
      });
      let months = Array.from(monthYears.entries()).filter(([, ys]) => ys.size >= 2).map(([m]) => m);
      if (months.length === 0) months = Array.from(new Set(sorted.filter((t) => t.date.startsWith(sorted[0].date.slice(0, 4))).map((t) => Number(t.date.slice(5, 7)))));
      months.sort((a, b) => a - b);

      const lastYear = years[years.length - 1];
      const occurrences: { year: number; month: number }[] = [];
      let c = nextMonth(latest.year, latest.month);
      for (let i = 0; i < 12; i++) {
        const yearOk = !biennial || (c.year - lastYear) % 2 === 0;
        if (yearOk && months.includes(c.month)) occurrences.push(c);
        c = nextMonth(c.year, c.month);
      }

      return {
        category,
        itemName,
        amount,
        cycle: biennial ? "2年ごと" : `年${Math.max(1, Math.round(perYear))}回`,
        months,
        next: occurrences[0] ?? null,
        occurrences,
        fund: category === BONUS_CATEGORY ? ("B" as const) : ("normal" as const),
        history: sorted.slice(0, 6),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null && x.occurrences.length > 0)
    .sort((a, b) => b.amount * b.occurrences.length - a.amount * a.occurrences.length);

  const forecast: { year: number; month: number; bonus: number; normal: number }[] = [];
  let c = nextMonth(latest.year, latest.month);
  for (let i = 0; i < 12; i++) {
    const at = items.flatMap((it) => it.occurrences.filter((o) => o.year === c.year && o.month === c.month).map(() => it));
    forecast.push({
      ...c,
      bonus: at.filter((it) => it.fund === "B").reduce((s, it) => s + it.amount, 0),
      normal: at.filter((it) => it.fund === "normal").reduce((s, it) => s + it.amount, 0),
    });
    c = nextMonth(c.year, c.month);
  }

  return { latestDate: latest.date, fromYear, items, forecast };
}
