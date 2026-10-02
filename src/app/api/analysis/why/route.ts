/** GET /api/analysis/why?year=2026&month=9 → 指定月の支出を前月・例年同月と比べる */
import { NextRequest, NextResponse } from "next/server";
import { getWhyData } from "@/lib/analysis";
import { getLatestData } from "@/lib/finance";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const latest = await getLatestData();
    const year = Number(sp.get("year") ?? latest?.year);
    const month = Number(sp.get("month") ?? latest?.month);
    return NextResponse.json({ data: { ...(await getWhyData(year, month)), latestDate: latest?.date ?? null } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
