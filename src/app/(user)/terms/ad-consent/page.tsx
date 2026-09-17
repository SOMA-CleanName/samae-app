import type { Metadata } from "next";
import { AD_CONSENT_VERSION } from "@/lib/ad-consent";
import { AdConsentBody } from "@/components/legal/docs/AdConsentBody";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "광고 소재 사용 동의 | 사매",
  description: "작가 포트폴리오 사진을 사매 홍보·광고에 사용하는 범위와 조건 안내.",
};

// 작가가 포트폴리오 등록 시 체크하는 '광고 소재 사용 동의'의 전문.
// 문구 원본은 lib/ad-consent.ts — 여기서 재사용해 화면과 저장 버전이 어긋나지 않게 한다.
export default function AdConsentTermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 font-kr">
      <h1 className="text-2xl font-bold tracking-tight">사매 광고 소재 사용 동의</h1>
      <p className="mt-2 text-sm text-muted">
        버전 {AD_CONSENT_VERSION} · 포트폴리오 등록·편집 화면에서 선택 항목으로 동의합니다.
      </p>

      <div className="mt-8">
        <AdConsentBody />
      </div>

      {/* 동의 지면에도 사업자 정보·처리방침에 닿을 길을 둔다 */}
      <SiteFooter />
    </main>
  );
}
