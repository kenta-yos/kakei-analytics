/** 予算カテゴリの表示順（旧 Excel の並びを踏襲） */
const CATEGORY_ORDER = [
  "食費", "研究", "カフェ", "娯楽費", "交際費・贅沢費", "交通費", "美容費", "生活消耗品費",
  "医療費", "家賃・光熱費", "通信費", "特別経費S", "特別経費B", "ファッション", "旅行・帰省",
  "同棲費", "会社立替", "貯蓄", "貯蓄（投信）",
];

/** 貯蓄・積立扱いのカテゴリ（消費ではないので分析から除く） */
export const SAVINGS_CATEGORIES = new Set(["貯蓄", "貯蓄（投信）"]);

/** 賞与を財源にする特別経費 */
export const BONUS_CATEGORY = "特別経費B";

export function sortCategories(cats: string[]): string[] {
  return [...cats].sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "ja");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}
