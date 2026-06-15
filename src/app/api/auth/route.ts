import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "kakei_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30日

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.BASIC_AUTH_PASSWORD;

  if (!correct || password !== correct) {
    return NextResponse.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(COOKIE_NAME, password, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
