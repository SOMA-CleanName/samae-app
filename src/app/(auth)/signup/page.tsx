"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeftIcon, MailIcon, CheckIcon } from "@/components/user/icons";

// 이메일 가입 노출 여부 — 도메인/커스텀 SMTP 준비 전까지는 false(카카오만).
// 운영 SMTP 연결 후 true 로 바꾸면 이메일 가입 폼이 다시 노출된다. (docs/15)
const EMAIL_SIGNUP_ENABLED = false;

// 회원가입 — 카카오 소셜 (이메일 가입은 SMTP 준비 후). 로그인과 구분되는 카드형 레이아웃.
// 이메일 인증 ON이면 가입 후 확인 메일 안내, OFF면 즉시 로그인.
export default function SignupPage() {
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
      router.push("/");
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

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center bg-surface-2 px-5 py-10 font-kr">
      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로 가기"
        className="fixed left-4 top-4 grid h-10 w-10 cursor-pointer place-items-center rounded-full bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.1] sm:left-6 sm:top-6"
      >
        <ArrowLeftIcon />
      </button>

      {/* 로그인과 구분되는 카드 */}
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
        {sent ? (
          // ── 확인 메일 안내 ──
          <div className="text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-brand">
              <MailIcon className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-h1 font-semibold">확인 메일을 보냈어요</h1>
            <p className="mt-2 text-body-sm text-muted">
              <strong className="font-semibold text-fg">{email}</strong> 로 보낸 메일의 링크를
              눌러 가입을 완료해 주세요.
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
              href="/login"
              className="mt-3 block text-center text-caption text-muted transition-colors hover:text-fg"
            >
              로그인하러 가기
            </Link>
          </div>
        ) : (
          // ── 가입 폼 ──
          <>
            <p className="font-display text-lg italic text-brand">samae</p>
            <h1 className="mt-1 text-h1 font-semibold">회원가입</h1>
            <p className="mt-1.5 text-body-sm text-muted">
              {EMAIL_SIGNUP_ENABLED ? "이메일로 30초 만에 시작해요." : "카카오로 간편하게 시작해요."}
            </p>

            <button
              type="button"
              onClick={onKakao}
              data-track="cta:signup_kakao"
              className="mt-6 w-full cursor-pointer rounded-xl bg-[#FEE500] py-3 text-body-sm font-semibold text-[#191600] transition-opacity hover:opacity-90"
            >
              카카오로 시작하기
            </button>

            {EMAIL_SIGNUP_ENABLED && (
              <>
                <div className="my-5 flex items-center gap-3 text-caption text-faint">
                  <span className="h-px flex-1 bg-line" /> 또는 이메일 <span className="h-px flex-1 bg-line" />
                </div>

                <form onSubmit={onSubmit} className="flex flex-col gap-2.5">
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
                  {error && <p className="text-caption text-brand">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 w-full cursor-pointer rounded-xl bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {loading ? "처리 중…" : "회원가입"}
                  </button>
                </form>

                {/* 약관 안내 (간단) */}
                <p className="mt-3 flex items-start gap-1.5 text-caption text-faint">
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                  가입 시 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.
                </p>
              </>
            )}

            {error && !EMAIL_SIGNUP_ENABLED && <p className="mt-3 text-caption text-brand">{error}</p>}

            <Link
              href="/login"
              className="mt-4 block text-center text-caption text-muted transition-colors hover:text-fg"
            >
              이미 계정이 있으신가요? 로그인
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
