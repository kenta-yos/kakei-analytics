/**
 * 集計ロジックの置き場所。
 * 画面や API ごとに計算がばらつかないよう、収支・予算・資産・投資損益の定義はここだけに書く。
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { BONUS_CATEGORY, SAVINGS_CATEGORIES } from "@/lib/categories";
import { prevMonth, ymKey } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 条件の定義
// ─────────────────────────────────────────────────────────────────────────────

/** PL に載せる取引（投資損益は excludeFromPl でも含める。振替は除く） */
const PL_WHERE = sql`(exclude_from_pl = false OR category = '投資損益') AND type <> '振替' AND category <> '振替'`;

/** 予算の実績・支出分析に使う支出 */
const EXPENSE_WHERE = sql`type = '支出' AND exclude_from_pl = false AND category <> '振替'`;

const SAVINGS_LIST = sql.join(Array.from(SAVINGS_CATEGORIES).map((c) => sql`${c}`), sql`, `);

/** 消費としての支出（貯蓄カテゴリを除く） */
const CONSUMPTION_WHERE = sql`${EXPENSE_WHERE} AND category NOT IN (${SAVINGS_LIST})`;

/** 投資商品 → 資産名（拠出額の判定に使う） */
export const PRODUCT_TO_ASSET: Record<string, string> = {
  iDeCo: "iDeCo",
  SBI投資信託: "投資信託/SBI",
};

export const ASSET_TYPE_LABELS: Record<string, string> = {
  bank: "銀行口座",
  investment: "投資",
  cash: "現金",
  ic_card: "ICカード",
  qr_pay: "QR決済",
  other: "その他",
  credit: "クレジットカード",
};

// ─────────────────────────────────────────────────────────────────────────────
// 基本
// ─────────────────────────────────────────────────────────────────────────────

/** 取引データがある最新の日付 */
export async function getLatestData() {
  const [r] = await rows(sql`SELECT max(date)::text AS d FROM transactions`);
  const d: string | null = r?.d ?? null;
  if (!d) return null;
  const [y, m, day] = d.split("-").map(Number);
  return { date: d, year: y, month: m, day };
}

/** 投資評価額が登録されている最新の月 */
export async function getLatestValuationMonth() {
  const [r] = await rows(sql`SELECT year, month FROM investment_valuations ORDER BY year DESC, month DESC LIMIT 1`);
  return r ? { year: Number(r.year), month: Number(r.month) } : null;
}

/** 月別の収入・支出（PL 定義）。from を省略すると全期間 */
export async function getMonthlyPL(fromYm = 0) {
  const r = await rows(sql`
    SELECT year, month, sum(income_amount) AS income, sum(expense_amount) AS expense
    FROM transactions
    WHERE ${PL_WHERE} AND (year * 100 + month) >= ${fromYm}
    GROUP BY year, month ORDER BY year, month
  `);
  return r.map((x) => ({
    year: Number(x.year),
    month: Number(x.month),
    income: Number(x.income ?? 0),
    expense: Number(x.expense ?? 0),
  }));
}

/** 1か月の PL 収入（予算配分の上限に使う） */
export async function getMonthIncome(year: number, month: number) {
  const [r] = await rows(sql`
    SELECT coalesce(sum(income_amount), 0) AS income, coalesce(sum(expense_amount), 0) AS expense
    FROM transactions WHERE ${PL_WHERE} AND year = ${year} AND month = ${month}
  `);
  return { income: Number(r?.income ?? 0), expense: Number(r?.expense ?? 0) };
}

// ─────────────────────────────────────────────────────────────────────────────
// 予算
// ─────────────────────────────────────────────────────────────────────────────

export async function getCategoryExpense(year: number, month: number) {
  const r = await rows(sql`
    SELECT category, sum(expense_amount) AS actual FROM transactions
    WHERE ${EXPENSE_WHERE} AND year = ${year} AND month = ${month}
    GROUP BY category
  `);
  return new Map(r.map((x) => [String(x.category), Number(x.actual ?? 0)]));
}

export async function getSavedBudgets(year: number, month: number) {
  const r = await rows(sql`
    SELECT category_name, allocation, carryover, total_budget FROM budgets
    WHERE year = ${year} AND month = ${month}
  `);
  return new Map(
    r.map((x) => [
      String(x.category_name),
      { allocation: Number(x.allocation), carryover: Number(x.carryover), totalBudget: Number(x.total_budget) },
    ])
  );
}

/** 前月の予算残（予算 − 実績）をそのまま今月へ繰り越す */
export async function getCarryover(year: number, month: number) {
  const p = prevMonth(year, month);
  const [prevBudgets, prevActual] = await Promise.all([getSavedBudgets(p.year, p.month), getCategoryExpense(p.year, p.month)]);
  const map = new Map<string, number>();
  prevBudgets.forEach((b, cat) => map.set(cat, b.totalBudget - (prevActual.get(cat) ?? 0)));
  return map;
}

export async function getStandardBudgets() {
  const r = await rows(sql`SELECT category_name, allocation FROM standard_budgets`);
  return new Map(r.map((x) => [String(x.category_name), Number(x.allocation)]));
}

// ─────────────────────────────────────────────────────────────────────────────
// 資産（BS）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 月末時点の資産。各口座は「その月以前で最新のスナップショット」を引き継ぐ（フィルフォワード）。
 * 返り値は ym → { net, byType }
 */
export async function getAssetSeries() {
  const r = await rows(sql`
    SELECT asset_name, asset_type, (year * 100 + month) AS ym, closing_balance
    FROM asset_snapshots ORDER BY ym
  `);
  if (r.length === 0) return new Map<number, { net: number; byType: Record<string, number> }>();

  const first = Number(r[0].ym);
  const last = Number(r[r.length - 1].ym);
  const latest = new Map<string, { type: string; balance: number }>();
  const series = new Map<number, { net: number; byType: Record<string, number> }>();

  let i = 0;
  for (let y = Math.floor(first / 100), m = first % 100; ymKey(y, m) <= last; m === 12 ? (y++, (m = 1)) : m++) {
    const key = ymKey(y, m);
    while (i < r.length && Number(r[i].ym) === key) {
      latest.set(String(r[i].asset_name), { type: String(r[i].asset_type), balance: Number(r[i].closing_balance) });
      i++;
    }
    const byType: Record<string, number> = {};
    let net = 0;
    latest.forEach(({ type, balance }) => {
      byType[type] = (byType[type] ?? 0) + balance;
      net += balance;
    });
    series.set(key, { net, byType });
  }
  return series;
}

// ─────────────────────────────────────────────────────────────────────────────
// 投資の運用損益
// 当月の運用損益 = 当月末評価額 − 前月末評価額 − 当月の拠出額
// （前月の評価額が未登録の月は算出しない）
// ─────────────────────────────────────────────────────────────────────────────

export async function getInvestmentGainByMonth() {
  const assetNames = sql.join(Object.values(PRODUCT_TO_ASSET).map((a) => sql`${a}`), sql`, `);
  const [vals, contribs] = await Promise.all([
    rows(sql`SELECT product_name, (year * 100 + month) AS ym, market_value FROM investment_valuations`),
    rows(sql`
      SELECT asset_name, (year * 100 + month) AS ym, sum(income_amount) AS amount FROM transactions
      WHERE category = '振替' AND asset_name IN (${assetNames}) AND income_amount > 0
      GROUP BY asset_name, ym
    `),
  ]);

  const value = new Map<string, number>();
  vals.forEach((v) => value.set(`${v.product_name}:${v.ym}`, Number(v.market_value)));
  const contrib = new Map<string, number>();
  contribs.forEach((c) => contrib.set(`${c.asset_name}:${c.ym}`, Number(c.amount)));

  const gains = new Map<number, number>();
  vals.forEach((v) => {
    const ym = Number(v.ym);
    const p = prevMonth(Math.floor(ym / 100), ym % 100);
    const prevVal = value.get(`${v.product_name}:${ymKey(p.year, p.month)}`);
    if (prevVal === undefined) return;
    const asset = PRODUCT_TO_ASSET[String(v.product_name)];
    if (!asset) return;
    const gain = Number(v.market_value) - prevVal - (contrib.get(`${asset}:${ym}`) ?? 0);
    gains.set(ym, (gains.get(ym) ?? 0) + gain);
  });
  return gains;
}

// ─────────────────────────────────────────────────────────────────────────────
// 支出分析
// ─────────────────────────────────────────────────────────────────────────────

/** 年・月・カテゴリ別の消費支出（貯蓄を除く） */
export async function getConsumptionByMonthCategory(fromYear: number) {
  const r = await rows(sql`
    SELECT year, month, category, sum(expense_amount) AS amount FROM transactions
    WHERE ${CONSUMPTION_WHERE} AND year >= ${fromYear}
    GROUP BY year, month, category
  `);
  return r.map((x) => ({
    year: Number(x.year),
    month: Number(x.month),
    category: String(x.category),
    amount: Number(x.amount ?? 0),
  }));
}

/** 各年の指定月、1日〜day 日までの消費支出（カテゴリ別） */
export async function getConsumptionMonthToDay(fromYear: number, month: number, day: number) {
  const r = await rows(sql`
    SELECT year, category, sum(expense_amount) AS amount FROM transactions
    WHERE ${CONSUMPTION_WHERE} AND year >= ${fromYear} AND month = ${month}
      AND extract(day FROM date) <= ${day}
    GROUP BY year, category
  `);
  return r.map((x) => ({ year: Number(x.year), category: String(x.category), amount: Number(x.amount ?? 0) }));
}

export type TxItem = { date: string; category: string; itemName: string; amount: number };

/** 消費支出の明細（金額の大きい順） */
export async function getConsumptionTransactions(opts: {
  fromYm: number;
  toYm: number;
  categories?: string[];
  limitPerCategory?: number;
  limit?: number;
}): Promise<TxItem[]> {
  const catFilter =
    opts.categories && opts.categories.length > 0
      ? sql`AND category IN (${sql.join(opts.categories.map((c) => sql`${c}`), sql`, `)})`
      : sql``;
  const base = sql`
    SELECT date::text AS date, category, coalesce(item_name, '') AS item_name, expense_amount AS amount,
      row_number() OVER (PARTITION BY category ORDER BY expense_amount DESC) AS rn
    FROM transactions
    WHERE ${CONSUMPTION_WHERE} AND expense_amount > 0
      AND (year * 100 + month) BETWEEN ${opts.fromYm} AND ${opts.toYm} ${catFilter}
  `;
  const perCat = opts.limitPerCategory ? sql`WHERE rn <= ${opts.limitPerCategory}` : sql``;
  const limit = opts.limit ? sql`LIMIT ${opts.limit}` : sql``;
  const r = await rows(sql`SELECT * FROM (${base}) t ${perCat} ORDER BY category, amount DESC ${limit}`);
  return r.map((x) => ({
    date: String(x.date),
    category: String(x.category),
    itemName: String(x.item_name),
    amount: Number(x.amount),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 特別経費B（賞与の資金繰り）
// ─────────────────────────────────────────────────────────────────────────────

/** この額以上を配分した月を「賞与の積み増し」とみなす */
const BONUS_THRESHOLD = 150000;

export async function getBonusLedger() {
  const [budgetRows, actualRows] = await Promise.all([
    rows(sql`
      SELECT year, month, allocation, carryover, total_budget FROM budgets
      WHERE category_name = ${BONUS_CATEGORY} ORDER BY year, month
    `),
    rows(sql`
      SELECT year, month, sum(expense_amount) AS actual FROM transactions
      WHERE ${EXPENSE_WHERE} AND category = ${BONUS_CATEGORY}
      GROUP BY year, month
    `),
  ]);
  const actual = new Map(actualRows.map((a) => [ymKey(Number(a.year), Number(a.month)), Number(a.actual ?? 0)]));
  return budgetRows.map((b) => {
    const year = Number(b.year);
    const month = Number(b.month);
    const ym = ymKey(year, month);
    const totalBudget = Number(b.total_budget);
    const spent = actual.get(ym) ?? 0;
    const allocation = Number(b.allocation);
    return {
      year,
      month,
      ym,
      allocation,
      totalBudget,
      spent,
      balanceEnd: totalBudget - spent,
      isBonus: allocation >= BONUS_THRESHOLD,
    };
  });
}
