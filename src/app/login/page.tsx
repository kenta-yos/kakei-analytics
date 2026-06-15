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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xs">
        <h1 className="text-2xl font-bold text-white text-center mb-2">家計 Analytics</h1>
        <p className="text-slate-500 text-sm text-center mb-8">パスワードを入力してください</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード"
            autoFocus
            style={{ fontSize: "16px" }}
            className="w-full bg-slate-800 text-white px-4 py-3 rounded-lg border border-slate-700 focus:border-blue-500 outline-none"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-semibold rounded-lg transition"
          >
            {loading ? "認証中..." : "ログイン"}
          </button>
        </form>
      </div>
    </div>
  );
}
