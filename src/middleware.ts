import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;

  // 環境変数未設定ならスキップ（ローカル開発用）
  if (!password) return NextResponse.next();

  const auth = req.headers.get("authorization");

  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [, pwd] = decoded.split(":");
      if (pwd === password) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="kakei-analytics"',
    },
  });
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|icon\\.png|apple-icon\\.png|favicon\\.ico|manifest\\.webmanifest).*)",
  ],
};
