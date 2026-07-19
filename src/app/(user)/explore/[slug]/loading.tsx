// 카테고리 몰입 뷰(풀스크린)와 같은 레이아웃의 로딩 스켈레톤 —
// 상단바 · 중앙 큰 사진 자리 · 하단 필름스트립(66px)을 그대로 흉내.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* 상단 — 뒤로 + 제목 자리 */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2.5 px-3 pb-6 pt-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/10" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-28 animate-pulse rounded bg-white/10" />
          <div className="h-2 w-10 animate-pulse rounded bg-white/10" />
        </div>
      </div>

      {/* 중앙 — 큰 사진 자리 */}
      <div className="absolute inset-x-0 top-0 bottom-[66px] grid place-items-center">
        <div className="h-[64%] w-[80%] animate-pulse rounded-2xl bg-white/[0.06]" />
      </div>

      {/* 하단 — 필름스트립 자리 */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex h-[66px] gap-1.5 px-2.5 pb-2.5 pt-2">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="h-[46px] w-[32px] shrink-0 animate-pulse rounded-md bg-white/10" />
        ))}
      </div>
    </div>
  );
}
