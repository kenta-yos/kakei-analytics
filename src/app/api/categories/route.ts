/**
 * GET /api/categories?type=expense|income|all&year=2026
 * DBに存在するカテゴリ一覧を返す（セレクトボックス用）
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/schema";
import { eq, and, ne, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const type = searchParams.get("type") ?? "expense"; // expense | income | all
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;

  try {
    const conditions = [];

    if (type === "expense") {
      conditions.push(eq(transactions.type, "支出"));
    } else if (type === "income") {
      conditions.push(eq(transactions.type, "収入"));
    }
    // "all" のときは type 絞り込みなし（振替は除く）
    conditions.push(ne(transactions.type, "振替"));

    if (year) conditions.push(eq(transactions.year, year));

    const rows = await db
      .selectDistinct({ category: transactions.category })
      .from(transactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`count(*) over (partition by category) desc`,
        transactions.category
      );

    // 利用頻度順に並べるため集計も取る
    const countRows = await db
      .select({
        category: transactions.category,
        count: sql<number>`count(*)`,
      })
      .from(transactions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(transactions.category)
      .orderBy(sql`count(*) desc`);

    return NextResponse.json({
      data: countRows.map((r) => ({ category: r.category, count: Number(r.count) })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "カテゴリの取得に失敗しました" }, { status: 500 });
  }
}
