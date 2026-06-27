"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeftIcon, CheckIcon } from "@/components/user/icons";

const DEFAULT_LOGIN_NEXT = "/studio";
const OAUTH_NEXT_COOKIE = "samae_oauth_next";

// 로그인 — 카카오 소셜 + 이메일 (회원가입은 /signup)
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<"verified" | "verifyError" | null>(null);

  // 이메일 인증 콜백 결과 배너 (?verified=1 / ?error=verify)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("verified") === "1") setNotice("verified");
    else if (p.get("error") === "verify") setNotice("verifyError");
  }, []);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  function loginNext() {
    if (typeof window === "undefined") return DEFAULT_LOGIN_NEXT;
    const next = new URLSearchParams(window.location.search).get("next");
    return safeClientNext(next, DEFAULT_LOGIN_NEXT);
  }

  async function onKakao() {
    setError(null);
    const next = loginNext();
    document.cookie = `${OAUTH_NEXT_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=600; SameSite=Lax`;
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push(loginNext());
    router.refresh();
  }

  return (
    <main className="min-h-[100svh] flex flex-col items-center justify-center px-6 font-kr">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로 가기"
        className="fixed left-4 top-4 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.1] sm:left-6 sm:top-6"
      >
        <ArrowLeftIcon />
      </button>
      <div className="w-full max-w-sm">
        {notice === "verified" && (
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckIcon className="h-4 w-4 shrink-0" />
            이메일 인증이 완료됐어요. 로그인해 주세요.
          </div>
        )}
        {notice === "verifyError" && (
          <div className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            인증 링크가 만료되었거나 올바르지 않아요. 다시 시도해 주세요.
          </div>
        )}
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
            className="rounded-xl border border-fg/15 bg-surface px-4 py-3 text-sm outline-none focus:border-fg/40"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-fg/15 bg-surface px-4 py-3 text-sm outline-none focus:border-fg/40"
          />
          {error && <p className="text-xs text-brand">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full rounded-xl bg-fg py-3 text-sm font-semibold text-bg hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "처리 중…" : "로그인"}
          </button>
        </form>

        <Link
          href="/signup"
          className="mt-4 block w-full text-center text-xs text-fg/50 hover:text-fg/80"
        >
          계정이 없으신가요? 회원가입
        </Link>
      </div>
    </main>
  );
}

function safeClientNext(next: string | null | undefined, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "http://internal.invalid");
    if (url.origin !== "http://internal.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
