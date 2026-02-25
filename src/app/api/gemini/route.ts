import { NextRequest, NextResponse } from "next/server";
import { analyzeWithGemini, getTodayUsage } from "@/lib/gemini";

/** GET /api/gemini → 今日の利用状況を返す */
export async function GET() {
  const usage = await getTodayUsage();
  return NextResponse.json(usage);
}

/** POST /api/gemini → AI 分析を実行 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { context, prompt } = body as { context: string; prompt: string };

    if (!context || !prompt) {
      return NextResponse.json({ error: "context と prompt が必要です" }, { status: 400 });
    }

    const result = await analyzeWithGemini({ context, prompt });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, usage: result.usage },
        { status: result.usage?.remaining === 0 ? 429 : 500 }
      );
    }

    return NextResponse.json({ text: result.text, usage: result.usage });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "エラーが発生しました" },
      { status: 500 }
    );
  }
}
