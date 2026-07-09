// /my-inquiries 로딩 스켈레톤 — 실제 레이아웃(제목 + 카드: 상단 히어로 사진 + 제목 + 2열 상세)과 동일 구조.
export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 font-kr">
      <div className="h-7 w-28 animate-pulse rounded bg-fg/[0.08]" />
      <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-fg/[0.06]" />

      <ul className="mt-4 space-y-3.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line">
            {/* 히어로 사진 */}
            <div className="h-44 w-full animate-pulse bg-fg/[0.08]" />
            <div className="p-3.5">
              {/* 제목 */}
              <div className="h-5 w-32 animate-pulse rounded bg-fg/[0.08]" />
              {/* 2열 상세 */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
                {Array.from({ length: 2 }).map((__, c) => (
                  <div key={c}>
                    <div className="h-3 w-10 animate-pulse rounded bg-fg/[0.06]" />
                    <div className="mt-1.5 h-3.5 w-24 max-w-full animate-pulse rounded bg-fg/[0.06]" />
                  </div>
                ))}
              </div>
              {/* 남긴 연락처 박스 */}
              <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2.5">
                <div className="h-3 w-16 animate-pulse rounded bg-fg/[0.07]" />
                <div className="mt-1.5 h-3.5 w-40 max-w-full animate-pulse rounded bg-fg/[0.07]" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
