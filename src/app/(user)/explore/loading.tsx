// 탐색 로딩 — 재구성된 매거진 레이아웃에 맞춘 골격.
// 색은 실제 카드 플레이스홀더(bg-fg/[0.06])와 동일하게 맞춰 전환을 매끄럽게.
const pulse = "animate-pulse bg-fg/[0.06]";

export default function Loading() {
  return (
    <section className="font-kr">
      <div className="px-2.5 pb-4 pt-3 sm:px-4 sm:pt-4">
        {/* 헤더 — 타이틀 + 라이브 뱃지 */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className={`h-7 w-40 rounded ${pulse}`} />
          <div className={`h-7 w-28 shrink-0 rounded-full ${pulse}`} />
        </div>

        {/* 트렌딩 태그 티커 */}
        <div className="mt-4 flex gap-2 overflow-hidden px-1">
          {[20, 16, 24, 14, 20, 18].map((w, i) => (
            <div key={i} className={`h-8 shrink-0 rounded-full ${pulse}`} style={{ width: `${w * 5}px` }} />
          ))}
        </div>

        {/* 무빙 커버 — 상단 도트 + 각진 커버(가운데 80%, 양옆 peek) */}
        <div className="mt-4">
          <div className="mb-2 flex justify-center gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`h-2 w-2 rounded-full ${pulse}`} />
            ))}
          </div>
          <div className="relative aspect-[4/5] w-full">
            <div className={`absolute inset-y-0 left-1/2 w-[80%] -translate-x-1/2 ${pulse}`} />
          </div>
        </div>

        {/* 중간 탭 바 */}
        <div className="mt-6 flex gap-5 border-b border-line px-1 pb-2 pt-1">
          {[26, 22, 20].map((w, i) => (
            <div key={i} className={`h-4 rounded ${pulse}`} style={{ width: `${w * 4}px` }} />
          ))}
        </div>

        {/* 추천 무드 — 타이틀 + CTA + 그리드 + 더보기 */}
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-3 px-1">
            <div className={`h-6 w-28 rounded ${pulse}`} />
            <div className={`h-5 w-36 rounded-full ${pulse}`} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`col-span-2 aspect-[16/9] rounded-2xl ${pulse}`} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`aspect-square rounded-2xl ${pulse}`} />
            ))}
          </div>
          <div className={`mt-3 h-12 w-full rounded-full ${pulse}`} />
        </div>

        {/* 새로 올라온 스냅 레일 — 각진, 큰 카드 */}
        <div className="mt-16">
          <div className={`mb-3 ml-1 h-6 w-36 rounded ${pulse}`} />
          <div className="-mx-2.5 flex gap-2.5 overflow-hidden px-2.5 sm:-mx-4 sm:px-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`aspect-[3/4] w-[54vw] max-w-72 shrink-0 ${pulse}`} />
            ))}
          </div>
        </div>

        {/* 내 취향 테스트 — 타이틀 + 카드 */}
        <div className="mt-16">
          <div className={`mb-3 ml-1 h-6 w-32 rounded ${pulse}`} />
          <div className={`h-44 w-full rounded-2xl ${pulse}`} />
        </div>

        {/* 하단 여백 */}
        <div className="h-48" />
      </div>
    </section>
  );
}
