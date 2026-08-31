"use client";

// 카카오 로그인 버튼 — 로그인 페이지 밖에서도 쓴다.
//
// 사진 상세의 [작가 상담하기], 문의 폼의 마지막 단계처럼 "이미 하려던 일이 있는" 자리에서는
// 로그인 페이지로 보내면 안 된다. 하던 맥락이 사라지고, 돌아오는 길이 하나 더 생긴다.
// 그 자리에서 바로 로그인하고 하던 일을 이어가게 한다.
//
// 복귀 경로는 쿠키(OAUTH_NEXT_COOKIE)로 넘긴다 — /auth/callback 이 읽어 되돌려 보낸다.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setOauthNextCookie } from "@/lib/safe-redirect-client";
import { mpTrack } from "@/lib/mixpanel";

export function KakaoLoginButton({
  next,
  context,
  label = "카카오로 1초 만에 시작",
}: {
  /** 로그인 후 돌아올 곳 */
  next: string;
  /** 계측용 — 어느 자리에서 눌렀는가 */
  context: string;
  label?: string;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function onKakao() {
    setLoading(true);
    mpTrack("Start Kakao Login", { context });
    setOauthNextCookie(next);
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <button
      type="button"
      onClick={onKakao}
      disabled={loading}
      data-track="cta:login_kakao"
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#FEE500] py-4 text-body-sm font-semibold text-[#191600] transition active:scale-[0.99] hover:opacity-90 disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
        <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.97 3.6c-.05.2.07.4.27.44a.4.4 0 0 0 .3-.05l4.3-2.85c.47.05.95.08 1.44.08 5.52 0 10-3.54 10-7.88C22 6.54 17.52 3 12 3Z" />
      </svg>
      {loading ? "카카오로 이동 중…" : label}
    </button>
  );
}
