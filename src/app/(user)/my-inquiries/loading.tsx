// /my-inquiries 로딩 스켈레톤 — 실제 레이아웃(제목 + 문의 카드: 큰 사진 + 날짜/상태 + 상세 행)과 동일 구조.
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 font-kr">
      {/* 제목 + 부제 */}
      <div className="h-7 w-28 animate-pulse rounded bg-fg/[0.08]" />
      <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-fg/[0.06]" />

      <ul className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            {/* 상단: 큰 사진 + 날짜/상태 */}
            <div className="flex items-center gap-3 p-3">
              <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-fg/[0.08]" />
              <div className="min-w-0 flex-1">
                <div className="h-4 w-52 max-w-full animate-pulse rounded bg-fg/[0.08]" />
                <div className="mt-2 h-6 w-16 animate-pulse rounded-full bg-fg/[0.06]" />
              </div>
            </div>
            {/* 상세 행들 */}
            <div className="space-y-2.5 border-t border-line px-3 py-3">
              {Array.from({ length: 5 }).map((__, r) => (
                <div key={r} className="flex gap-3">
                  <div className="h-3 w-10 shrink-0 animate-pulse rounded bg-fg/[0.06]" />
                  <div className="h-3 flex-1 animate-pulse rounded bg-fg/[0.06]" />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
