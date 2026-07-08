import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage 공개 URL 허용 (실제 프로젝트 호스트로 교체됨)
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
    // Vercel 이미지 최적화(/_next/image) 비활성화.
    // 홈 한 화면에서만 변환 요청이 500+개라 플랜 할당량을 소진 → 일부 이미지가
    // 402(OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED)로 막혀 무한로딩되던 문제.
    // 이미지는 전부 업로드 시 생성한 500px 썸네일(thumb_url, ~30~80KB)이라
    // Supabase CDN에서 그대로 서빙해도 충분하다(추가 변환 불필요·비용 0).
    unoptimized: true,
  },
  experimental: {
    // 서버액션 본문 한계 상향(기본 1MB) — 문의 레퍼런스 이미지 첨부 대응.
    // 단, Vercel 함수 플랫폼 한계(~4.5MB)가 있어 클라이언트 리사이즈와 함께 사용.
    serverActions: { bodySizeLimit: "4mb" },
    // 클라이언트 라우터 캐시 — 동적 페이지도 180초간 재사용.
    // 홈↔탐색 탭 전환마다 서버 재조회(스켈레톤·재셔플)되던 것을 없애, 최근 본 피드를 즉시 표시.
    staleTimes: { dynamic: 180 },
  },
  // 옛 배포 도메인 → 정식 도메인(apex samae.ai) 301 통합 (SEO 중복 방지).
  // apex↔www 정규화는 Vercel 도메인 설정이 단독으로 처리한다(코드에서 www 를 건드리면
  // Vercel 의 Primary 방향과 충돌해 무한 리다이렉트가 발생하므로 절대 추가하지 말 것).
  // 프리뷰 배포(samae-official-git-*.vercel.app)는 정확히 일치하지 않아 영향 없음.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "samae-official.vercel.app" }],
        destination: "https://samae.ai/:path*",
        permanent: true,
      },
    ];
  },
};

// Sentry 래핑 — 소스맵 업로드는 SENTRY_AUTH_TOKEN(+org/project) 있을 때만 동작(없으면 자동 스킵).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
