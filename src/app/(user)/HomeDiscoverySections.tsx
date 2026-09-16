import {
  listPublishedExploreSections,
  rankExploreCategoriesByPopularity,
} from "@/lib/explore-db";
import {
  loadCurationSlides,
  type CurationSlide,
  type MoodGridItem,
} from "@/lib/target-categories";
import { memoTtl } from "@/lib/server-memo";
import { MoodRail, type MoodItem } from "./MoodRail";

/**
 * 홈의 사진 탐색 층 — 무한 피드 위에 얹히는 큐레이션.
 *
 * 원래 탐색 탭에 있던 것들이다. 탐색이 매거진으로 바뀌면서 사진을 다루는 건
 * 전부 홈으로 모았다. 사진을 찾는 일이 두 탭에 흩어져 있을 이유가 없다.
 *
 * ⚠️ 여기는 **짧아야 한다.** 처음 옮겼을 때 세로 캐러셀 + 2열 격자 + 카드 두 장으로
 *    피드 앞에 화면 네 장이 깔렸다. 사진을 보러 온 사람에게 그건 그냥 벽이다.
 *    지금은 가로 레일 둘뿐이다 — 취향·페르소나 진입은 위쪽 바로가기 벤토가 맡는다.
 *
 * 데이터 로딩은 탐색 탭에 있던 것을 그대로 옮겨왔다.
 *   · 세 로더는 서로 독립인데 순차 await 로 돌면 TTFB 가 2초를 넘긴다(실측). 병렬로 돈다.
 *   · 운영자 큐레이션·일간 랭킹이라 요청마다 다시 계산할 이유가 없어 60초 메모에 얹는다.
 *
 * 홈은 광고가 떨어지는 자리라, 광고·검색 진입에서는 호출부가 아예 렌더하지 않는다.
 */

/** 레일에 거는 무드 수 상한. 더 깔아 봐야 끝까지 미는 사람이 없다. */
const MAX_MOODS = 12;

export async function HomeDiscoverySections() {
  /*
    무드는 **카테고리와 무관하게 항상 전체**를 건다.

    전에는 카테고리 컨텍스트(쿠키)가 있으면 `loadMoodItemsForTarget` 으로 그 타겟에
    묶인 무드만 걸었다. 그러면 커플 지면에서 무드가 1개(데이트)만 남아 레일이
    카드 한 장짜리가 된다 — 있으나 마나다.

    지금 타겟팅 방향은 개인 스냅 하나라 무드를 카테고리로 가를 실익이 없다.
    카테고리는 **아래 피드의 필터**고, 무드는 거기서 빠져나가는 다른 문이다.
    (카테고리별로 무드를 좁히려면 무드가 카테고리마다 충분히 쌓인 뒤에 다시 본다)
  */
  const [coverCats, gridItems]: [CurationSlide[], MoodGridItem[]] = await Promise.all([
    // 오늘의 큐레이션 — 운영자가 무드마다 골라 둔 3컷. 여기선 순서·표식으로만 쓴다.
    memoTtl("explore:cover:all", 60_000, () => loadCurationSlides(null)),

    // 무드 — 전체 공개 무드를 인기순으로
    memoTtl("explore:grid:all", 60_000, async () =>
      (await listPublishedExploreSections(10, await rankExploreCategoriesByPopularity()))
        .filter((s) => s.photos.length >= 1)
        .map((s) => ({
          slug: s.category.slug,
          title: s.category.title,
          subtitle: s.category.subtitle,
          // 미리보기 지정 1번 → 담긴 첫 장 (요청마다 바뀌지 않게 고정)
          // 87px 카드라 썸네일로 충분하다 — 원본을 걸면 852KB 를 받는다(실측)
          url: s.photos[0].thumb_url ?? s.photos[0].src_url,
        }))
    ),
  ]);
  /*
    인기 스냅은 여기서 안 읽는다.
    섹션이 탐색 탭으로 옮겨간 뒤에도 "비었는지" 검사 하나 때문에 사진 500장 +
    신호 테이블 셋을 매 홈 렌더마다 훑고 있었다. 지금 이 컴포넌트가 그리는 건
    무드뿐이라 무드로만 판단하면 된다.
  */

  /*
    큐레이션과 무드를 한 레일로 합친다.

    운영자 큐레이션은 버리지 않고 **순서와 표식**으로 살린다. 큐레이션한 무드가
    앞에 오고 ✳ 가 붙는다. 커버는 큐레이션의 첫 컷을 우선 쓴다 — 운영자가 고른 컷이
    인기순 첫 장보다 그 무드를 잘 대표한다.
  */
  const bySlug = new Map<string, MoodItem>();
  for (const c of coverCats) {
    const cover = c.shots[0]?.url;
    if (!cover) continue;
    bySlug.set(c.slug, { slug: c.slug, title: c.title, url: cover, curated: true });
  }
  for (const g of gridItems) {
    if (bySlug.has(g.slug)) continue;
    bySlug.set(g.slug, { slug: g.slug, title: g.title, url: g.url });
  }
  const moods = [...bySlug.values()]
    .sort((a, b) => Number(b.curated ?? false) - Number(a.curated ?? false))
    .slice(0, MAX_MOODS);

  if (moods.length === 0) return null;

  /*
    섹션 머리("무드로 보기")는 여기서 그리지 않는다 — `MoodRail` 이 그린다.
    펼침 토글이 그 줄 오른쪽에 서야 하는데, 토글은 클라이언트 상태라
    서버 컴포넌트인 여기서는 같은 줄에 세울 수 없다(MoodRail 주석 참고).

    "전체 사진" 머리도 여기 없다 — 그건 아래 피드의 머리라 호출부(page.tsx)에 있다.
    데스크톱 2단(바로가기 좌 / 무드 우)에서 오른쪽 칸에 딸려 들어가면 안 된다.

    경계선은 긋지 않는다 — 섹션의 경계는 머리 위의 **빨간 눈금**이 맡는다.
    (회색 실선을 그어 봤더니 지면이 표처럼 답답해졌다. 근거는 HomeQuickNav 주석에)
  */
  return (
    <section className="ed-scroll-in">
      <MoodRail items={moods} />
    </section>
  );
}
