import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { APP_ENV } from "@/lib/env";

/*
  검색엔진 크롤링 규칙 — 공개 콘텐츠만 허용, 거래·관리·인증 경로는 차단.

  🔴 **2026-09-17: 운영 사이트가 통째로 차단돼 있었다.**

  전에는 `if (!isProd) return { disallow: "/" }` 였다. 즉 **"프로덕션이라고 확신하지
  못하면 전부 막는다"** 였는데, 판정이 `VERCEL_ENV` 하나에 걸려 있었다. Vercel 프로젝트
  설정에서 시스템 환경변수 자동 주입이 꺼져 있으면 `VERCEL_ENV` 가 빌드에 안 들어오고,
  그러면 `APP_ENV` 가 "development" 로 떨어져 **운영 robots.txt 가 `Disallow: /` 로 나간다.**

      실측 2026-09-17 — https://www.samae.ai/robots.txt
        User-Agent: *
        Disallow: /

  색인이 0이면 SEO 도 GEO 도 전부 무의미하다. sitemap 1078개도, JSON-LD 도, llms.txt 도
  아무도 안 읽는다. 그런데 **아무 에러도 안 난다** — 조용히 사라지는 종류의 사고다.

  ⚠️ 그래서 기본값을 뒤집었다. **비프로덕션이라고 확신할 때만 막는다.**
     환경 신호가 없으면 운영으로 본다.

  프리뷰가 색인될 위험은 이 뒤집기로 커지지 않는다 — 배포 URL 은 Vercel 배포 보호가
  이미 302 로 막고 있고(실측: 프로덕션 배포 URL 도 인증 리다이렉트), Vercel 이 프리뷰
  응답에 `X-Robots-Tag: noindex` 를 스스로 붙인다. 반면 잘못 막았을 때의 손해는 전부다.

  📌 `NEXT_PUBLIC_ENV` 를 Vercel Production/Preview 스코프에 각각 넣어 두면 신호가
     명시적이 된다(권장). 다만 **이 파일이 거기에 의존하지는 않는다** — 의존하게 두면
     같은 사고가 다시 난다.
*/

/**
 * 크롤을 막을 것인가.
 *
 * 신호를 **둘** 본다. `APP_ENV` 하나로는 "내 노트북" 과 "시스템 환경변수가 꺼진 Vercel
 * 운영 빌드" 를 구분할 수 없기 때문이다 — 둘 다 "development" 로 떨어진다. 그게 이번
 * 사고의 정확한 원인이었다.
 *
 *   · `APP_ENV === "preview"`  — 프리뷰라고 **명시적으로** 말해 준 경우
 *   · `NODE_ENV !== "production"` — 개발 서버. `next build` 는 Vercel 시스템 변수와
 *     무관하게 항상 NODE_ENV=production 이라, 운영 빌드가 여기 걸리는 일이 없다
 */
function shouldBlockAll(): boolean {
  if (APP_ENV === "preview") return true;
  return process.env.NODE_ENV !== "production";
}

export default function robots(): MetadataRoute.Robots {
  if (shouldBlockAll()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  /*
    공개해도 되는 것과 아닌 것. 사람이 보는 검색엔진이든 AI 크롤러든 같은 선을 적용한다.

    🔴 **2026-09-21 — 회원 전용 지면을 여기서 뺐다.** 구글이 경고를 보냈다:
       "색인이 생성되었으나 robots.txt에 의해 차단됨".

       robots.txt 로 막는 것은 **색인을 막는 수단이 아니다.** 크롤러를 못 들어오게 할 뿐이라,
       어디선가 링크를 발견하면 구글은 **내용을 못 본 채 주소만 들고 색인해 버린다.**
       그리고 막혀 있으니 우리가 붙인 `noindex` 를 **읽을 기회도 없다** — 빼달라고 적어 둔
       쪽지를 문 안에 두고 문을 잠근 꼴이다.

       그래서 뒤집었다. 회원 전용 지면은 **크롤을 허용하고 noindex 를 내보낸다.**
       크롤러가 들어와서 그 지시를 읽고 색인에서 뺀다. 그게 유일하게 작동하는 순서다.
       (/chat · /bookings · /favorites · /notifications · /settings 에 noindex 를 달았다)

       크롤 예산이 아깝지 않다 — 공개 지면이 1,677개인데 이쪽은 손에 꼽는다.

    ⚠️ 아래 넷은 **계속 막는다.** 색인 문제가 아니라 크롤러를 들이고 싶지 않은 곳이다.
       /admin·/studio 는 익명에 307(로그인으로)이고, /api·/auth 는 404 + noindex 라
       어차피 색인될 것이 없다.
  */
  const DISALLOW = ["/admin", "/studio", "/api", "/auth"];

  // 이름을 붙여 두는 크롤러들. `*` 규칙으로도 이미 허용되지만 **명시해 둔다** —
  // 나중에 `*` 를 조이는 순간 이쪽 노출이 조용히 사라지는 사고를 막는다.
  // 차단 경로는 `*` 와 동일하게 유지한다: AI 든 검색엔진이든 같은 선을 적용한다.
  const NAMED_AGENTS = [
    "GPTBot",           // OpenAI — ChatGPT 검색
    "OAI-SearchBot",    // OpenAI 검색 인덱스
    "PerplexityBot",
    "ClaudeBot",        // Anthropic
    "Google-Extended",  // 구글 Gemini·AI 개요 학습/인용
    "Applebot-Extended",
    // 네이버. 한국 스냅 검색의 본진이라 AI 크롤러와 같은 이유로 명시해 둔다 —
    // `*` 를 조이는 순간 조용히 빠지는 걸 막는다. (2026-09-17 네이버 서치어드바이저
    // 실시간 조회가 "robots.txt 가 존재하지 않습니다" 로 나온 적이 있는데, Yeti UA 로
    // 직접 받아 보면 200 이라 차단은 아니었다. 그래도 명시가 없는 건 남겨 둘 이유가 없다)
    "Yeti",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...NAMED_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
