/**
 * 標準予算 API
 * GET  /api/standard-budget  → 標準予算一覧 + 基準収入
 * POST /api/standard-budget  → 標準予算を一括保存
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { standardBudgets, standardBudgetSettings } from "@/lib/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const [items, settings] = await Promise.all([
      db.select().from(standardBudgets).orderBy(standardBudgets.categoryName),
      db.select().from(standardBudgetSettings).where(eq(standardBudgetSettings.id, 1)),
    ]);

    return NextResponse.json({
      data: {
        referenceIncome: settings[0]?.referenceIncome ?? 0,
        items,
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
    const { referenceIncome, items } = body as {
      referenceIncome: number;
      items: { categoryName: string; allocation: number; notes?: string }[];
    };

    // 基準収入を保存（id=1 固定）
    await db
      .insert(standardBudgetSettings)
      .values({ id: 1, referenceIncome })
      .onConflictDoUpdate({
        target: [standardBudgetSettings.id],
        set: { referenceIncome, updatedAt: new Date() },
      });

    // カテゴリ別標準予算を upsert
    for (const item of items) {
      await db
        .insert(standardBudgets)
        .values({
          categoryName: item.categoryName,
          allocation: item.allocation,
          notes: item.notes ?? null,
        })
        .onConflictDoUpdate({
          target: [standardBudgets.categoryName],
          set: {
            allocation: item.allocation,
            notes: item.notes ?? null,
            updatedAt: new Date(),
          },
        });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
