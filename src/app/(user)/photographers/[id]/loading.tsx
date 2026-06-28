// 작가 프로필 로딩 — 아바타/하이라이트/포트폴리오 그리드 자리
export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-2.5 py-2.5 font-kr sm:px-4 sm:py-4">
      {/* 헤더 — 아바타 + 이름 + 버튼 */}
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 animate-pulse rounded-full bg-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-40 animate-pulse rounded bg-surface-2" />
          <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-9 w-20 animate-pulse rounded-full bg-surface-2" />
      </div>

      {/* 하이라이트 원형 */}
      <div className="mt-6 flex gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 w-16 shrink-0 animate-pulse rounded-full bg-surface-2" />
        ))}
      </div>

      {/* 포트폴리오 그리드 */}
      <div className="mt-6 grid grid-cols-3 gap-1 sm:gap-2">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square w-full animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
