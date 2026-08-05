// 탐색 로딩 — 실제 /explore 레이아웃과 1:1로 맞춘 골격.
// 순서: 헤더 → 무빙 커버(캐러셀) → 중간 탭바 → 01 취향 테스트 → 02 추천 무드 → 03 인기 스냅.
// 색은 실제 카드 플레이스홀더(bg-fg/[0.06])와 동일하게 맞춰 전환을 매끄럽게.
const pulse = "animate-pulse bg-fg/[0.06]";

// 섹션 제목 — 실제는 '01' 이탤릭 프리픽스 + 타이틀 조합이라 두 덩이로 흉내낸다.
function SectionTitle({ w }: { w: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2 px-1">
      <div className={`h-4 w-5 rounded ${pulse}`} />
      <div className={`h-6 rounded ${pulse}`} style={{ width: w }} />
    </div>
  );
}

export default function Loading() {
  return (
    <section className="font-kr">
      <div className="mx-auto w-full max-w-4xl px-2.5 pb-4 pt-3 sm:px-4 sm:pt-4">
        {/* 헤더 — '오늘의 큐레이션' + 라이브 뱃지 */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className={`h-8 w-44 rounded ${pulse}`} />
          <div className={`h-6 w-28 shrink-0 rounded-full ${pulse}`} />
        </div>

        {/* 무빙 커버 캐러셀 — 중앙 max-w-md, 4:5 비율(각진 카드) */}
        <div className="mx-auto mt-3 w-full max-w-md">
          <div className={`aspect-[4/5] w-full ${pulse}`} />
          {/* 하단 진행 바 — 슬라이드 수만큼 */}
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`h-[3px] flex-1 rounded-full ${pulse}`} />
            ))}
          </div>
        </div>

        {/* 중간 탭바 — 실제는 sticky + 상하 여백(h-6) */}
        <div aria-hidden className="h-6" />
        <div className="-mx-2.5 border-b border-line sm:-mx-4">
          <div className="flex gap-1 px-2.5 py-2 sm:px-4">
            {[96, 72, 88].map((w, i) => (
              <div key={i} className={`h-8 rounded-full ${pulse}`} style={{ width: `${w}px` }} />
            ))}
          </div>
        </div>

        {/* 01 내 취향 테스트 */}
        <div className="mt-6">
          <SectionTitle w="112px" />
          <div className={`h-40 w-full rounded-2xl ${pulse}`} />
        </div>

        {/* 02 추천 무드 — 첫 타일 와이드(16:9) + 정사각 4개 + 더보기 */}
        <div className="mt-16">
          <SectionTitle w="88px" />
          <div className="grid grid-cols-2 gap-2.5">
            <div className={`col-span-2 aspect-[16/9] rounded-2xl ${pulse}`} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`aspect-square rounded-2xl ${pulse}`} />
            ))}
          </div>
          <div className={`mt-3 h-12 w-full rounded-full ${pulse}`} />
        </div>

        {/* 03 사매 인기 스냅 — 가로 레일(각진 카드) */}
        <div className="mt-16">
          <SectionTitle w="128px" />
          <div className="-mx-2.5 flex gap-2.5 overflow-hidden px-2.5 sm:-mx-4 sm:px-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`aspect-[3/4] w-[54vw] max-w-72 shrink-0 ${pulse}`} />
            ))}
          </div>
        </div>

        {/* 하단 여백 — 플로팅 내비에 가리지 않을 정도 */}
        <div aria-hidden className="h-20" />
      </div>
    </section>
  );
}
