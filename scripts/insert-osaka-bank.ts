import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assetSnapshots } from "../src/lib/schema";

const db = drizzle(neon(process.env.DATABASE_URL as string));

async function main() {
  await db.insert(assetSnapshots).values({
    assetName: "大阪商工信用金庫",
    year: 2016,
    month: 10,
    openingBalance: 0,
    closingBalance: 15280,
    assetType: "bank",
  }).onConflictDoUpdate({
    target: [assetSnapshots.assetName, assetSnapshots.year, assetSnapshots.month],
    set: { closingBalance: 15280, assetType: "bank" },
  });
  console.log("大阪商工信用金庫 2016/10 残高 15,280 を挿入しました");
}

main().catch(console.error);
