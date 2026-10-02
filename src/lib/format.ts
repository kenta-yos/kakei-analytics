/** 1234 → "1,234" */
export function num(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

/** 1234 → "¥1,234" / -1234 → "−¥1,234" */
export function yen(n: number): string {
  return (n < 0 ? "−¥" : "¥") + num(Math.abs(n));
}

/** 1234 → "+1,234" / -1234 → "−1,234" */
export function signed(n: number): string {
  if (n === 0) return "±0";
  return (n > 0 ? "+" : "−") + num(Math.abs(n));
}

export function ymLabel(year: number, month: number): string {
  return `${year}年${month}月`;
}

export function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** 年月を比較しやすい整数に（2026年9月 → 202609） */
export function ymKey(year: number, month: number): number {
  return year * 100 + month;
}

/** 日本時間の今日 */
export function todayJst() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 誕生日（YYYY-MM-DD）から、日本時間の今日時点の年齢 */
export function ageOn(birthDate: string, today = todayJst()) {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = today.year - y;
  if (today.month < m || (today.month === m && today.day < d)) age--;
  return age;
}
