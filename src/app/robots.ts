import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { isProd } from "@/lib/env";

// 검색엔진 크롤링 규칙 — 공개 콘텐츠만 허용, 거래·관리·인증 경로는 차단.
export default function robots(): MetadataRoute.Robots {
  // 비프로덕션(프리뷰·로컬)은 전체 크롤 차단 — 프리뷰 배포가 검색에 중복 노출되지 않게. (docs/19)
  if (!isProd) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/studio", "/api", "/auth", "/chat", "/bookings", "/inquiry", "/login", "/signup"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
