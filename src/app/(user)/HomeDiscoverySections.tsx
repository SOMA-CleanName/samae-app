import { cookies } from "next/headers";
import {
  listPublishedExploreSections,
  rankExploreCategoriesByPopularity,
} from "@/lib/explore-db";
import { getPublishedCategory } from "@/lib/categories";
import {
  loadCurationSlides,
  loadMoodItemsForTarget,
  type CurationSlide,
  type MoodGridItem,
} from "@/lib/target-categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { memoTtl } from "@/lib/server-memo";
import { MoodRail, type MoodItem } from "./MoodRail";
import { SiteLinksRow } from "@/components/user/SiteLinksRow";

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
  const adSlug = (await cookies()).get(CATEGORY_COOKIE)?.value;
  const adCat = adSlug ? await getPublishedCategory(adSlug) : null;
  const ctx = adCat?.id ?? "all";

  const [coverCats, gridItems]: [CurationSlide[], MoodGridItem[]] = await Promise.all([
    // 오늘의 큐레이션 — 운영자가 무드마다 골라 둔 3컷. 여기선 순서·표식으로만 쓴다.
    memoTtl(`explore:cover:${ctx}`, 60_000, () => loadCurationSlides(adCat?.id ?? null)),

    // 무드 — 타겟에 연결된 것. 타겟이 없으면 전체 공개 무드를 인기순으로
    memoTtl(`explore:grid:${ctx}`, 60_000, async () =>
      adCat
        ? loadMoodItemsForTarget(adCat.id)
        : (await listPublishedExploreSections(10, await rankExploreCategoriesByPopularity()))
            .filter((s) => s.photos.length >= 1)
            .map((s) => ({
              slug: s.category.slug,
              title: s.category.title,
              subtitle: s.category.subtitle,
              // 미리보기 지정 1번 → 담긴 첫 장 (요청마다 바뀌지 않게 고정)
              url: s.photos[0].src_url,
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

  return (
    <div className="mb-4">
      {moods.length > 0 && (
        <section className="ed-scroll-in mb-8">
          <Head title="무드로 보기" lead="같은 결의 사진끼리 묶어 뒀어요." />
          <MoodRail items={moods} />
        </section>
      )}

      {/*
        아래부터는 전체 피드.

        전에는 가느다란 줄 가운데 라벨을 얹었는데, 경계도 아니고 섹션도 아닌
        어중간한 물건이 됐다. 위의 두 섹션과 똑같은 머리로 맞춰 확실히 끊는다.
        id 는 '맨 위로' 버튼이 나타날 기준점이기도 하다.
      */}
      {/* 아래로는 끝이 없다 — 사람이 닿을 수 있는 마지막 자리라 여기에 안내 링크를 둔다 */}
      <SiteLinksRow />

      <div id="sec-all-photos" className="scroll-mt-20 px-1">
        <span aria-hidden className="mb-2 block h-[2px] w-6 bg-brand" />
        <h2 className="text-body font-bold tracking-tight">전체 사진</h2>
      </div>
    </div>
  );
}

/**
 * 홈용 섹션 머리 — 탐색·매거진의 SectionHead 보다 얇다.
 * 번호도 규칙선도 없다. 여기 섹션은 셋뿐이고 목차도 없어서 번호가 가리킬 데가 없다.
 */
function Head({
  title,
  lead,
  right,
}: {
  title: string;
  lead?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
      <div className="min-w-0">
        {/* 매거진·탐색의 섹션 머리와 같은 규칙선. 지면이 하나로 읽히게 한다. */}
        <span aria-hidden className="mb-2 block h-[2px] w-6 bg-brand" />
        <h2 className="text-body font-bold tracking-tight">{title}</h2>
        {lead && <p className="mt-0.5 truncate text-[11px] text-muted">{lead}</p>}
      </div>
      {right}
    </div>
  );
}
