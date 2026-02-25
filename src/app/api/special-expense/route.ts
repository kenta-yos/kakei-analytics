/**
 * 特別経費B API
 * GET  /api/special-expense?year=2026&month=2  → 予測データ + 実績（transactions 集計）
 * POST /api/special-expense                     → 予測アイテムを一括保存（DELETE + INSERT）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { specialExpensesB, transactions } from "@/lib/schema";
import { and, eq, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get("year") ?? "");
  const month = parseInt(searchParams.get("month") ?? "");

  if (!year || !month) {
    return NextResponse.json({ error: "year と month が必要です" }, { status: 400 });
  }

  try {
    // 予測データ
    const planned = await db
      .select()
      .from(specialExpensesB)
      .where(
        and(
          eq(specialExpensesB.year, year),
          eq(specialExpensesB.month, month)
        )
      )
      .orderBy(specialExpensesB.id);

    // 実績: transactions から category='特別経費B' を集計
    // item_name でグループ化（nullの場合は日付を表示）
    const actuals = await db
      .select({
        itemName: transactions.itemName,
        date: transactions.date,
        total: sql<number>`sum(expense_amount)`,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.year, year),
          eq(transactions.month, month),
          eq(transactions.category, "特別経費B"),
          eq(transactions.excludeFromPl, false)
        )
      )
      .groupBy(transactions.itemName, transactions.date)
      .orderBy(sql`sum(expense_amount) desc`);

    // item_name でまとめ直し（item_name が同じものは合算）
    const actualMap = new Map<string, { label: string; total: number; count: number }>();
    for (const r of actuals) {
      const key = r.itemName && r.itemName.trim() !== "" ? r.itemName : `(${r.date})`;
      if (actualMap.has(key)) {
        actualMap.get(key)!.total += Number(r.total ?? 0);
        actualMap.get(key)!.count += Number(r.count ?? 0);
      } else {
        actualMap.set(key, {
          label: key,
          total: Number(r.total ?? 0),
          count: Number(r.count ?? 0),
        });
      }
    }

    const actualList = Array.from(actualMap.values()).sort((a, b) => b.total - a.total);

    // 年間サマリー: 各月の予測合計・実績合計
    const yearPlanned = await db
      .select({
        month: specialExpensesB.month,
        total: sql<number>`sum(planned_amount)`,
      })
      .from(specialExpensesB)
      .where(eq(specialExpensesB.year, year))
      .groupBy(specialExpensesB.month)
      .orderBy(specialExpensesB.month);

    const yearActuals = await db
      .select({
        month: transactions.month,
        total: sql<number>`sum(expense_amount)`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.year, year),
          eq(transactions.category, "特別経費B"),
          eq(transactions.excludeFromPl, false)
        )
      )
      .groupBy(transactions.month)
      .orderBy(transactions.month);

    const yearSummary = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const p = yearPlanned.find((r) => r.month === m);
      const a = yearActuals.find((r) => r.month === m);
      return {
        month: m,
        plannedTotal: Number(p?.total ?? 0),
        actualTotal: Number(a?.total ?? 0),
      };
    });

    return NextResponse.json({
      data: {
        planned,
        actuals: actualList,
        yearSummary,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, month, items } = body as {
      year: number;
      month: number;
      items: { itemName: string; plannedAmount: number; memo?: string }[];
    };

    if (!year || !month) {
      return NextResponse.json({ error: "year と month が必要です" }, { status: 400 });
    }

    // その月のデータを DELETE → INSERT で置き換え
    await db
      .delete(specialExpensesB)
      .where(
        and(
          eq(specialExpensesB.year, year),
          eq(specialExpensesB.month, month)
        )
      );

    if (items.length > 0) {
      await db.insert(specialExpensesB).values(
        items.map((item) => ({
          year,
          month,
          itemName: item.itemName,
          plannedAmount: item.plannedAmount,
          memo: item.memo ?? null,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
