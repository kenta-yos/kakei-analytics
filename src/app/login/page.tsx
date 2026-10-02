"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError("パスワードが違います");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <h1 className="mb-2 text-center text-2xl font-bold">くらしの決算</h1>
        <p className="lbl mb-8 text-center">パスワードを入力してください</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="password" className="sr-only">
            パスワード
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            autoFocus
            className="h-12 w-full rounded-xl border border-field bg-card px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent"
          />
          {error && <p className="text-sm text-over">{error}</p>}
          <button type="submit" disabled={loading || !password} className="btn-primary w-full">
            {loading ? "確認中…" : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
