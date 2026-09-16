"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mpTrack } from "@/lib/mixpanel";
import { readNextParam, setOauthNextCookie } from "@/lib/safe-redirect-client";
import { MailIcon } from "@/components/user/icons";
import { Divider, Field, KakaoButton, Note, SubmitButton } from "../AuthBits";
import { kakaoScopes } from "@/lib/kakao-phone";
import { recordSignupConsent } from "./consent/actions";
import { TERMS_VERSION } from "@/lib/policy-version";

/** 가입 후 복귀 경로 — 로그인 페이지에서 next 를 이어받는다(문의 흐름 이탈 방지). */
const DEFAULT_SIGNUP_NEXT = "/";

// 이메일 가입 노출 여부 — 도메인/커스텀 SMTP 준비 전까지는 false(카카오만).
// 운영 SMTP 연결 후 true 로 바꾸면 이메일 가입 폼이 다시 노출된다. (docs/15)
const EMAIL_SIGNUP_ENABLED = false;

// 회원가입 폼 — 카카오 소셜 (이메일 가입은 SMTP 준비 후).
// 이메일 인증 ON이면 가입 후 확인 메일 안내, OFF면 즉시 로그인.
export function SignupForm({ kakaoTermsTags }: { kakaoTermsTags?: string | null }) {
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
  // 약관·처리방침 동의 — 둘 다 체크해야 가입 버튼이 열린다 (회원약관 3조·5조). 카카오 가입은
  // 이 폼을 거치지 않으므로 콜백이 /signup/consent 로 보내 같은 동의를 받는다.
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [agreedPrivacy, setAgreedPrivacy] = useState(false);

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
    setError(null);
    setKakaoLoading(true);
    mpTrack("Start Kakao Login", { context: "signup" });
    // 가입 완료 후에도 하던 흐름(문의 등)으로 복귀
    setOauthNextCookie(signupNext());
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      // scopes 는 카카오싱크 검수 통과 후에만 붙는다(lib/kakao-phone) — 검수 안 된
      // 동의항목을 요청하면 카카오가 로그인 자체를 거절한다(KOE205).
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: kakaoScopes(),
        // 간편가입 약관 — **여기가 유일한 기회다.** 카카오는 최초 연결 때만 약관
        // 화면을 띄운다(이미 연결된 계정에는 조용히 무시한다). 그래서 이 값을 안
        // 보내면 아무도 카카오에서 약관에 동의하지 않게 되고, 전원이 우리 폼으로 온다.
        //
        // ⚠️ scope(동의항목)와 다르다. scope 는 기존 회원에게도 추가 동의를 받을 수
        //    있지만(전화번호가 그 경우다), **서비스 약관은 그게 안 된다.**
        ...(kakaoTermsTags ? { queryParams: { service_terms: kakaoTermsTags } } : {}),
      },
    });
    // 조용히 실패하면 "버튼이 죽었다" 로 보인다 — 실제로 그렇게 신고됐다(09-16).
    // 카카오·Supabase 가 돌려준 말을 그대로 띄운다. 원인을 감추는 것보다 낫다.
    if (oauthErr) {
      setError(oauthErr.message || "카카오로 이동하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setKakaoLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!agreedTerms || !agreedPrivacy) {
      setError("서비스 이용약관과 개인정보 처리방침에 동의해 주세요.");
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // 트리거(handle_new_user)가 display_name 으로 사용. 동의 버전은 증적으로 메타데이터에도 남긴다
        data: { name: name.trim() || undefined, terms_version: TERMS_VERSION, terms_agreed_at: new Date().toISOString() },
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
      // 이메일 인증 OFF → 즉시 로그인. 폼에서 받은 동의를 profiles 에 기록한다
      await recordSignupConsent();
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
            <div className="flex flex-col gap-1.5 text-caption text-fg">
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
                <span>
                  (필수){" "}
                  <Link href="/terms" target="_blank" className="underline underline-offset-2">서비스 이용약관</Link>에 동의합니다
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={agreedPrivacy} onChange={(e) => setAgreedPrivacy(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand" />
                <span>
                  (필수){" "}
                  <Link href="/privacy" target="_blank" className="underline underline-offset-2">개인정보 처리방침</Link>에 동의합니다
                </span>
              </label>
            </div>
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

      {/* 동의는 기록으로 남긴다 (profiles.terms_agreed_at). 이메일 가입은 위 체크박스로,
          카카오 가입은 로그인 콜백이 /signup/consent 로 보내 같은 두 항목에 체크를 받는다. */}
      <p className="mt-4 text-caption leading-relaxed text-faint">
        카카오로 시작하면 다음 화면에서{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-muted">
          서비스 이용약관
        </Link>
        과{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">
          개인정보 처리방침
        </Link>
        동의를 받아요.
      </p>
    </>
  );
}

/**
 * 진입 맥락별 표제 — 로그인 지면과 같은 장치(LoginForm 의 contextCopy).
 *
 * 기본 카피는 손님을 향한다("사진부터 고르고, 작가는 그다음"). 그런데 작가 모집
 * 링크(/apply)를 타고 온 사람이 [작가 신청 시작하기] 를 누르면 그 카피를 만난다 —
 * **잘못 눌렀나 싶은 화면**이다. 가입 이유가 첫 줄에 보여야 한다.
 */
function signupContextCopy(next: string): { title: string; sub: string } {
  if (next.startsWith("/apply"))
    return {
      title: "작가로 시작하기",
      sub: "가입하면 바로 신청서로 이어져요. 검토 후 사진이 지면에 노출됩니다.",
    };
  return {
    title: "사진부터 고르고, 작가는 그다음",
    sub: "마음에 든 사진을 누르면 그걸 찍은 작가로 이어져요. 담아두고 한 번에 물어볼 수 있어요.",
  };
}

function SignupHeadlineShell({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1 className="mt-6 text-[clamp(1.5rem,6vw,2rem)] font-extrabold leading-[1.2] tracking-[-0.035em]">
        {title}
      </h1>
      <p className="mt-2.5 text-body-sm leading-relaxed text-muted">{sub}</p>
    </>
  );
}

/** useSearchParams 는 Suspense 안에서만 — 밖에 두면 정적 지면이 매 요청 렌더로 떨어진다. */
export function SignupHeadline() {
  return (
    <Suspense fallback={<SignupHeadlineShell {...signupContextCopy(DEFAULT_SIGNUP_NEXT)} />}>
      <SignupContextHeadline />
    </Suspense>
  );
}

function SignupContextHeadline() {
  const next = useSearchParams().get("next") ?? DEFAULT_SIGNUP_NEXT;
  return <SignupHeadlineShell {...signupContextCopy(next)} />;
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
