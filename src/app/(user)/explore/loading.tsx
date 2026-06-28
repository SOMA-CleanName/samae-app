// 탐색(카테고리) 로딩 — 실제 레이아웃(제목 + 섹션별 헤더 + 저스티파이드 행) 골격·크기에 맞춤.
export default function Loading() {
  return (
    <section className="font-kr">
      <div className="space-y-7 px-2.5 pb-2.5 pt-2.5 sm:px-4 sm:pt-4 sm:pb-4">
        {/* "탐색" 타이틀 자리 */}
        <div className="h-7 w-16 animate-pulse rounded bg-surface-2" />
        {Array.from({ length: 5 }).map((_, s) => (
          <div key={s}>
            {/* 섹션 헤더 — 카테고리명 + 더보기 원형 버튼 */}
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="h-6 w-28 animate-pulse rounded bg-surface-2" />
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
            </div>
            {/* 저스티파이드 행 자리 — 실제 행 높이(모바일 220 / 데스크톱 300)와 일치 */}
            <div className="h-[150px] w-full animate-pulse rounded-2xl bg-surface-2 md:h-[200px]" />
          </div>
        ))}
      </div>
    </section>
  );
}
