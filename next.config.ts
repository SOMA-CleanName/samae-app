import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage 공개 URL 허용 (실제 프로젝트 호스트로 교체됨)
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  experimental: {
    // 서버액션 본문 한계 상향(기본 1MB) — 문의 레퍼런스 이미지 첨부 대응.
    // 단, Vercel 함수 플랫폼 한계(~4.5MB)가 있어 클라이언트 리사이즈와 함께 사용.
    serverActions: { bodySizeLimit: "4mb" },
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

export default nextConfig;
