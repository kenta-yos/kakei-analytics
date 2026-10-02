/**
 * FIRE 試算（画面で使うので DB に依存させない）
 *
 * 必要な資産: リタイアした時点から「何歳まで」の各月、(月の支出 − 年金以外の月収入 − 年金) を取り崩し、
 *            残りは実質利回りで運用し続けて、ちょうど使い切る額。年金は受給開始年齢から差し引く。
 * 資産の推移: 原資（現金・利回りなし）に毎月の追加を足し、原資から投信・iDeCo へ移す。
 *            運用中の資産には実質利回り（利回り − インフレ率）を乗せる。
 */

export type Plan = {
  annualExpense: number;
  fundContribution: number; // 原資 → 投信（月）
  ideco: number; // 原資 → iDeCo（月）
  poolInflow: number; // 原資への追加（月）
  returnRate: number; // %
  inflation: number; // %
  endAge: number; // 何歳まで暮らせればいいか
  retirementIncome: number; // リタイア後の年金以外の月収入
  pensionMonthly: number; // 年金の月額
  pensionStartAge: number; // 年金の受給開始年齢
  targetRetireAge: number; // 逆算: 何歳でリタイアしたいか
};

const realMonthlyRate = (p: Plan) => (p.returnRate - p.inflation) / 100 / 12;

/** 年齢（月単位）でリタイアしたときに必要な資産。各月の取り崩しを今の価値に割り引いて足し合わせる */
export function requiredAt(ageMonths: number, p: Plan) {
  const end = p.endAge * 12;
  const r = realMonthlyRate(p);
  const base = p.annualExpense / 12 - p.retirementIncome;
  let total = 0;
  let discount = 1;
  for (let m = ageMonths; m < end; m++) {
    const net = base - (m >= p.pensionStartAge * 12 ? p.pensionMonthly : 0);
    if (net > 0) total += net * discount;
    discount /= 1 + r;
  }
  return total;
}

type State = { pool: number; invested: number };

function step(s: State, p: Plan, inflow: number): State {
  let pool = s.pool + inflow;
  // 原資から移す額: 今の積立（投信＋iDeCo）。追加の方が多ければ追加分は全部運用に回す
  const move = Math.min(Math.max(p.fundContribution + p.ideco, inflow), Math.max(0, pool));
  pool -= move;
  return { pool, invested: s.invested * (1 + realMonthlyRate(p)) + move };
}

/** 順算: 今のペースで、何か月後にリタイアできるか */
export function whenCanRetire(start: State, ageMonths: number, p: Plan) {
  let s = start;
  for (let t = 0; ageMonths + t < p.endAge * 12; t++) {
    const need = requiredAt(ageMonths + t, p);
    if (s.pool + s.invested >= need) return { months: t, ageMonths: ageMonths + t, required: need, assets: s.pool + s.invested };
    s = step(s, p, p.poolInflow);
  }
  return null;
}

function assetsAfter(start: State, months: number, p: Plan, inflow: number) {
  let s = start;
  for (let t = 0; t < months; t++) s = step(s, p, inflow);
  return s.pool + s.invested;
}

/** 逆算: 目標の年齢でリタイアするには、原資へ毎月いくら追加すればいいか */
export function neededSaving(start: State, ageMonths: number, p: Plan) {
  const months = p.targetRetireAge * 12 - ageMonths;
  if (months <= 0 || p.targetRetireAge >= p.endAge) return null;
  const required = requiredAt(p.targetRetireAge * 12, p);
  const projected = assetsAfter(start, months, p, p.poolInflow);
  let lo = 0;
  let hi = 10_000_000;
  if (assetsAfter(start, months, p, 0) >= required) {
    hi = 0;
  } else {
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (assetsAfter(start, months, p, mid) >= required) hi = mid;
      else lo = mid;
    }
  }
  return { months, required, projected, needed: Math.ceil(hi / 100) * 100 };
}

/** 原資が尽きて、積立を満額続けられなくなるまでの月数 */
export function monthsUntilPoolEmpty(pool: number, p: Plan) {
  const want = p.fundContribution + p.ideco;
  if (want <= p.poolInflow) return null;
  let c = pool;
  for (let i = 1; i <= 12 * 60; i++) {
    c += p.poolInflow - want;
    if (c < want - p.poolInflow) return i;
  }
  return null;
}

/** 誕生日（YYYY-MM-DD）から、今日時点の年齢を月単位で */
export function ageInMonths(birthDate: string, today: { year: number; month: number; day: number }) {
  const [y, m, d] = birthDate.split("-").map(Number);
  let months = (today.year - y) * 12 + (today.month - m);
  if (today.day < d) months--;
  return months;
}
