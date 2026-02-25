/**
 * 資産タイプを修正するスクリプト
 * npx tsx scripts/fix-asset-types.ts
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assetSnapshots } from "../src/lib/schema";
import { eq, sql } from "drizzle-orm";

const db = drizzle(neon(process.env.DATABASE_URL!));

async function main() {
  // 図書カード: credit → other（ギフトカード、負債ではなく資産）
  const r1 = await db
    .update(assetSnapshots)
    .set({ assetType: "other" })
    .where(eq(assetSnapshots.assetName, "図書カード"));
  console.log("図書カード → other");

  // 借入金: other → credit（負債として貸借対照表の負債側に表示）
  const r2 = await db
    .update(assetSnapshots)
    .set({ assetType: "credit" })
    .where(eq(assetSnapshots.assetName, "借入金"));
  console.log("借入金 → credit");

  // 藤田さんテニス未払金: other → credit（負債）
  const r3 = await db
    .update(assetSnapshots)
    .set({ assetType: "credit" })
    .where(eq(assetSnapshots.assetName, "藤田さんテニス未払金"));
  console.log("藤田さんテニス未払金 → credit");

  // 加藤さん料理代: other → credit（負債）
  const r4 = await db
    .update(assetSnapshots)
    .set({ assetType: "credit" })
    .where(eq(assetSnapshots.assetName, "加藤さん料理代"));
  console.log("加藤さん料理代 → credit");

  console.log("完了");
}

main().catch(console.error);
