import "server-only";

import { memoTtl } from "@/lib/server-memo";
import { listPublishedArticles } from "@/lib/articles";
import { listSpotCards } from "@/lib/spots";
import type { GalleryPhoto } from "@/lib/discovery";

/**
 * 전체 피드 사이에 끼우는 카드.
 *
 * 사진만 수백 장 흐르면 스크롤이 그냥 노동이 된다. 중간중간 다른 성격의 카드를 넣어
 * 리듬을 만들고, 만들어 둔 콘텐츠(아티클·장소)와 작가 프로필로 이어 준다.
 *
 * 두 종류를 쓴다.
 *   · read        — 읽을거리. 콘텐츠 소비로 이어진다.
 *   · photographer — 이 피드에 자주 나온 작가. 문의(전환)에 가장 가깝다.
 *
 * 전에는 1:1 로 번갈았는데, 그러면 삽입 카드의 절반이 작가라 스크롤 내내
 * 사람 얼굴 카드가 계속 나왔다. 작가 카드는 읽을거리 셋에 하나만 넣는다(READ_PER_MAKER).
 */
export type FeedInterstitial =
  | {
      kind: "read";
      key: string;
      href: string;
      badge: string;
      /** 라벨 색을 가른다 — 글과 장소가 한눈에 구분되게. */
      tone: "story" | "place";
      title: string;
      lead: string;
      imageUrl: string | null;
    }
  | {
      kind: "photographer";
      key: string;
      href: string;
      displayName: string;
      imageUrls: string[];
    };

/** 읽을거리 몇 장마다 작가 카드를 한 장 끼울지. */
const READ_PER_MAKER = 3;
/** 작가 카드는 최대 몇 명까지. 많아 봐야 같은 사람이 반복될 뿐이다. */
const MAX_MAKERS = 2;

/** 피드에 실린 사진에서 자주 나온 작가를 센다. 추가 쿼리가 없다. */
function topPhotographers(photos: GalleryPhoto[], limit: number) {
  const by = new Map<string, { name: string; urls: string[]; n: number }>();
  for (const p of photos) {
    const id = p.photographer?.id;
    const name = p.photographer?.display_name;
    // 이름이 없으면 카드에 쓸 게 없다. 익명 정책상 실명을 대신 넣지도 않는다.
    if (!id || !name) continue;
    const cur = by.get(id);
    const url = p.thumb_url ?? p.src_url;
    if (cur) {
      cur.n += 1;
      if (cur.urls.length < 3 && url) cur.urls.push(url);
    } else {
      by.set(id, { name, urls: url ? [url] : [], n: 1 });
    }
  }
  return [...by.entries()]
    // 사진 3장은 있어야 카드가 허전하지 않다
    .filter(([, v]) => v.urls.length >= 3)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, limit)
    .map(([id, v]) => ({ id, ...v }));
}

/**
 * 삽입 카드 목록을 만든다.
 *
 * 아티클·장소는 홈의 다른 자리에서 이미 60초 메모로 읽고 있어 키를 공유한다.
 * 작가는 인자로 받은 피드 사진에서 세므로, 이 함수는 **추가 쿼리를 하나도 안 낸다.**
 */
export async function buildFeedInterstitials(
  photos: GalleryPhoto[]
): Promise<FeedInterstitial[]> {
  const [articles, spots] = await Promise.all([
    memoTtl("home:articles", 60_000, () => listPublishedArticles()).catch(() => []),
    memoTtl("explore:spots", 60_000, () => listSpotCards(6)).catch(() => []),
  ]);

  /*
    글과 장소를 번갈아 놓는다.
    앞에 글 넉 장을 몰아 두면 장소 카드는 스크롤 한참 아래에서야 처음 나온다.
  */
  const stories = articles.slice(0, 4).map((a) => ({
    kind: "read" as const,
    key: `article-${a.id}`,
    href: `/articles/${encodeURIComponent(a.slug)}`,
    badge: "읽을거리",
    tone: "story" as const,
    title: a.title,
    lead: a.summary,
    imageUrl: a.cover_url,
  }));
  const places = spots.slice(0, 3).map((s) => ({
    kind: "read" as const,
    key: `spot-${s.slug}`,
    href: `/spots/${s.slug}`,
    badge: "촬영 장소",
    tone: "place" as const,
    title: s.name,
    lead: `${s.area} · 여기서 찍힌 사진 ${s.count}장`,
    imageUrl: s.coverUrl,
  }));

  const reads: FeedInterstitial[] = [];
  for (let i = 0; i < Math.max(stories.length, places.length); i += 1) {
    if (stories[i]) reads.push(stories[i]);
    if (places[i]) reads.push(places[i]);
  }

  const makers: FeedInterstitial[] = topPhotographers(photos, MAX_MAKERS).map((m) => ({
    kind: "photographer" as const,
    key: `maker-${m.id}`,
    href: `/photographers/${m.id}`,
    displayName: m.name,
    imageUrls: m.urls,
  }));

  // 읽을거리 READ_PER_MAKER 장마다 작가 한 장. 작가가 떨어지면 나머지는 읽을거리로만 이어진다.
  const out: FeedInterstitial[] = [];
  let nextMaker = 0;
  reads.forEach((r, i) => {
    out.push(r);
    if ((i + 1) % READ_PER_MAKER === 0 && makers[nextMaker]) {
      out.push(makers[nextMaker]);
      nextMaker += 1;
    }
  });
  // 읽을거리가 아예 없으면(초기 상태) 작가라도 내보낸다 — 빈 목록이면 삽입 자체가 사라진다.
  if (out.length === 0) out.push(...makers);
  return out;
}
