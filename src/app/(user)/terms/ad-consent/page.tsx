import type { Metadata } from "next";
import { AD_CONSENT_TERMS, AD_CONSENT_VERSION, AD_CONSENT_WARRANTY } from "@/lib/ad-consent";

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

      <section className="mt-8">
        <h2 className="text-base font-semibold">1. 동의하면 무엇에 쓰이나요</h2>
        <dl className="mt-3 space-y-2.5">
          {AD_CONSENT_TERMS.map((t) => (
            <div key={t.label} className="flex gap-3 text-sm">
              <dt className="w-12 shrink-0 font-semibold text-fg">{t.label}</dt>
              <dd className="text-fg/75">{t.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">2. 작가님이 보증하는 내용</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/75">{AD_CONSENT_WARRANTY}</p>
        <p className="mt-2 text-sm leading-relaxed text-fg/60">
          사진의 저작권은 작가님에게 있지만, <b className="text-fg/80">사진 속 인물의 초상권</b>은
          작가님이 대신 처분할 수 없습니다. 광고는 상업적 이용에 해당해 피사체의 별도 동의가
          필요하므로, 동의를 받지 못한 사진이 포함된 포트폴리오에는 체크하지 말아주세요.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">3. 철회</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/75">
          스튜디오 → 포트폴리오 → 해당 게시물 편집에서 체크를 해제하면 철회됩니다. 철회 시 신규
          사용은 즉시 중단되며, 이미 집행 중인 광고는 소재 교체에 걸리는 합리적인 기간 내에
          중단합니다. 철회 이전에 이미 게시·배포된 광고물의 회수까지 보장되지는 않습니다.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold">4. 동의 기록</h2>
        <p className="mt-2 text-sm leading-relaxed text-fg/75">
          동의·철회 시점과 동의한 문구의 버전을 기록합니다. 문구가 변경되면 새 버전으로 다시
          안내하며, 이전 동의는 그 당시 버전의 내용을 따릅니다.
        </p>
      </section>

      <p className="mt-10 text-xs text-faint">
        문의: 스튜디오 하단 고객센터 또는 사매 운영팀
      </p>
    </main>
  );
}
