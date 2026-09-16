"use client";

// 카카오 동의 화면으로 **바로 보낸다.**
//
// 중간에 "동의해 주세요" 안내 지면을 한 장 세우면 버튼을 한 번 더 누르게 할 뿐이다.
// 동의는 어차피 카카오 화면에서 받고, 우리 지면에는 읽을 것도 고를 것도 없다.
//
// ⚠️ **무조건 보내면 빠져나갈 수 없는 고리가 된다.** 거부하고 돌아오면 여전히 미동의라
//    또 보내고, 또 거부하고, 또 보낸다. 그래서 보내기 직전에 쿠키를 심고, **서버가**
//    그 쿠키를 보고 두 번째부터는 버튼 지면을 그린다(consent/page.tsx).
//    판단을 서버에 둔 이유 — 클라이언트 state 로 하면 첫 화면이 번쩍였다가 넘어간다.
//
// 이 컴포넌트는 조건을 따지지 않는다. 그려졌다는 건 "보내라" 는 뜻이다.

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { setOauthNextCookie } from "@/lib/safe-redirect-client";
import { mpTrack } from "@/lib/mixpanel";

/** 한 번 보냈다는 표시 — 서버가 읽는다. 10분이면 왕복에 충분하다 */
export const KAKAO_TERMS_TRIED_COOKIE = "samae_kakao_terms_tried";

export function KakaoTermsAutoRedirect({ next, tags }: { next: string; tags: string }) {
  const fired = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    (async () => {
      document.cookie = `${KAKAO_TERMS_TRIED_COOKIE}=1; Path=/; Max-Age=600; SameSite=Lax`;
      mpTrack("Start Kakao Terms Consent", { auto: true });
      setOauthNextCookie(next);
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "kakao",
        options: {
          redirectTo: `${location.origin}/auth/callback`,
          // 이름이 `service_terms` 다 — 응답 필드(allowed_service_terms)와 헷갈리기 쉽고,
          // 틀리면 카카오가 조용히 무시해 동의 화면이 안 뜬다
          queryParams: { service_terms: tags },
        },
      });
      // 못 보냈으면 이유를 보여준다. 빈 화면으로 두면 죽은 것처럼 보인다
      if (err) setError(err.message || "카카오로 이동하지 못했어요.");
    })();
  }, [next, tags]);

  return (
    <main className="grid min-h-[60svh] place-items-center px-5 font-kr">
      {error ? (
        <div className="text-center">
          <p className="text-body-sm text-danger">{error}</p>
          <a
            href="/signup/consent"
            className="mt-3 inline-block text-caption text-muted underline underline-offset-2"
          >
            다시 시도하기
          </a>
        </div>
      ) : (
        <p className="text-body-sm text-muted">카카오 동의 화면으로 이동 중…</p>
      )}
    </main>
  );
}
