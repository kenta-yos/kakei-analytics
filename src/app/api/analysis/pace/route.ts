/** GET /api/analysis/pace → 年別・月別・カテゴリ別の支出（例年比ペース用） */
import { NextResponse } from "next/server";
import { getPaceData } from "@/lib/analysis";

export async function GET() {
  try {
    return NextResponse.json({ data: await getPaceData() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
