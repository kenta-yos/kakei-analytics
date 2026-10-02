/** GET /api/analysis/bonus → 特別経費B の残高・使うペース・今後の見込み */
import { NextResponse } from "next/server";
import { getBonusData } from "@/lib/analysis";

export async function GET() {
  try {
    return NextResponse.json({ data: await getBonusData() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
