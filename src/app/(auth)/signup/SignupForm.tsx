"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mpTrack } from "@/lib/mixpanel";
import { readNextParam, setOauthNextCookie } from "@/lib/safe-redirect-client";
import { MailIcon } from "@/components/user/icons";
import { Divider, Field, KakaoButton, Note, SubmitButton } from "../AuthBits";

/** 가입 후 복귀 경로 — 로그인 페이지에서 next 를 이어받는다(문의 흐름 이탈 방지). */
const DEFAULT_SIGNUP_NEXT = "/";

// 이메일 가입 노출 여부 — 도메인/커스텀 SMTP 준비 전까지는 false(카카오만).
// 운영 SMTP 연결 후 true 로 바꾸면 이메일 가입 폼이 다시 노출된다. (docs/15)
const EMAIL_SIGNUP_ENABLED = false;

// 회원가입 폼 — 카카오 소셜 (이메일 가입은 SMTP 준비 후).
// 이메일 인증 ON이면 가입 후 확인 메일 안내, OFF면 즉시 로그인.
export function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false); // 확인 메일 발송됨
  const [resentMsg, setResentMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); // 재발송 쿨다운(초) — 이메일 한도 보호
  const [kakaoLoading, setKakaoLoading] = useState(false);
  // 필수 동의 — 약관과 개인정보 수집·이용을 **구분해서** 받는다(개인정보보호법 제22조).
  // 전에는 "가입하면 …에 동의하게 됩니다" 문구뿐이었다(묵시적 동의). 무엇에 동의했는지
  // 특정할 수 없어 분쟁 때 근거가 되지 못한다.
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const agreed = agreeTerms && agreePrivacy;

  const signupNext = () => readNextParam(DEFAULT_SIGNUP_NEXT);

  // 회원가입 페이지 진입 — 가입 퍼널 시작점
  useEffect(() => {
    mpTrack("Start Sign Up");
  }, []);

  // 쿨다운 카운트다운
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 인증 메일 클릭 → 우리 사이트로 돌아와 로그인 유도
  const verifyRedirect = () =>
    typeof window !== "undefined" ? `${location.origin}/login?verified=1` : "/login?verified=1";

  async function onKakao() {
    if (!agreed) {
      setError("약관과 개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setError(null);
    setKakaoLoading(true);
    mpTrack("Start Kakao Login", { context: "signup" });
    // 가입 완료 후에도 하던 흐름(문의 등)으로 복귀
    setOauthNextCookie(signupNext());
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("약관과 개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // 트리거(handle_new_user)가 display_name 으로 사용
        data: { name: name.trim() || undefined },
        emailRedirectTo: verifyRedirect(),
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    // 이미 가입된 이메일은 identities 가 빈 배열로 옴
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError("이미 가입된 이메일이에요. 로그인해 주세요.");
      return;
    }
    if (data.session) {
      // 이메일 인증 OFF → 즉시 로그인
      router.push(signupNext());
      router.refresh();
    } else {
      // 인증 ON → 확인 메일 안내
      setSent(true);
      setCooldown(60); // 방금 보냈으니 재발송 쿨다운 시작
    }
  }

  async function onResend() {
    if (cooldown > 0) return;
    setResentMsg(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: verifyRedirect() },
    });
    if (error) {
      setResentMsg(error.message);
    } else {
      setResentMsg("확인 메일을 다시 보냈어요.");
      setCooldown(60);
    }
  }

  // ── 확인 메일 안내 ──
  if (sent) {
    return (
      <div>
        <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand">
          <MailIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-5 text-h2 font-bold tracking-tight">확인 메일을 보냈어요</h2>
        <p className="mt-2 text-body-sm leading-relaxed text-muted">
          <strong className="font-semibold text-fg">{email}</strong> 로 보낸 메일의 링크를 눌러
          가입을 완료해 주세요.
        </p>
        <p className="mt-1 text-caption text-faint">메일이 안 보이면 스팸함도 확인해 주세요.</p>

        {resentMsg && (
          <div className="mt-4">
            <Note tone="ok">{resentMsg}</Note>
          </div>
        )}

        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0}
          className="ed-more mt-6 w-full cursor-pointer rounded-xl border border-line-strong py-3.5 text-body-sm font-bold text-fg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown > 0 ? `다시 보내기 (${cooldown}초)` : "확인 메일 다시 보내기"}
        </button>
        <LoginLink className="mt-3 block text-center text-body-sm text-muted transition-colors hover:text-fg">
          로그인하러 가기
        </LoginLink>
      </div>
    );
  }

  // ── 가입 폼 ──
  return (
    <>
      {/*
        필수 동의 — 두 항목을 **구분해서** 받는다(개인정보보호법 제22조).
        카카오·이메일 두 경로 모두 여기를 통과해야 진행된다.
      */}
      <div className="mb-4 flex flex-col gap-2">
        <Consent checked={agreeTerms} onChange={setAgreeTerms} href="/terms">
          서비스 이용약관
        </Consent>
        <Consent checked={agreePrivacy} onChange={setAgreePrivacy} href="/privacy">
          개인정보 수집·이용
        </Consent>
      </div>

      <KakaoButton
        onClick={onKakao}
        label={kakaoLoading ? "카카오로 이동 중…" : "카카오로 시작하기"}
        track="cta:signup_kakao"
        disabled={kakaoLoading}
      />
      <p className="mt-2.5 text-center text-caption text-faint">
        별도 입력 없이 카카오 계정으로 바로 가입돼요
      </p>

      {EMAIL_SIGNUP_ENABLED && (
        <>
          <Divider>또는 이메일</Divider>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Field
              label="이름"
              type="text"
              required
              autoComplete="name"
              placeholder="활동명"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
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
              autoComplete="new-password"
              placeholder="6자 이상"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <Note tone="bad">{error}</Note>}
            <SubmitButton loading={loading}>회원가입</SubmitButton>
          </form>
        </>
      )}

      {error && !EMAIL_SIGNUP_ENABLED && (
        <div className="mt-4">
          <Note tone="bad">{error}</Note>
        </div>
      )}


    </>
  );
}

/** 필수 동의 한 줄 — 체크박스 + 문서 링크. 링크를 눌러도 체크가 토글되지 않게 분리한다. */
function Consent({
  checked,
  onChange,
  href,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-caption">
      <input
        id={`consent-${href}`}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-brand"
      />
      <label htmlFor={`consent-${href}`} className="cursor-pointer text-muted">
        <span className="font-semibold text-fg">[필수]</span> {children}
      </label>
      <Link
        href={href}
        className="ml-auto shrink-0 text-faint underline underline-offset-2 hover:text-muted"
      >
        보기
      </Link>
    </div>
  );
}

export function SignupFooter() {
  return (
    <p className="text-center text-body-sm text-muted">
      이미 계정이 있나요?{" "}
      <LoginLink className="font-semibold text-fg underline decoration-line-strong underline-offset-4 transition-colors hover:text-brand">
        로그인
      </LoginLink>
    </p>
  );
}

/**
 * 로그인으로 넘어갈 때 복귀 경로를 들고 간다 — 문의 흐름이 여기서 끊기면 안 된다.
 * useSearchParams 는 Suspense 안에서만 쓴다(밖에 두면 정적 지면이 매 요청 렌더로 떨어진다).
 */
function LoginLink({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <Suspense fallback={<Link href="/login" className={className}>{children}</Link>}>
      <LoginLinkInner className={className}>{children}</LoginLinkInner>
    </Suspense>
  );
}

function LoginLinkInner({ className, children }: { className?: string; children: React.ReactNode }) {
  const next = useSearchParams().get("next");
  return (
    <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className={className}>
      {children}
    </Link>
  );
}
