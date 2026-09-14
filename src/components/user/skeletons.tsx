// 공용 로딩 스켈레톤 — 페이지 전환 시 즉시 노출해 "빈 멈춤"을 없앤다.
// 서버 컴포넌트(상태 없음), 다크모드 토큰(bg-surface-2) 사용.

const MASONRY_HEIGHTS = [180, 240, 200, 280, 160, 220, 260, 190, 230, 170, 250, 210];

/**
 * 홈 전용 스켈레톤 — 실제 홈의 층 순서를 그대로 따라간다.
 *
 * 예전에는 홈도 `MasonrySkeleton` 하나였다. 그런데 홈 위에는 사진 격자가 아니라
 * **로고 줄 · 검색 · 배너 · 바로가기 · 무드**가 깔려 있어서, 로딩 중엔 사진으로 꽉 찼다가
 * 렌더되는 순간 그 다섯 층이 한꺼번에 끼어들며 화면이 통째로 밀렸다.
 *
 * 그 뒤로도 어긋나 있었다. 층 **순서**는 맞췄는데 **높이와 층 사이 간격**이 눈대중이라,
 * 아래로 갈수록 오차가 쌓여 "전체 사진" 머리에서 158px 이 밀렸다(실측 2026-09-11).
 *
 * 아래 숫자는 **모바일 390px 에서 실제로 잰 값**이다. 층을 건드리면 여기도 같이 고쳐야 한다.
 *
 *   2026-09-12 기준 — 로고·검색·프로필을 한 줄로 합치고, 배너를 2:1 로 낮추고,
 *   무드 라벨을 사진 안으로 넣고 [모두 보기] 를 제목 줄로 흡수한 뒤:
 *
 *     y=16 검색줄 42 → 66 배너 195 → 273 칩 75 → 372 무드머리 34 → 416 무드카드(정사각)
 *        → 532 전체머리 34 → 602 격자      (첫 사진 y≈602, 전에는 800)
 *
 * sm 이상은 배너 비율과 카드 크기만 대략 맞춘다 — 데스크톱은 첫 화면이 길어
 * 같은 크기의 어긋남이 훨씬 덜 보인다.
 */
export function HomeSkeleton() {
  return (
    <section className="px-2.5 pb-2.5 pt-3.5 font-kr sm:px-4 sm:pt-5 sm:pb-4">
      {/* 로고 ─ 검색 ─ 프로필 **한 줄** (2026-09-12 병합). 전에는 로고 줄과 검색 줄이
          따로여서 115px 이었다. */}
      <div className="mb-3.5 flex items-center gap-2">
        <div className="h-7 w-20 shrink-0 animate-pulse rounded bg-surface-2" />
        <div className="h-[42px] min-w-0 flex-1 animate-pulse rounded-xl bg-surface-2" />
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
      </div>

      {/* 배너 — 모바일 2:1 (390 에서 195px), 데스크톱 21:9. 아래 여백까지 맞춰야 칩이 안 밀린다 */}
      <div className="-mx-2.5 mb-3 aspect-[2/1] animate-pulse bg-surface-2 sm:-mx-4 sm:aspect-[21/9] sm:max-h-[520px]" />

      {/* 바로가기 칩 — 아이콘 + 라벨 두 줄이라 75px */}
      <div className="mb-6 flex h-[75px] items-stretch gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[71px] shrink-0 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>

      {/* 무드 머리 — 규칙선(2px) + 아래 8px + 제목 24px = 34px.
          오른쪽 [N개 모두] 토글은 이 줄 안에 있다(전폭 버튼은 없어졌다). */}
      <div className="mb-2.5 flex items-end justify-between">
        <div>
          <div className="mb-2 h-[2px] w-6 bg-surface-2" />
          <div className="h-6 w-24 animate-pulse rounded bg-surface-2" />
        </div>
        <div className="h-6 w-16 animate-pulse rounded-full bg-surface-2" />
      </div>

      {/* 무드 카드 — 정사각. 라벨이 사진 안으로 들어가 아래 별도 줄이 없다 */}
      <div className="mb-6 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-surface-2" />
        ))}
      </div>

      {/* 전체 사진 머리 + 격자 */}
      <div className="mb-2.5">
        <div className="mb-2 h-[2px] w-6 bg-surface-2" />
        <div className="h-6 w-16 animate-pulse rounded bg-surface-2" />
      </div>
      <div className="mx-auto max-w-screen-2xl columns-2 gap-2.5 sm:columns-3 sm:gap-4 md:columns-4 lg:columns-5 xl:columns-6 [&>*]:mb-2.5 sm:[&>*]:mb-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="w-full animate-pulse bg-surface-2"
            style={{ height: MASONRY_HEIGHTS[i % MASONRY_HEIGHTS.length] }}
          />
        ))}
      </div>
    </section>
  );
}

// 피드/갤러리(메이슨리) 스켈레톤 — 탐색 상세·카테고리·찜
export function MasonrySkeleton({ count = 16 }: { count?: number }) {
  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      {/* 실제 그리드(ExploreGallery)는 폭 기반 JS 컬럼 + gap-2.5/sm:gap-4, 정사각(라운드 없음) 카드.
          데스크탑에서 컬럼 수·간격이 맞도록 반응형 columns 를 넉넉히 올림. */}
      <div className="mx-auto max-w-screen-2xl columns-2 gap-2.5 sm:columns-3 sm:gap-4 md:columns-4 lg:columns-5 xl:columns-6 [&>*]:mb-2.5 sm:[&>*]:mb-4">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-full animate-pulse bg-surface-2"
            style={{ height: MASONRY_HEIGHTS[i % MASONRY_HEIGHTS.length] }}
          />
        ))}
      </div>
    </section>
  );
}

// 추천(상세 하단 탐색 사진) 메이슨리 스켈레톤 — 상세 loading + 추천 Suspense 공용
const RECS_HEIGHTS = [200, 260, 180, 240, 220, 280, 190, 250, 210, 270, 200, 240];
export function RecsSkeleton({ count = 10 }: { count?: number }) {
  return (
    // 바깥 여백은 호출부가 준다. 여기서 mt-6 을 들고 있었더니, 실제 추천(PhotoMasonry)에는
    // 그 여백이 없어서 로드가 끝나는 순간 그리드가 24px 위로 뛰었다.
    <section>
      {/* 실제 추천(PhotoMasonry)은 flex gap-3 · 폭 기반 JS 컬럼 · 정사각(라운드 없음).
          gap·컬럼 수를 맞춰 로드 시 튐 최소화. */}
      <div className="columns-2 gap-3 sm:columns-3 md:columns-4 lg:columns-6 [&>*]:mb-3">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="w-full animate-pulse bg-surface-2"
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
