"use client";

// 전화번호만 다시 동의받기 — 가입 때 [전체 동의하기]를 안 누른 사람을 위한 회수 경로.
//
// 전화번호는 선택 동의라(lib/kakao-phone) 안 주고 가입한 사람이 남는다. 그 사람은
// 알림톡도 문자도 못 받아서 작가 답장을 영영 놓친다 — 거래가 거기서 멈춘다.
//
// OTP(/signup/contact)로 보낼 수도 있지만 번호 입력 + 문자 6자리라 마찰이 크다.
// 카카오 계정이면 **이미 카카오가 검증해 둔 번호**를 동의 한 번으로 가져올 수 있다.
//
// 돌아오는 길: 쿠키(OAUTH_NEXT_COOKIE) → /auth/callback 이 읽어 되돌려 보내고,
// 거기서 adoptKakaoPhone() 이 profiles.phone 을 채운다. 이 컴포넌트는 저장에 관여하지 않는다.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setOauthNextCookie } from "@/lib/safe-redirect-client";
import { mpTrack } from "@/lib/mixpanel";
import { kakaoPhoneReconsentScopes } from "@/lib/kakao-phone";

export function KakaoPhoneConsentButton({
  next,
  context,
  label = "카카오로 알림 받기",
  size = "md",
}: {
  /** 동의 후 돌아올 곳 */
  next: string;
  /** 계측용 — 어느 자리에서 눌렀는가 (chat_banner · settings · signup_contact) */
  context: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    mpTrack("Start Kakao Phone Consent", { context });
    setOauthNextCookie(next);
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      // 이미 동의한 항목은 카카오가 화면에서 빼 준다 → 전화번호 한 줄만 뜬다.
      // 스위치가 꺼져 있으면 undefined 라 아무 scope 도 안 붙는다(KOE205 방지).
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        scopes: kakaoPhoneReconsentScopes(),
      },
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      data-track="cta:kakao_phone_consent"
      className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] font-semibold text-[#191600] transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60 ${
        size === "sm" ? "px-3 py-2 text-caption" : "w-full px-4 py-3.5 text-body-sm"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={size === "sm" ? "h-3.5 w-3.5 shrink-0" : "h-5 w-5 shrink-0"}
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.97 3.6c-.05.2.07.4.27.44a.4.4 0 0 0 .3-.05l4.3-2.85c.47.05.95.08 1.44.08 5.52 0 10-3.54 10-7.88C22 6.54 17.52 3 12 3Z" />
      </svg>
      {loading ? "카카오로 이동 중…" : label}
    </button>
  );
}
