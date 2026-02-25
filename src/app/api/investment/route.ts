/**
 * 投資管理 API
 * GET  /api/investment?year=2026&month=2   → 当月の評価額・コスト・損益
 * GET  /api/investment?history=true        → 全期間の評価額履歴
 * POST /api/investment                     → 評価額を保存し asset_snapshots も更新
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { investmentValuations, assetSnapshots, transactions } from "@/lib/schema";
import { and, eq, lte, sql, desc } from "drizzle-orm";

// 商品名 → asset_snapshots の asset_name マッピング
const PRODUCT_TO_ASSET: Record<string, string> = {
  "iDeCo": "iDeCo",
  "SBI投資信託": "投資信託/SBI",
};

const PRODUCTS = ["iDeCo", "SBI投資信託"] as const;

/** 商品の累計投資コスト（振替の income_amount 合計） */
async function getCostBasis(productName: string, uptoYear?: number, uptoMonth?: number) {
  const assetName = PRODUCT_TO_ASSET[productName];
  if (!assetName) return 0;

  const conditions = [
    eq(transactions.type, "振替"),
    eq(transactions.assetName, assetName),
  ];
  if (uptoYear && uptoMonth) {
    conditions.push(
      sql`(year * 100 + month) <= ${uptoYear * 100 + uptoMonth}`
    );
  }

  const rows = await db
    .select({ total: sql<number>`sum(income_amount)` })
    .from(transactions)
    .where(and(...conditions));

  return Number(rows[0]?.total ?? 0);
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const isHistory = searchParams.get("history") === "true";
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!) : null;
  const month = searchParams.get("month") ? parseInt(searchParams.get("month")!) : null;

  try {
    if (isHistory) {
      // 全履歴: 評価額 + コスト（各月時点）
      const rows = await db
        .select()
        .from(investmentValuations)
        .orderBy(investmentValuations.year, investmentValuations.month, investmentValuations.productName);

      // 月ごとに集約
      const monthMap = new Map<string, Record<string, { marketValue: number; costBasis: number }>>();
      for (const r of rows) {
        const key = `${r.year}-${String(r.month).padStart(2, "0")}`;
        if (!monthMap.has(key)) monthMap.set(key, {});
        const cost = await getCostBasis(r.productName, r.year, r.month);
        monthMap.get(key)![r.productName] = {
          marketValue: r.marketValue,
          costBasis: cost,
        };
      }

      const history = Array.from(monthMap.entries())
        .sort()
        .map(([key, products]) => {
          const [y, m] = key.split("-").map(Number);
          const totalMarket = Object.values(products).reduce((s, p) => s + p.marketValue, 0);
          const totalCost = Object.values(products).reduce((s, p) => s + p.costBasis, 0);
          return { year: y, month: m, label: key, products, totalMarket, totalCost, totalGain: totalMarket - totalCost };
        });

      return NextResponse.json({ data: history });
    }

    // 当月の状況
    const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? (now.getMonth() + 1);

    const valuations = await db
      .select()
      .from(investmentValuations)
      .where(
        and(
          eq(investmentValuations.year, targetYear),
          eq(investmentValuations.month, targetMonth)
        )
      );

    // 前回登録値（直近）
    const latestRows = await db
      .select()
      .from(investmentValuations)
      .where(
        sql`(year * 100 + month) <= ${targetYear * 100 + targetMonth}`
      )
      .orderBy(desc(investmentValuations.year), desc(investmentValuations.month), investmentValuations.productName);

    const latestMap: Record<string, number> = {};
    for (const r of latestRows) {
      if (!latestMap[r.productName]) latestMap[r.productName] = r.marketValue;
    }

    const products = await Promise.all(
      PRODUCTS.map(async (name) => {
        const v = valuations.find((r) => r.productName === name);
        const cost = await getCostBasis(name, targetYear, targetMonth);
        const market = v?.marketValue ?? latestMap[name] ?? 0;
        return {
          productName: name,
          marketValue: market,
          costBasis: cost,
          unrealizedGain: market - cost,
          gainRate: cost > 0 ? Math.round(((market - cost) / cost) * 1000) / 10 : 0,
          hasRecord: !!v,
        };
      })
    );

    return NextResponse.json({ data: { year: targetYear, month: targetMonth, products } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, month, valuations: vals } = body as {
      year: number;
      month: number;
      valuations: { productName: string; marketValue: number }[];
    };

    for (const v of vals) {
      const assetName = PRODUCT_TO_ASSET[v.productName];
      if (!assetName) continue;

      // investment_valuations を upsert
      await db
        .insert(investmentValuations)
        .values({ year, month, productName: v.productName, marketValue: v.marketValue })
        .onConflictDoUpdate({
          target: [investmentValuations.year, investmentValuations.month, investmentValuations.productName],
          set: { marketValue: v.marketValue, updatedAt: new Date() },
        });

      // asset_snapshots の closing_balance を更新（当月分）
      // opening_balance は前月の closing_balance から取得
      const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
      const prevSnap = await db
        .select({ closing: assetSnapshots.closingBalance })
        .from(assetSnapshots)
        .where(
          and(
            eq(assetSnapshots.assetName, assetName),
            eq(assetSnapshots.year, prevMonth.y),
            eq(assetSnapshots.month, prevMonth.m)
          )
        );
      const openingBalance = prevSnap[0]?.closing ?? 0;

      // 既存スナップショットを探す
      const existing = await db
        .select({ id: assetSnapshots.id })
        .from(assetSnapshots)
        .where(
          and(
            eq(assetSnapshots.assetName, assetName),
            eq(assetSnapshots.year, year),
            eq(assetSnapshots.month, month)
          )
        );

      if (existing.length > 0) {
        await db
          .update(assetSnapshots)
          .set({ closingBalance: v.marketValue, openingBalance, updatedAt: new Date() })
          .where(eq(assetSnapshots.id, existing[0].id));
      } else {
        // assetType を推定（既存レコードから）
        const prevType = await db
          .select({ assetType: assetSnapshots.assetType })
          .from(assetSnapshots)
          .where(eq(assetSnapshots.assetName, assetName))
          .limit(1);
        await db.insert(assetSnapshots).values({
          assetName,
          year,
          month,
          openingBalance,
          closingBalance: v.marketValue,
          assetType: prevType[0]?.assetType ?? "investment",
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
}
