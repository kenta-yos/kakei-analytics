/**
 * Gemini API ユーティリティ
 * - 無料枠: 1日 400 リクエスト上限で制御
 * - 使用状況は gemini_usage テーブルで管理
 */
import { db } from "./db";
import { geminiUsage } from "./schema";
import { eq, sql } from "drizzle-orm";

export const GEMINI_DAILY_LIMIT = 400;
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/** 日本時間の今日の日付を YYYY-MM-DD で返す */
function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 今日の利用回数を取得 */
export async function getTodayUsage(): Promise<{ count: number; remaining: number; date: string }> {
  const today = todayJST();
  const rows = await db
    .select({ count: geminiUsage.count })
    .from(geminiUsage)
    .where(eq(geminiUsage.date, today));

  const count = rows[0]?.count ?? 0;
  return { count, remaining: GEMINI_DAILY_LIMIT - count, date: today };
}

/** 利用カウントをインクリメント（原子的に） */
async function incrementUsage(): Promise<number> {
  const today = todayJST();
  const result = await db
    .insert(geminiUsage)
    .values({ date: today, count: 1 })
    .onConflictDoUpdate({
      target: [geminiUsage.date],
      set: {
        count: sql`gemini_usage.count + 1`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: geminiUsage.count });

  return result[0]?.count ?? 1;
}

export type GeminiAnalysisInput = {
  context: string;  // 分析対象のデータサマリー（JSON or テキスト）
  prompt: string;   // ユーザーの質問 / 分析依頼
};

export type GeminiAnalysisResult = {
  success: boolean;
  text?: string;
  error?: string;
  usage?: { count: number; remaining: number };
};

/** Gemini API を呼び出して家計分析を実行 */
export async function analyzeWithGemini(input: GeminiAnalysisInput): Promise<GeminiAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { success: false, error: "GEMINI_API_KEY が設定されていません" };
  }

  // 残回数チェック
  const usage = await getTodayUsage();
  if (usage.remaining <= 0) {
    return {
      success: false,
      error: `本日の利用上限（${GEMINI_DAILY_LIMIT}回）に達しました。明日再度お試しください。`,
      usage,
    };
  }

  const systemPrompt = `あなたは個人の家計管理を支援する財務アナリストです。
以下のデータをもとに、簡潔で実用的な日本語の分析・アドバイスを提供してください。
- 数値は円単位で表示してください
- 箇条書きで整理し、読みやすくしてください
- 改善提案は具体的に、かつ現実的な内容にしてください`;

  const fullPrompt = `${systemPrompt}

## データ
${input.context}

## 依頼
${input.prompt}`;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return { success: false, error: `API エラー: ${res.status} - ${errBody}` };
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      return { success: false, error: "Gemini から空のレスポンスが返されました" };
    }

    // カウント更新
    const newCount = await incrementUsage();
    const newUsage = { count: newCount, remaining: GEMINI_DAILY_LIMIT - newCount };

    return { success: true, text, usage: newUsage };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "通信エラー",
    };
  }
}
