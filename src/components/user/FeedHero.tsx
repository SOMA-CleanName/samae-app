// 피드 최상단 히어로 — 로고 워드마크 + 태그라인 + 헤드라인. 홈·카테고리 페이지 공용.
export function FeedHero() {
  return (
    <div className="mx-auto max-w-screen-2xl px-1 pb-6 pt-3 sm:pb-9 sm:pt-7">
      {/* 로고 워드마크 + 태그라인 (브랜드 일관 — font-display italic text-brand) */}
      <div className="flex items-center gap-2.5">
        <span className="font-display text-2xl italic leading-none text-brand sm:text-[1.7rem]">samae</span>
        <span className="h-3.5 w-px bg-line-strong" />
        <span className="text-caption font-medium tracking-wide text-muted">사진으로 고르는 촬영</span>
      </div>
      {/* 헤드라인 — 2줄 에디토리얼, 핵심어 브랜드 강조. 폰트 뷰포트 유동(clamp) + 줄바꿈 금지 → 모든 기기에서 딱 2줄. */}
      <h1 className="mt-3.5 whitespace-nowrap text-[clamp(1.2rem,6vw,2.6rem)] font-semibold leading-[1.15] tracking-tight text-fg sm:leading-[1.12]">
        원하는 사진을 고르고,
        <br />
        <span className="text-brand">그 작가</span>에게 촬영을 문의하세요.
      </h1>
    </div>
  );
}
