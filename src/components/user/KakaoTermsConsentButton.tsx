"use client";

// 약관만 다시 동의받기 — 카카오 동의 화면으로 보내 **거기서** 받는다.
//
// 카카오 간편가입을 켠 뒤로 회원 약관은 카카오가 받는다. 그런데 못 받은 사람이 남는다:
//   · 간편가입을 켜기 전에 가입한 기존 회원 (지금 17명)
//   · service_terms 조회가 실패·타임아웃(4초) 난 경우
//   · **약관을 개정해서 재동의가 필요해진 경우** (terms_version 이 달라진다)
//
// 그 사람들에게 우리 체크박스 화면을 다시 보이면 **같은 약관을 두 군데서 받는 꼴**이다.
// 카카오로 보내면 동의의 진실이 한 곳(카카오)에 모이고, 돌아올 때 `service_terms` 로
// 그대로 읽어 온다.
//
// ⚠️ **자동 리다이렉트로 만들지 않았다.** 동의를 거부하고 돌아오면 여전히 미동의라
//    또 튕기고, 또 튕긴다 — 빠져나갈 수 없는 고리가 된다. 버튼 한 번이면 그 고리가 없다.
//
// 돌아오는 길: 쿠키(OAUTH_NEXT_COOKIE) → /auth/callback 이 읽어 되돌려 보내고,
// 거기서 adoptKakaoServiceTerms() 가 profiles.terms_agreed_at 을 채운다.
// 이 컴포넌트는 저장에 관여하지 않는다.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setOauthNextCookie } from "@/lib/safe-redirect-client";
import { mpTrack } from "@/lib/mixpanel";

export function KakaoTermsConsentButton({
  next,
  tags,
  label = "카카오로 약관 동의하기",
}: {
  /** 동의 후 돌아올 곳 */
  next: string;
  /**
   * 콘솔에 등록한 약관 태그(쉼표 구분). 서버에서 내려준다 —
   * KAKAO_TERMS_TAGS 는 서버 전용 env 라 클라이언트가 직접 못 읽는다.
   */
  tags: string;
  label?: string;
}) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    mpTrack("Start Kakao Terms Consent");
    setOauthNextCookie(next);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        // 약관은 scope 가 아니라 간편가입 항목이라 `service_terms` 로 지정한다.
        // ⚠️ 이름이 `service_terms_tags` 가 아니다 — 응답 필드(allowed_service_terms)와
        //    헷갈리기 쉽고, 틀리면 카카오가 조용히 무시해 동의 화면이 안 뜬다.
        //    (카카오 로그인 REST API 문서 · 인가 코드 받기)
        // 이미 동의한 항목은 카카오가 화면에서 빼 주므로 **필요한 줄만** 뜬다.
        queryParams: { service_terms: tags },
      },
    });
    // 조용히 실패하면 사용자는 버튼이 죽은 줄 안다 — 실제로 그런 신고가 있었다(09-16).
    if (err) {
      setError(err.message || "카카오로 이동하지 못했어요. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <>
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      data-track="cta:kakao_terms_consent"
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#FEE500] px-4 py-3.5 text-body-sm font-semibold text-[#191600] transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
        <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.66l-.97 3.6c-.05.2.07.4.27.44a.4.4 0 0 0 .3-.05l4.3-2.85c.47.05.95.08 1.44.08 5.52 0 10-3.54 10-7.88C22 6.54 17.52 3 12 3Z" />
      </svg>
      {loading ? "카카오로 이동 중…" : label}
    </button>
    {error && <p className="mt-2 text-caption text-danger">{error}</p>}
    </>
  );
}
