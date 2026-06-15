import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "kakei_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30日

export function middleware(req: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;

  // 環境変数未設定ならスキップ（ローカル開発用）
  if (!password) return NextResponse.next();

  // Cookie認証チェック
  const authCookie = req.cookies.get(COOKIE_NAME);
  if (authCookie?.value === password) return NextResponse.next();

  // /login ページはスキップ
  if (req.nextUrl.pathname === "/login") return NextResponse.next();

  // API: パスワード認証
  if (req.nextUrl.pathname === "/api/auth") {
    return NextResponse.next();
  }

  // 未認証 → ログインページへリダイレクト
  const loginUrl = new URL("/login", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon\\.png|apple-icon\\.png|favicon\\.ico|manifest\\.webmanifest).*)",
  ],
};
