import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 검색엔진 크롤링 규칙 — 공개 콘텐츠만 허용, 거래·관리·인증 경로는 차단.
export default function robots(): MetadataRoute.Robots {
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
