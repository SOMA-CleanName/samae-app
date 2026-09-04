// 매거진 로딩 — 실제 /explore 지면과 1:1로 맞춘 골격.
// 순서: 표제(MAGAZINE + 계정 버튼) → 러닝 밴드 → 01 ARTICLES(카드 덱 + 점) →
//       02 TREND(도판 격자) → 03 SPOTS(티켓 레일) → 04 Q&A(목차 리스트).
// 색은 카드 플레이스홀더(bg-fg/[0.06])와 동일하게 맞춰 전환을 매끄럽게.
const pulse = "animate-pulse bg-fg/[0.06]";

// 섹션 머리 — 타이틀 + 밑 강조선(SectionHead 규격).
function SectionTitle({ w }: { w: string }) {
  return (
    <div className="mb-4 px-1">
      <div className={`h-6 rounded ${pulse}`} style={{ width: w }} />
      <div className="mt-1 h-[3px] bg-fg/[0.12]" style={{ width: w }} />
    </div>
  );
}

export default function Loading() {
  return (
    <main className="min-h-dvh bg-bg font-kr">
      {/* 표제 — 큰 워드마크 자리 + 오른쪽 위 계정 버튼 */}
      <div className="relative mx-auto w-full max-w-[1280px] px-4 pt-2 sm:px-6 sm:pt-3">
        <div className={`absolute right-4 top-2 h-9 w-9 rounded-full sm:right-6 sm:top-3 ${pulse}`} />
        <div className={`mt-3 h-[clamp(2rem,9vw,5.4rem)] w-[72%] max-w-xl rounded ${pulse}`} />
      </div>

      {/* 러닝 밴드 */}
      <div className="mt-5 flex items-center gap-6 overflow-hidden border-y border-line px-6 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`h-3 w-20 shrink-0 rounded ${pulse}`} />
        ))}
      </div>

      <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 pt-7 sm:px-6">
        {/* 01 ARTICLES — 카드 덱(가운데 한 장) + 점 인디케이터 */}
        <SectionTitle w="96px" />
        <div className="-mx-4 flex justify-center gap-3 overflow-hidden sm:-mx-6 sm:justify-start sm:px-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={`aspect-[4/5] w-[clamp(15rem,74vw,19rem)] shrink-0 rounded-2xl sm:w-80 ${pulse}`}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`h-1.5 w-1.5 rounded-full ${pulse}`} />
          ))}
        </div>

        {/* 02 TREND — 3:4 도판 격자 + 캡션 줄 */}
        <div className="mt-20">
          <SectionTitle w="72px" />
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-5 sm:grid-cols-4 sm:gap-x-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={i >= 2 ? "hidden sm:block" : undefined}>
                <div className={`aspect-[3/4] w-full rounded-lg ${pulse}`} />
                <div className={`mt-2 h-3 w-full rounded ${pulse}`} />
              </div>
            ))}
          </div>
        </div>

        {/* 03 SPOTS — 가로 티켓 레일 */}
        <div className="mt-20">
          <SectionTitle w="64px" />
          <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:-mx-6 sm:px-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className={`aspect-[4/3] w-[70vw] max-w-80 shrink-0 rounded-2xl ${pulse}`} />
            ))}
          </div>
        </div>

        {/* 04 Q&A — 목차 리스트 */}
        <div className="mt-20">
          <SectionTitle w="56px" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`h-5 rounded ${pulse}`} style={{ width: `${88 - i * 7}%` }} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
