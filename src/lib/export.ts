/**
 * 「AIに渡す」用の Markdown を組み立てる。
 * 依頼文・集計・関連する明細・全明細をそれぞれ含めるか選べる。
 */
import { BONUS_CATEGORY } from "@/lib/categories";
import { getConsumptionTransactions, type TxItem } from "@/lib/finance";
import { BIG_THRESHOLD, getBonusData, getPaceData, getUpcomingData, getWhyData } from "@/lib/analysis";
import { paceBand } from "@/lib/pace";
import { ymKey } from "@/lib/format";

export type ExportView = "pace" | "why" | "bonus" | "upcoming";

export type ExportOptions = {
  prompt: boolean;
  aggregate: boolean;
  related: boolean;
  all: boolean;
  /** pace: 比べる年 */
  years?: number[];
  /** why: 対象の年月 */
  year?: number;
  month?: number;
};

const n = (v: number) => Math.round(v).toLocaleString("ja-JP");

function table(header: string[], body: (string | number)[][]) {
  const lines = [
    `| ${header.join(" | ")} |`,
    `|${header.map(() => "---").join("|")}|`,
    ...body.map((r) => `| ${r.map((c) => (typeof c === "number" ? n(c) : c)).join(" | ")} |`),
  ];
  return lines.join("\n");
}

function txTable(txs: TxItem[]) {
  if (txs.length === 0) return "（該当なし）";
  return table(
    ["日付", "カテゴリ", "内容", "金額"],
    [...txs].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, t.category, t.itemName || "—", t.amount])
  );
}

const PREMISE = [
  "## 前提",
  "- 個人の家計簿です。金額の単位は円。",
  "- 毎月、前月の収入を上限に、翌月の予算をカテゴリごとに配分しています。予算の残り（または超過）は翌月に繰り越します。",
  `- 「${BONUS_CATEGORY}」は賞与を財源にした特別経費の枠です。賞与の月に大きく積み増し、毎月の定額配分と合わせて少しずつ使います。`,
  "- 貯蓄・積立のカテゴリは支出の分析から除いています。",
].join("\n");

export async function buildExport(view: ExportView, opt: ExportOptions): Promise<{ title: string; markdown: string }> {
  const parts: string[] = [];
  let title = "";

  if (view === "pace") {
    const pace = await getPaceData();
    if (!pace) return { title: "例年比ペース", markdown: "データがありません" };
    const baseYears = opt.years?.length ? opt.years : pace.years.map((y) => y.year).filter((y) => y < pace.year);
    const { band, currentCum, categories } = paceBand(pace, baseYears);
    title = `例年比ペース（${pace.year}年1〜${pace.upToMonth}月）`;
    const last = currentCum[currentCum.length - 1] ?? 0;
    const b = band[pace.upToMonth - 1];

    if (opt.prompt) {
      parts.push(
        "# 家計の分析をお願いします",
        `## 知りたいこと\n${pace.year}年の支出（1〜${pace.upToMonth}月、${pace.latestDate}時点）が、例年と比べてどれくらい多い／少ないペースか。その要因は何か。生活をどう見直すとよいか、具体的に提案してください。`,
        PREMISE,
        `- 比較対象の年: ${baseYears.join("、")}年`
      );
    }
    if (opt.aggregate) {
      parts.push(
        "## 1〜" + pace.upToMonth + "月の支出累計",
        `今年 ${n(last)} 円 / 例年平均 ${n(b.avg)} 円（幅 ${n(b.min)}〜${n(b.max)} 円）`,
        "## 年別・月別の支出",
        table(
          ["年", ...Array.from({ length: 12 }, (_, i) => `${i + 1}月`)],
          pace.years.filter((y) => y.year === pace.year || baseYears.includes(y.year)).map((y) => [`${y.year}`, ...y.monthly])
        ),
        `## カテゴリ別 1〜${pace.upToMonth}月の累計`,
        table(
          ["カテゴリ", `${pace.year}年`, ...baseYears.map((y) => `${y}年`), "例年平均", "幅からの差"],
          categories
            .sort((a, b2) => b2.current - a.current)
            .map((c) => [
              c.category,
              c.current,
              ...baseYears.map((y) => pace.categories.find((x) => x.category === c.category)?.byYear[y] ?? 0),
              c.avg,
              c.outside === 0 ? "範囲内" : (c.outside > 0 ? "+" : "") + n(c.outside),
            ])
        )
      );
    }
    const outsideCats = categories.filter((c) => c.outside > 0).map((c) => c.category);
    if (opt.related && !opt.all) {
      const txs = await getConsumptionTransactions({
        fromYm: ymKey(pace.year, 1),
        toYm: ymKey(pace.year, pace.upToMonth),
        categories: outsideCats.length ? outsideCats : undefined,
      });
      parts.push(`## 例年の幅を上回ったカテゴリの明細（${pace.year}年）`, outsideCats.length ? txTable(txs) : "（該当なし）");
    }
    if (opt.all) {
      const txs = await getConsumptionTransactions({ fromYm: ymKey(pace.year, 1), toYm: ymKey(pace.year, pace.upToMonth) });
      parts.push(`## ${pace.year}年のすべての明細`, txTable(txs));
    }
  }

  if (view === "why") {
    const year = opt.year!;
    const month = opt.month!;
    const why = await getWhyData(year, month);
    title = `今月の要因（${year}年${month}月）`;
    if (opt.prompt) {
      parts.push(
        "# 家計の分析をお願いします",
        `## 知りたいこと\n${year}年${month}月の支出が、前月や例年の同じ月と比べてなぜ多い（少ない）のか。原因になった支出と、来月以降の見直し案を教えてください。`,
        PREMISE
      );
    }
    if (opt.aggregate) {
      parts.push(
        "## 合計",
        `${month}月 ${n(why.totals.current)} 円 / 前月 ${n(why.totals.prev)} 円 / 例年の${month}月平均 ${n(why.totals.yearAvg)} 円（${why.baseYears.join("、")}年）`,
        "## カテゴリ別",
        table(
          ["カテゴリ", `${month}月`, "前月", `例年${month}月平均`, "前月差", "例年差"],
          why.rows
            .sort((a, b) => b.current - a.current)
            .map((r) => [r.category, r.current, r.prev, r.yearAvg, r.current - r.prev, r.current - r.yearAvg])
        )
      );
    }
    if (opt.related && !opt.all) {
      const up = why.rows.filter((r) => r.current - r.yearAvg > 0 || r.current - r.prev > 0).map((r) => r.category);
      const txs = await getConsumptionTransactions({ fromYm: ymKey(year, month), toYm: ymKey(year, month), categories: up });
      parts.push(`## 増えたカテゴリの明細（${year}年${month}月）`, up.length ? txTable(txs) : "（該当なし）");
    }
    if (opt.all) {
      const p = why.prevMonth;
      const txs = await getConsumptionTransactions({ fromYm: ymKey(p.year, p.month), toYm: ymKey(year, month) });
      parts.push(`## ${p.year}年${p.month}月〜${year}年${month}月のすべての明細`, txTable(txs));
    }
  }

  if (view === "bonus") {
    const bonus = await getBonusData();
    if (!bonus) return { title: BONUS_CATEGORY, markdown: "データがありません" };
    title = `${BONUS_CATEGORY}の資金繰り`;
    if (opt.prompt) {
      parts.push(
        "# 家計の分析をお願いします",
        `## 知りたいこと\n賞与を財源にした「${BONUS_CATEGORY}」を使いすぎていないか。過去の賞与のあとと比べた使うペース、今後の予定から見た残高の見込みを評価し、どうやりくりするとよいか提案してください。`,
        PREMISE
      );
    }
    if (opt.aggregate) {
      parts.push(
        "## いまの状況",
        `- ${bonus.current.year}年${bonus.current.month}月末の残高: ${n(bonus.current.balance)} 円`,
        `- 直近の賞与による積み増し: ${bonus.lastBonus.year}年${bonus.lastBonus.month}月 ${n(bonus.lastBonus.allocation)} 円`,
        bonus.usage
          ? `- 積み増しから${bonus.monthsSince}か月で ${n(bonus.usage.used)} 円を使用（積み増した ${n(bonus.usage.bonus)} 円の ${Math.round(bonus.usage.rate * 100)}%）`
          : "",
        "## 過去の賞与のあと、同じ期間で使った割合",
        table(
          ["賞与の月", "積み増した額", "使った額", "割合"],
          bonus.pastUsage.map((u) => [`${u.year}年${u.month}月`, u.bonus, u.used, `${Math.round(u.rate * 100)}%`])
        ),
        "## 月ごとの推移（直近24か月）",
        table(
          ["年月", "配分", "使える額", "使った額", "月末残高"],
          bonus.ledger.map((l) => [`${l.year}年${l.month}月`, l.allocation, l.totalBudget, l.spent, l.balanceEnd])
        ),
        "## 今後の予定と残高の見込み",
        table(
          ["年月", "配分", "予定の支出", "月末残高（見込み）"],
          bonus.projection.map((p) => [`${p.year}年${p.month}月`, p.allocation, p.planned, p.balance])
        ),
        table(["年月", "予定", "金額"], bonus.plans.map((p) => [`${p.year}年${p.month}月`, p.itemName, p.amount]))
      );
    }
    if (opt.related || opt.all) {
      const from = opt.all ? ymKey(bonus.current.year - 2, bonus.current.month) : ymKey(bonus.lastBonus.year, bonus.lastBonus.month);
      const txs = await getConsumptionTransactions({
        fromYm: from,
        toYm: ymKey(bonus.current.year, bonus.current.month),
        categories: [BONUS_CATEGORY],
      });
      parts.push(`## ${BONUS_CATEGORY}の明細`, txTable(txs));
    }
  }

  if (view === "upcoming") {
    const up = await getUpcomingData();
    if (!up) return { title: "大きな支出の見通し", markdown: "データがありません" };
    title = "大きな支出の見通し";
    if (opt.prompt) {
      parts.push(
        "# 家計の分析をお願いします",
        `## 知りたいこと\n過去の実績から拾った、年に数回だけ発生する大きな支出の一覧です。今後12か月にどれくらいの備えが必要か、見落としていそうな支出や減らせそうな支出はないか教えてください。`,
        PREMISE,
        `- 1回 ${n(BIG_THRESHOLD)} 円以上で、${up.fromYear}年以降に2年以上発生した支出を拾っています。`
      );
    }
    if (opt.aggregate) {
      parts.push(
        "## 今後12か月の見込み（月別）",
        table(["年月", `${BONUS_CATEGORY}`, "通常の予算"], up.forecast.map((f) => [`${f.year}年${f.month}月`, f.bonus, f.normal])),
        "## 拾った支出",
        table(
          ["内容", "カテゴリ", "周期", "よくある月", "推定額", "次回"],
          up.items.map((it) => [
            it.itemName,
            it.category,
            it.cycle,
            it.months.map((m) => `${m}月`).join("・"),
            it.amount,
            it.next ? `${it.next.year}年${it.next.month}月` : "—",
          ])
        )
      );
    }
    if (opt.related && !opt.all) {
      parts.push(
        "## 拾った支出の過去の明細",
        txTable(up.items.flatMap((it) => it.history))
      );
    }
    if (opt.all) {
      const txs = await getConsumptionTransactions({ fromYm: ymKey(up.fromYear, 1), toYm: 999912 });
      parts.push(`## ${up.fromYear}年以降の1回${n(BIG_THRESHOLD)}円以上の明細`, txTable(txs.filter((t) => t.amount >= BIG_THRESHOLD)));
    }
  }

  return { title, markdown: parts.filter(Boolean).join("\n\n") + "\n" };
}
