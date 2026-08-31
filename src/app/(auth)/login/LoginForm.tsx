"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mpTrack } from "@/lib/mixpanel";
import { Divider, Field, KakaoButton, Note, SubmitButton } from "../AuthBits";

const DEFAULT_LOGIN_NEXT = "/studio";
const OAUTH_NEXT_COOKIE = "samae_oauth_next";

// 로그인 폼 — 카카오 소셜 + 이메일. (지면 구성은 AuthShell 이 맡는다)
export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function loginNext() {
    if (typeof window === "undefined") return DEFAULT_LOGIN_NEXT;
    const next = new URLSearchParams(window.location.search).get("next");
    return safeClientNext(next, DEFAULT_LOGIN_NEXT);
  }

  async function onKakao() {
    setError(null);
    mpTrack("Start Kakao Login", { context: "login" });
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
    <>
      {/* 이 지면은 정적으로 미리 그려 두므로 useSearchParams 는 Suspense 안에서만 쓴다.
          (밖에 두면 페이지 전체가 매 요청 렌더로 떨어진다) */}
      <Suspense fallback={null}>
        <VerifyNotice />
      </Suspense>

      <KakaoButton onClick={onKakao} label="카카오로 계속하기" />

      <Divider>또는 이메일</Divider>

      <form onSubmit={onEmailSubmit} className="flex flex-col gap-3">
        <Field
          label="이메일"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="비밀번호"
          type="password"
          required
          minLength={6}
          autoComplete="current-password"
          placeholder="••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <Note tone="bad">{error}</Note>}
        <SubmitButton loading={loading}>로그인</SubmitButton>
      </form>
    </>
  );
}

/** 이메일 인증 콜백 결과 배너 (?verified=1 / ?error=verify) */
function VerifyNotice() {
  const params = useSearchParams();
  if (params.get("verified") === "1") {
    return (
      <div className="mb-5">
        <Note tone="ok">이메일 인증이 완료됐어요. 로그인해 주세요.</Note>
      </div>
    );
  }
  if (params.get("error") === "verify") {
    return (
      <div className="mb-5">
        <Note tone="bad">인증 링크가 만료되었거나 올바르지 않아요. 다시 시도해 주세요.</Note>
      </div>
    );
  }
  return null;
}

export function LoginFooter() {
  return (
    <p className="text-center text-body-sm text-muted">
      아직 계정이 없나요?{" "}
      <Link
        href="/signup"
        className="font-semibold text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand"
      >
        회원가입
      </Link>
    </p>
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
