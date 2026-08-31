"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mpTrack } from "@/lib/mixpanel";
import { readNextParam, setOauthNextCookie } from "@/lib/safe-redirect-client";
import { Divider, Field, KakaoButton, Note, SubmitButton } from "../AuthBits";

const DEFAULT_LOGIN_NEXT = "/studio";

/**
 * 진입 맥락별 카피 — 어디서 왔는지에 따라 "왜 로그인해야 하는지"가 첫 줄에 보이게.
 * (로그인 벽은 이탈 지점이다 — 맥락 없는 "로그인하세요"가 가장 나쁜 카피)
 */
function contextCopy(next: string): { title: string; sub: string } {
  if (next.startsWith("/inquiry/bot"))
    return {
      title: "로그인하고 대화를 이어가요",
      sub: "작성 중인 문의는 그대로 보관돼 있어요. 답장이 오면 문자로 알려드려요.",
    };
  if (next.startsWith("/inquiry"))
    return { title: "로그인하고 문의를 보내요", sub: "1초 카카오 로그인이면 충분해요." };
  if (next.startsWith("/favorites") || next.startsWith("/cart"))
    return {
      title: "관심 사진을 계정에 담아둘게요",
      sub: "로그인하면 어느 기기에서든 다시 볼 수 있어요.",
    };
  return { title: "다시 오셨네요", sub: "담아둔 사진과 보낸 문의를 이어서 볼 수 있어요." };
}

/**
 * 표제 — next 를 읽어야 해서 클라이언트에서 그린다.
 * useSearchParams 는 Suspense 안에서만 쓴다(밖에 두면 정적 지면이 매 요청 렌더로 떨어진다).
 */
export function LoginHeadline() {
  return (
    <Suspense fallback={<HeadlineShell {...contextCopy(DEFAULT_LOGIN_NEXT)} />}>
      <ContextHeadline />
    </Suspense>
  );
}

function ContextHeadline() {
  const next = useSearchParams().get("next") ?? DEFAULT_LOGIN_NEXT;
  return <HeadlineShell {...contextCopy(next)} />;
}

function HeadlineShell({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1 className="mt-6 text-[clamp(1.5rem,6vw,2rem)] font-extrabold leading-[1.2] tracking-[-0.035em]">
        {title}
      </h1>
      <p className="mt-2.5 text-body-sm leading-relaxed text-muted">{sub}</p>
    </>
  );
}

// 로그인 폼 — 카카오 소셜 + 이메일. (지면 구성은 AuthShell 이 맡는다)
export function LoginForm() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);

  /** 복귀 경로 — 문의 흐름에서 넘어온 사람을 하던 자리로 돌려보낸다. */
  const loginNext = () => readNextParam(DEFAULT_LOGIN_NEXT);

  async function onKakao() {
    setError(null);
    setKakaoLoading(true);
    mpTrack("Start Kakao Login", { context: "login" });
    // OAuth 왕복에서 복귀 경로가 날아가지 않게 쿠키로 넘긴다(/auth/callback 이 읽는다)
    setOauthNextCookie(loginNext());
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
      <Suspense fallback={null}>
        <VerifyNotice />
      </Suspense>

      <KakaoButton
        onClick={onKakao}
        label={kakaoLoading ? "카카오로 이동 중…" : "카카오로 계속하기"}
        track="cta:login_kakao"
        disabled={kakaoLoading}
      />
      <p className="mt-2.5 text-center text-caption text-faint">
        가입돼 있지 않아도 이 버튼 하나로 시작돼요
      </p>

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

/** 인증·로그인 콜백 결과 배너 (?verified=1 / ?error=verify / ?error=auth) */
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
  if (params.get("error") === "auth") {
    return (
      <div className="mb-5">
        <Note tone="bad">로그인에 실패했어요. 다시 시도해 주세요.</Note>
      </div>
    );
  }
  return null;
}

export function LoginFooter() {
  return (
    <Suspense fallback={null}>
      <SignupLink />
    </Suspense>
  );
}

/** 가입으로 넘어갈 때도 복귀 경로를 들고 간다 — 문의 흐름이 여기서 끊기면 안 된다. */
function SignupLink() {
  const next = useSearchParams().get("next");
  const href = next ? `/signup?next=${encodeURIComponent(next)}` : "/signup";
  return (
    <p className="text-center text-body-sm text-muted">
      아직 계정이 없나요?{" "}
      <Link
        href={href}
        className="font-semibold text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand"
      >
        회원가입
      </Link>
    </p>
  );
}
