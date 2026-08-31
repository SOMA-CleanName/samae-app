import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { isProd } from "@/lib/env";

// 검색엔진 크롤링 규칙 — 공개 콘텐츠만 허용, 거래·관리·인증 경로는 차단.
export default function robots(): MetadataRoute.Robots {
  // 비프로덕션(프리뷰·로컬)은 전체 크롤 차단 — 프리뷰 배포가 검색에 중복 노출되지 않게. (docs/19)
  if (!isProd) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  // 공개해도 되는 것과 아닌 것. 사람이 보는 검색엔진이든 AI 크롤러든 같은 선을 적용한다.
  const DISALLOW = [
    "/admin", "/studio", "/api", "/auth",
    "/chat", "/bookings", "/inquiry", "/login", "/signup",
    "/my-inquiries", "/favorites", "/notifications", "/settings",
  ];

  // AI 답변(ChatGPT·Perplexity·Claude·구글 AI 개요)에 인용되려면 해당 크롤러가 읽을 수 있어야 한다.
  // `*` 규칙으로도 이미 허용되지만 **명시해 둔다** — 나중에 `*` 를 조이는 순간
  // AI 노출이 조용히 사라지는 사고를 막는다. 차단 경로는 `*` 와 동일하게 유지한다.
  const AI_AGENTS = [
    "GPTBot",           // OpenAI — ChatGPT 검색
    "OAI-SearchBot",    // OpenAI 검색 인덱스
    "PerplexityBot",
    "ClaudeBot",        // Anthropic
    "Google-Extended",  // 구글 Gemini·AI 개요 학습/인용
    "Applebot-Extended",
  ];

  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_AGENTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
