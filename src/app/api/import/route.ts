import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions, assetSnapshots } from "@/lib/schema";
import {
  parseCombinedReport,
  parseAssetReport,
  aggregateAssetSnapshots,
  extractInvestmentTransfers,
} from "@/lib/csv-parser";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";

export const maxDuration = 60; // Vercel Pro: 60s

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const combinedFile = formData.get("combined") as File | null;
    const assetFile = formData.get("asset") as File | null;

    if (!combinedFile && !assetFile) {
      return NextResponse.json({ error: "ファイルが指定されていません" }, { status: 400 });
    }

    let txInserted = 0;
    let txSkipped = 0;
    let assetInserted = 0;

    // ── 収支合算レポートの取り込み ──────────────────────────────────────────
    if (combinedFile) {
      const text = await combinedFile.text();
      const parsed = parseCombinedReport(text, 2019);

      if (parsed.length === 0) {
        return NextResponse.json({ error: "取引データが見つかりませんでした" }, { status: 400 });
      }

      // CSV に含まれる年月を特定し、対象月の既存データを削除（冪等インポート）
      // 同じCSVを何度インポートしても重複しない
      const yearMonths = [...new Set(parsed.map((t) => `${t.year}-${t.month}`))];
      for (const ym of yearMonths) {
        const [y, m] = ym.split("-").map(Number);
        await db.delete(transactions)
          .where(and(eq(transactions.year, y), eq(transactions.month, m)));
      }

      // バッチで一括INSERT
      const BATCH = 500;
      for (let i = 0; i < parsed.length; i += BATCH) {
        const batch = parsed.slice(i, i + BATCH);
        const values = batch.map((t) => ({
          date: t.date,
          year: t.year,
          month: t.month,
          type: t.type,
          category: t.category,
          itemName: t.itemName || null,
          amount: t.amount,
          expenseAmount: t.expenseAmount,
          incomeAmount: t.incomeAmount,
          assetName: t.assetName || null,
          tag: t.tag || null,
          memo: t.memo || null,
          excludeFromPl: t.excludeFromPl,
        }));

        await db.insert(transactions).values(values);
        txInserted += batch.length;
      }
    }

    // ── 資産別レポートの取り込み ─────────────────────────────────────────────
    if (assetFile) {
      const text = await assetFile.text();
      const assetTxList = parseAssetReport(text, 2019);
      const snapshots = aggregateAssetSnapshots(assetTxList);

      const BATCH = 200;
      for (let i = 0; i < snapshots.length; i += BATCH) {
        const batch = snapshots.slice(i, i + BATCH);
        await db
          .insert(assetSnapshots)
          .values(batch)
          .onConflictDoUpdate({
            target: [assetSnapshots.assetName, assetSnapshots.year, assetSnapshots.month],
            set: {
              closingBalance: sql`excluded.closing_balance`,
              openingBalance: sql`excluded.opening_balance`,
              assetType: sql`excluded.asset_type`,
              updatedAt: sql`now()`,
            },
          });
        assetInserted += batch.length;
      }

      // 資産別レポートから投資振替（iDeCo・投資信託）を抽出してトランザクションに保存
      // 収支合算CSVに振替が含まれない旧形式データの累計コスト計算に使用
      const investmentTransfers = extractInvestmentTransfers(text, 2019);

      if (investmentTransfers.length > 0) {
        // 対象年月の既存の合成レコード（__asset_report__）を削除（再インポートに冪等対応）
        const ymSet = [...new Set(investmentTransfers.map((t) => `${t.year}-${t.month}`))];
        for (const ym of ymSet) {
          const [y, m] = ym.split("-").map(Number);
          await db
            .delete(transactions)
            .where(
              and(
                eq(transactions.year, y),
                eq(transactions.month, m),
                eq(transactions.type, "振替"),
                eq(transactions.memo, "__asset_report__")
              )
            );
        }

        // 収支合算CSVに同じ振替が既に存在する場合は重複挿入しない
        let transfersInserted = 0;
        for (const t of investmentTransfers) {
          const existing = await db
            .select({ id: transactions.id })
            .from(transactions)
            .where(
              and(
                eq(transactions.date, t.date),
                eq(transactions.assetName, t.assetName!),
                eq(transactions.incomeAmount, t.incomeAmount),
                eq(transactions.category, "振替"),
                or(isNull(transactions.memo), ne(transactions.memo, "__asset_report__"))
              )
            );

          if (existing.length === 0) {
            await db.insert(transactions).values({
              date: t.date,
              year: t.year,
              month: t.month,
              type: t.type,
              category: t.category,
              itemName: t.itemName || null,
              amount: t.amount,
              expenseAmount: t.expenseAmount,
              incomeAmount: t.incomeAmount,
              assetName: t.assetName || null,
              tag: t.tag || null,
              memo: t.memo || null,
              excludeFromPl: t.excludeFromPl,
            });
            transfersInserted++;
          }
        }

        assetInserted += transfersInserted; // カウントに含める
      }
    }

    return NextResponse.json({
      success: true,
      transactions: { inserted: txInserted, skipped: txSkipped },
      assets: { inserted: assetInserted },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "インポートに失敗しました" },
      { status: 500 }
    );
  }
}
