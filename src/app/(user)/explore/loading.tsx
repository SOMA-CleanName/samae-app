// 탐색 로딩 — 재구성된 매거진 레이아웃(헤더 + 티커 + 무빙커버 + 인기 카테고리 그리드 + 새 스냅 레일 + 취향테스트)
// 골격·크기에 맞춤. 실제 콘텐츠와 자리·비율을 일치시켜 전환을 매끄럽게.
const pulse = "animate-pulse rounded bg-surface-2";

export default function Loading() {
  return (
    <section className="font-kr">
      <div className="px-2.5 pb-4 pt-3 sm:px-4 sm:pt-4">
        {/* 헤더 — 타이틀 + 라이브 뱃지 */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className={`h-7 w-40 ${pulse}`} />
          <div className={`h-7 w-28 shrink-0 rounded-full ${pulse}`} />
        </div>

        {/* 트렌딩 태그 티커 */}
        <div className="mt-4 flex gap-2 overflow-hidden px-1">
          {[20, 16, 24, 14, 20, 18].map((w, i) => (
            <div key={i} className={`h-8 shrink-0 rounded-full ${pulse}`} style={{ width: `${w * 5}px` }} />
          ))}
        </div>

        {/* 무빙 커버 */}
        <div className={`mt-4 aspect-[4/5] w-full rounded-2xl ${pulse}`} />

        {/* 인기 카테고리 그리드 */}
        <div className="mt-8">
          <div className={`mb-3 ml-1 h-6 w-32 ${pulse}`} />
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`col-span-2 aspect-[16/9] rounded-2xl ${pulse}`} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`aspect-square rounded-2xl ${pulse}`} />
            ))}
          </div>
          <div className={`mt-3 h-11 w-full rounded-full ${pulse}`} />
        </div>

        {/* 새로 올라온 스냅 레일 */}
        <div className="mt-8">
          <div className={`mb-3 ml-1 h-6 w-36 ${pulse}`} />
          <div className="-mx-2.5 flex gap-2.5 overflow-hidden px-2.5 sm:-mx-4 sm:px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`aspect-[3/4] w-36 shrink-0 rounded-2xl ${pulse}`} />
            ))}
          </div>
        </div>

        {/* 취향 테스트 카드 */}
        <div className={`mt-8 h-44 w-full rounded-2xl ${pulse}`} />
      </div>
    </section>
  );
}
