/**
 * GET /api/export?view=pace|why|bonus|upcoming&prompt=1&aggregate=1&related=1&all=0
 *   pace: &years=2021,2022  why: &year=2026&month=9
 * 「AIに渡す」用の Markdown を返す
 */
import { NextRequest, NextResponse } from "next/server";
import { buildExport, type ExportView } from "@/lib/export";

const VIEWS: ExportView[] = ["pace", "why", "bonus", "upcoming"];

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const view = sp.get("view") as ExportView;
    if (!VIEWS.includes(view)) return NextResponse.json({ error: "view が不正です" }, { status: 400 });
    const flag = (k: string) => sp.get(k) === "1";
    const result = await buildExport(view, {
      prompt: flag("prompt"),
      aggregate: flag("aggregate"),
      related: flag("related"),
      all: flag("all"),
      years: sp.get("years")?.split(",").map(Number).filter(Boolean),
      year: sp.get("year") ? Number(sp.get("year")) : undefined,
      month: sp.get("month") ? Number(sp.get("month")) : undefined,
    });
    return NextResponse.json({ data: result });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }
}
