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
 * 빠진 게 셋이었다 — 배너 아래 여백(12 vs 실제 54), 무드 밑 [모두 보기] 버튼(통째로 없음),
 * 칩 높이(64 vs 75).
 *
 * 그래서 아래 숫자는 **모바일 390px 에서 실제로 잰 값**이다. 층을 건드리면 같이 고쳐야 한다.
 *
 *   y=10  로고줄 39 → 61 검색 42 → 115 배너 219 → 388 칩 75 → 487 무드머리 34
 *       → 531 무드카드 111 → 723 전체머리 34 → 767 격자
 *
 * sm 이상은 배너 비율과 카드 크기만 대략 맞춘다 — 데스크톱은 첫 화면이 길어
 * 같은 크기의 어긋남이 훨씬 덜 보인다.
 */
export function HomeSkeleton() {
  return (
    <section className="px-2.5 pb-2.5 pt-2.5 font-kr sm:px-4 sm:pt-4 sm:pb-4">
      {/* 로고 줄 + 프로필 버튼 — 실측 39px (로고 글자의 행높이가 아바타보다 크다) */}
      <div className="mb-3 flex h-[39px] items-center justify-between">
        <div className="h-7 w-24 animate-pulse rounded bg-surface-2" />
        <div className="h-9 w-9 animate-pulse rounded-full bg-surface-2" />
      </div>

      {/* 검색 한 줄 */}
      <div className="mb-3 h-[42px] w-full animate-pulse rounded-xl bg-surface-2" />

      {/* 배너 — 비율뿐 아니라 **아래 여백(54px)** 까지 맞춰야 칩이 안 밀린다 */}
      <div className="-mx-2.5 mb-[54px] aspect-[16/9] animate-pulse bg-surface-2 sm:-mx-4 sm:aspect-[21/9] sm:max-h-[520px]" />

      {/* 바로가기 칩 — 아이콘 + 라벨 두 줄이라 75px */}
      <div className="mb-6 flex h-[75px] items-stretch gap-2 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="w-[71px] shrink-0 animate-pulse rounded-2xl bg-surface-2" />
        ))}
      </div>

      {/* 무드 머리 — 규칙선(2px) + 아래 8px + 제목 24px = 34px */}
      <div className="mb-2.5">
        <div className="mb-2 h-[2px] w-6 bg-surface-2" />
        <div className="h-6 w-24 animate-pulse rounded bg-surface-2" />
      </div>

      {/* 무드 카드 줄 — 모바일 87×111 (4장이 살짝 넘치게 보인다) */}
      <div className="flex gap-2 overflow-hidden sm:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[111px] w-[87px] shrink-0 animate-pulse bg-surface-2 sm:h-[172px] sm:w-[158px]"
          />
        ))}
      </div>

      {/* [무드 N개 모두 보기] — 전폭 버튼. 이게 빠져 있어서 아래가 통째로 당겨졌다 */}
      <div className="mb-7 mt-3 h-[41px] w-full animate-pulse rounded-full bg-surface-2" />

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
