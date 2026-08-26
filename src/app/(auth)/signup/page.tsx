"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mpTrack } from "@/lib/mixpanel";
import { readNextParam, setOauthNextCookie } from "@/lib/safe-redirect-client";
import { ArrowLeftIcon, MailIcon, CheckIcon } from "@/components/user/icons";

const DEFAULT_SIGNUP_NEXT = "/";

// 이메일 가입 노출 여부 — 도메인/커스텀 SMTP 준비 전까지는 false(카카오만).
// 운영 SMTP 연결 후 true 로 바꾸면 이메일 가입 폼이 다시 노출된다. (docs/15)
const EMAIL_SIGNUP_ENABLED = false;

// 회원가입 — 로그인과 같은 풀페이지 스켈레톤(상단 헤드라인 + 하단 액션).
// 이메일 인증 ON이면 가입 후 확인 메일 안내, OFF면 즉시 로그인.
export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [sent, setSent] = useState(false); // 확인 메일 발송됨
  const [resentMsg, setResentMsg] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0); // 재발송 쿨다운(초) — 이메일 한도 보호
  // 가입 후 복귀 경로 — 로그인 페이지에서 next 를 이어받는다 (문의 흐름 이탈 방지)
  const [next, setNext] = useState(DEFAULT_SIGNUP_NEXT);

  // 회원가입 페이지 진입 — 가입 퍼널 시작점
  useEffect(() => {
    setNext(readNextParam(DEFAULT_SIGNUP_NEXT));
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

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  async function onKakao() {
    setError(null);
    setKakaoLoading(true);
    mpTrack("Start Kakao Login", { context: "signup" });
    setOauthNextCookie(next); // 가입 완료 후에도 하던 흐름(문의 등)으로 복귀
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
      router.push(next);
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

  // ── 확인 메일 안내 (이메일 가입 경로에서만 진입) ──
  if (sent) {
    return (
      <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col items-center justify-center bg-surface px-6 py-10 text-center font-kr">
        <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-brand">
          <MailIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-h1 font-semibold">확인 메일을 보냈어요</h1>
        <p className="mt-2 text-body-sm text-muted">
          <strong className="font-semibold text-fg">{email}</strong> 로 보낸 메일의 링크를 눌러
          가입을 완료해 주세요.
        </p>
        <p className="mt-1 text-caption text-faint">메일이 안 보이면 스팸함도 확인해 주세요.</p>

        {resentMsg && <p className="mt-4 text-caption text-success">{resentMsg}</p>}

        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0}
          className="mt-6 w-full cursor-pointer rounded-xl border border-line-strong py-3 text-body-sm font-semibold text-fg transition-colors hover:bg-fg/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {cooldown > 0 ? `다시 보내기 (${cooldown}초)` : "확인 메일 다시 보내기"}
        </button>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="mt-3 block text-center text-caption text-muted transition-colors hover:text-fg"
        >
          로그인하러 가기
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[100svh] w-full max-w-sm flex-col bg-surface px-6 pb-8 pt-4 font-kr">
      {/* 상단 — 뒤로가기 */}
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로 가기"
        className="-ml-2 grid h-11 w-11 cursor-pointer place-items-center rounded-full text-fg transition-colors hover:bg-fg/[0.05]"
      >
        <ArrowLeftIcon />
      </button>

      {/* 헤드라인 */}
      <div className="mt-10">
        <p className="font-display text-xl italic text-brand">samae</p>
        <h1 className="mt-4 whitespace-pre-line text-[1.75rem] font-bold leading-[1.3] tracking-tight">
          {"취향에 맞는 작가를\n만나러 가요"}
        </h1>
        <p className="mt-3 text-body-sm leading-relaxed text-muted">
          {EMAIL_SIGNUP_ENABLED
            ? "이메일로 30초 만에 시작해요."
            : "복잡한 절차 없이 카카오 계정으로 바로 시작돼요."}
        </p>
      </div>

      <div className="flex-1" />

      {/* 하단 액션 */}
      <div>
        {EMAIL_SIGNUP_ENABLED && (
          <form onSubmit={onSubmit} className="mb-5 flex flex-col gap-2.5">
            <input
              type="text"
              required
              placeholder="이름 (활동명)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none transition-colors focus:border-fg/40"
            />
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none transition-colors focus:border-fg/40"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="비밀번호 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none transition-colors focus:border-fg/40"
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full cursor-pointer rounded-xl bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "처리 중…" : "이메일로 가입하기"}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={onKakao}
          disabled={kakaoLoading}
          data-track="cta:signup_kakao"
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-4 text-body-sm font-semibold text-[#191600] transition active:scale-[0.99] hover:opacity-90 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
            <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.97 3.6c-.05.2.07.4.27.44a.4.4 0 0 0 .3-.05l4.3-2.85c.47.05.95.08 1.44.08 5.52 0 10-3.54 10-7.88C22 6.54 17.52 3 12 3Z" />
          </svg>
          {kakaoLoading ? "카카오로 이동 중…" : "카카오로 1초 만에 시작"}
        </button>
        <p className="mt-2.5 text-center text-caption text-faint">
          별도 입력 없이 카카오 계정으로 바로 가입돼요
        </p>
        {error && !EMAIL_SIGNUP_ENABLED && (
          <p className="mt-3 text-center text-caption text-danger">{error}</p>
        )}

        <div className="mt-5 flex items-center justify-center text-caption text-muted">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="transition-colors hover:text-fg"
          >
            이미 계정이 있으신가요? <span className="font-semibold text-fg">로그인</span>
          </Link>
        </div>

        <p className="mt-5 text-center text-caption leading-relaxed text-faint">
          가입 시 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </div>
    </main>
  );
}
