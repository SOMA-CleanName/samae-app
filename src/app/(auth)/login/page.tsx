"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// 로그인/회원가입 — 카카오 소셜 + 이메일
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onKakao() {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fn =
      mode === "signin"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${location.origin}/auth/callback` },
          });

    const { error } = await fn;
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-[100svh] flex flex-col items-center justify-center px-6 font-kr">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-display italic text-brand">samae</h1>
        <p className="mt-2 text-center text-sm text-fg/60">
          취향에 맞는 사진작가를 만나보세요.
        </p>

        {/* 카카오 로그인 */}
        <button
          type="button"
          onClick={onKakao}
          className="mt-8 w-full rounded-xl bg-[#FEE500] py-3 text-sm font-semibold text-[#191600] hover:opacity-90"
        >
          카카오로 시작하기
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-fg/35">
          <span className="h-px flex-1 bg-fg/10" /> 또는 이메일 <span className="h-px flex-1 bg-fg/10" />
        </div>

        {/* 이메일 폼 */}
        <form onSubmit={onEmailSubmit} className="flex flex-col gap-2.5">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-fg/15 bg-white px-4 py-3 text-sm outline-none focus:border-fg/40"
          />
          {error && <p className="text-xs text-brand">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "처리 중…" : mode === "signin" ? "로그인" : "회원가입"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-fg/50 hover:text-fg/80"
        >
          {mode === "signin"
            ? "계정이 없으신가요? 회원가입"
            : "이미 계정이 있으신가요? 로그인"}
        </button>
      </div>
    </main>
  );
}
