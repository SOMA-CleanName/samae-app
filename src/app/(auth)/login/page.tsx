"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mpTrack } from "@/lib/mixpanel";
import { readNextParam, setOauthNextCookie } from "@/lib/safe-redirect-client";
import { ArrowLeftIcon, CheckIcon } from "@/components/user/icons";

const DEFAULT_LOGIN_NEXT = "/studio";

// 진입 맥락별 카피 — 어디서 왔는지에 따라 "왜 로그인해야 하는지"가 첫 줄에 보이게.
// (로그인 벽은 이탈 지점이다 — 맥락 없는 "로그인하세요"가 가장 나쁜 카피)
function contextCopy(next: string): { title: string; sub: string } {
  if (next.startsWith("/inquiry/bot"))
    return {
      title: "로그인하고 대화를 이어가요",
      sub: "작성 중인 문의는 그대로 보관돼 있어요. 답장이 오면 문자로 알려드려요.",
    };
  if (next.startsWith("/inquiry"))
    return { title: "로그인하고 문의를 보내요", sub: "1초 카카오 로그인이면 충분해요." };
  if (next.startsWith("/favorites") || next.startsWith("/cart"))
    return { title: "관심 사진을 계정에 담아둘게요", sub: "로그인하면 어느 기기에서든 다시 볼 수 있어요." };
  return { title: "다시 만나서 반가워요", sub: "취향에 맞는 사진작가를 만나보세요." };
}

// 로그인 — 카카오 소셜 우선 + 이메일(접이식). 회원가입은 /signup (next 왕복 유지).
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [notice, setNotice] = useState<"verified" | "verifyError" | "auth" | null>(null);
  // SSR/첫 클라이언트 렌더 불일치 방지 — next 는 마운트 후 읽는다
  const [next, setNext] = useState(DEFAULT_LOGIN_NEXT);

  useEffect(() => {
    setNext(readNextParam(DEFAULT_LOGIN_NEXT));
    const p = new URLSearchParams(window.location.search);
    if (p.get("verified") === "1") setNotice("verified");
    else if (p.get("error") === "verify") setNotice("verifyError");
    else if (p.get("error") === "auth") setNotice("auth");
  }, []);

  const copy = useMemo(() => contextCopy(next), [next]);

  function onBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/");
  }

  async function onKakao() {
    setError(null);
    setKakaoLoading(true);
    mpTrack("Start Kakao Login", { context: "login" });
    setOauthNextCookie(next);
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
    router.push(next);
    router.refresh();
  }

  return (
    <main className="relative flex min-h-[100svh] flex-col items-center justify-center overflow-hidden bg-surface-2 px-5 py-10 font-kr">
      {/* 은은한 브랜드 글로우 — 페이지가 "빈 폼"이 아니라 브랜드 공간으로 읽히게 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-brand-soft opacity-70 blur-3xl"
      />

      <button
        type="button"
        onClick={onBack}
        aria-label="뒤로 가기"
        className="fixed left-4 top-4 z-10 grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-fg/[0.06] text-fg backdrop-blur transition-colors hover:bg-fg/[0.1] sm:left-6 sm:top-6"
      >
        <ArrowLeftIcon />
      </button>

      <div className="relative w-full max-w-sm">
        {/* 상단 알림 배너 */}
        {notice === "verified" && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-body-sm text-success">
            <CheckIcon className="h-4 w-4 shrink-0" />
            이메일 인증이 완료됐어요. 로그인해 주세요.
          </div>
        )}
        {notice === "verifyError" && (
          <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
            인증 링크가 만료되었거나 올바르지 않아요. 다시 시도해 주세요.
          </div>
        )}
        {notice === "auth" && (
          <div className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-body-sm text-danger">
            로그인에 실패했어요. 다시 시도해 주세요.
          </div>
        )}

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <p className="font-display text-lg italic text-brand">samae</p>
          <h1 className="mt-2 text-h1 font-semibold leading-snug">{copy.title}</h1>
          <p className="mt-1.5 text-body-sm text-muted">{copy.sub}</p>

          {/* 카카오 — 주 동선. 한 개의 큰 버튼만 먼저 보이게 */}
          <button
            type="button"
            onClick={onKakao}
            disabled={kakaoLoading}
            data-track="cta:login_kakao"
            className="mt-7 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-3.5 text-body-sm font-semibold text-[#191600] transition active:scale-[0.99] hover:opacity-90 disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
              <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.97 3.6c-.05.2.07.4.27.44a.4.4 0 0 0 .3-.05l4.3-2.85c.47.05.95.08 1.44.08 5.52 0 10-3.54 10-7.88C22 6.54 17.52 3 12 3Z" />
            </svg>
            {kakaoLoading ? "카카오로 이동 중…" : "카카오로 1초 만에 시작"}
          </button>
          <p className="mt-2.5 text-center text-caption text-faint">
            가입돼 있지 않아도 이 버튼 하나로 시작돼요
          </p>

          {/* 이메일 — 접이식 보조 동선 (화면을 폼으로 채우지 않는다) */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setEmailOpen((v) => !v)}
              aria-expanded={emailOpen}
              className="flex w-full cursor-pointer items-center gap-3 text-caption text-faint transition-colors hover:text-muted"
            >
              <span className="h-px flex-1 bg-line" />
              이메일로 로그인
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={"h-3.5 w-3.5 transition-transform " + (emailOpen ? "rotate-180" : "")}
                aria-hidden
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span className="h-px flex-1 bg-line" />
            </button>

            {emailOpen && (
              <form onSubmit={onEmailSubmit} className="mt-4 flex flex-col gap-2.5">
                <input
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none transition-colors focus:border-fg/40"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  placeholder="비밀번호 (6자 이상)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-xl border border-line-strong bg-surface px-4 py-3 text-body-sm outline-none transition-colors focus:border-fg/40"
                />
                {error && <p className="text-caption text-danger">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="mt-1 w-full cursor-pointer rounded-xl bg-fg py-3 text-body-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "처리 중…" : "로그인"}
                </button>
              </form>
            )}
          </div>
        </div>

        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="mt-4 block w-full text-center text-caption text-muted transition-colors hover:text-fg"
        >
          처음이신가요? <span className="font-semibold text-fg">회원가입</span>
        </Link>
        <p className="mt-3 text-center text-caption leading-relaxed text-faint">
          로그인하면 서비스 이용약관과 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </div>
    </main>
  );
}
