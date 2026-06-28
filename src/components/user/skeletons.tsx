// 공용 로딩 스켈레톤 — 페이지 전환 시 즉시 노출해 "빈 멈춤"을 없앤다.
// 서버 컴포넌트(상태 없음), 다크모드 토큰(bg-surface-2) 사용.

const MASONRY_HEIGHTS = [180, 240, 200, 280, 160, 220, 260, 190, 230, 170, 250, 210];

// 피드/갤러리(메이슨리) 스켈레톤 — 홈·탐색 상세·카테고리·찜
export function MasonrySkeleton({ count = 12 }: { count?: number }) {
  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      <div className="mx-auto max-w-screen-2xl columns-2 gap-2 sm:columns-3 lg:columns-4 [&>*]:mb-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded-xl bg-surface-2"
            style={{ height: MASONRY_HEIGHTS[i % MASONRY_HEIGHTS.length] }}
          />
        ))}
      </div>
    </section>
  );
}

// 추천(상세 하단 탐색 사진) 메이슨리 스켈레톤 — 상세 loading + 추천 Suspense 공용
const RECS_HEIGHTS = [200, 260, 180, 240, 220, 280, 190, 250, 210, 270, 200, 240];
export function RecsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <section className="mt-6">
      <div className="columns-2 gap-2 sm:columns-3 md:columns-4 [&>*]:mb-2">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded-xl bg-surface-2"
            style={{ height: RECS_HEIGHTS[i % RECS_HEIGHTS.length] }}
          />
        ))}
      </div>
    </section>
  );
}

// 목록(행) 스켈레톤 — 예약·채팅·알림
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="mx-auto max-w-2xl px-3.5 py-6 font-kr sm:px-5">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border border-line p-3"
          >
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
