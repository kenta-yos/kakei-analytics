/** GET /api/analysis/upcoming → 過去の実績から拾った、年に数回の大きな支出の見通し */
import { NextResponse } from "next/server";
import { getUpcomingData } from "@/lib/analysis";

export async function GET() {
  try {
    return NextResponse.json({ data: await getUpcomingData() });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
