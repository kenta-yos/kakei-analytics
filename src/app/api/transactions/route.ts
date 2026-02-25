import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/schema";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;
  const category = searchParams.get("category");
  const type = searchParams.get("type");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const offset = (page - 1) * limit;

  try {
    const conditions = [];
    if (year) conditions.push(eq(transactions.year, year));
    if (month) conditions.push(eq(transactions.month, month));
    if (category) conditions.push(eq(transactions.category, category));
    if (type) conditions.push(eq(transactions.type, type));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(transactions)
        .where(where)
        .orderBy(desc(transactions.date), asc(transactions.id))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(transactions)
        .where(where),
    ]);

    return NextResponse.json({
      data: rows,
      total: Number(countResult[0]?.count ?? 0),
      page,
      limit,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取引の取得に失敗しました" }, { status: 500 });
  }
}
