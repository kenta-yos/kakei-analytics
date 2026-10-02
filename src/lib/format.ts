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
