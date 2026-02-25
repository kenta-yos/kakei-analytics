import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 円表示 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    minimumFractionDigits: 0,
  }).format(amount);
}

/** 符号付き円表示 */
export function formatCurrencySigned(amount: number): string {
  const sign = amount >= 0 ? "+" : "";
  return sign + formatCurrency(amount);
}

/** YYYY年M月 表示 */
export function formatYearMonth(year: number, month: number): string {
  return `${year}年${month}月`;
}

/** 月の英語短縮名 */
export const MONTH_NAMES = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

/** カテゴリ別カラーマップ（動的に拡張される） */
const CATEGORY_COLORS: Record<string, string> = {
  "食費": "#f97316",
  "交通費": "#3b82f6",
  "交際費・贅沢費": "#a855f7",
  "娯楽費": "#ec4899",
  "研究": "#14b8a6",
  "特別経費B": "#ef4444",
  "特別経費S": "#f43f5e",
  "生活消耗品費": "#84cc16",
  "医療費": "#06b6d4",
  "通信費": "#6366f1",
  "美容費": "#e879f9",
  "ファッション": "#fb923c",
  "カフェ": "#78716c",
  "旅行・帰省": "#0ea5e9",
  "家賃・光熱費": "#d97706",
  "会社立替": "#9ca3af",
  "同棲費": "#f0abfc",
  "必要経費": "#64748b",
  "その他": "#94a3b8",
};

const PALETTE = [
  "#f97316", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6",
  "#ef4444", "#84cc16", "#06b6d4", "#6366f1", "#e879f9",
  "#fb923c", "#78716c", "#0ea5e9", "#d97706", "#9ca3af",
];

let colorIdx = 0;
export function getCategoryColor(category: string): string {
  if (!CATEGORY_COLORS[category]) {
    CATEGORY_COLORS[category] = PALETTE[colorIdx % PALETTE.length];
    colorIdx++;
  }
  return CATEGORY_COLORS[category];
}
