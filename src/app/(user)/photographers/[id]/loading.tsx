// 작가 프로필 로딩 — 실제 레이아웃(데스크탑 2컬럼: 좌 sticky 프로필 / 우 하이라이트+포트폴리오)에 맞춤
export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-2.5 py-2.5 font-kr sm:px-4 sm:py-4">
      <div className="md:flex md:items-start md:gap-10">
        {/* 좌: 프로필 (모바일 가로 / 데스크탑 세로 sticky 사이드바) */}
        <aside className="md:w-72 md:shrink-0 md:sticky md:top-6 md:self-start">
          <div className="flex items-center gap-4 md:flex-col md:items-start md:gap-0">
            <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-surface-2 md:h-24 md:w-24" />
            <div className="min-w-0 space-y-2 md:mt-4">
              <div className="h-6 w-32 animate-pulse rounded bg-surface-2" />
              <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
          {/* 태그 */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-6 w-16 animate-pulse rounded-full bg-surface-2" />
            ))}
          </div>
          {/* CTA */}
          <div className="mt-4 h-11 w-full animate-pulse rounded-full bg-surface-2" />
        </aside>

        {/* 우: 하이라이트 원형 + 포트폴리오 그리드 */}
        <section className="mt-5 md:mt-0 md:min-w-0 md:flex-1">
          <div className="flex gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-surface-2" />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square w-full animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
