// 탐색(카테고리) 로딩 — 섹션 제목 + 카드 줄 자리
export default function Loading() {
  return (
    <div className="mx-auto max-w-screen-2xl px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      {Array.from({ length: 4 }).map((_, s) => (
        <div key={s} className="mb-7">
          <div className="mb-3 h-5 w-28 animate-pulse rounded bg-surface-2" />
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] w-full animate-pulse rounded-xl bg-surface-2" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
