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
};

export default nextConfig;
