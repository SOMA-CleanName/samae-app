import { fetchActiveBanners, safeBannerHref } from "@/lib/banners";
import { listPublishedArticles } from "@/lib/articles";
import { BannerCarousel, type BannerItem } from "./BannerCarousel";

// 홈·카테고리 상단 배너 슬롯.
//
// 두 종류를 한 캐러셀에 싣는다.
//   ① 운영 배너 — 어드민에서 올린 완성 이미지. 순서도 운영자가 정한다.
//   ② 아티클    — 커버 사진 위에 제목을 얹어 "읽을 것"으로 보이게 한다.
//
// 운영 배너가 먼저다. 운영자가 지금 밀고 싶은 게 있어서 올린 것이라
// 아티클이 그 앞을 가로막으면 안 된다.
//
// 배너도 아티클도 없으면 아무것도 렌더하지 않아 레이아웃이 그대로다.

/** 아티클 슬라이드 상한 — 캐러셀이 길어지면 끝까지 보는 사람이 없다. */
const MAX_ARTICLE_SLIDES = 3;

export async function HomeBannerSlot() {
  const [banners, articles] = await Promise.all([
    fetchActiveBanners(),
    // 아티클 조회가 실패해도 운영 배너는 떠야 한다.
    listPublishedArticles().catch(() => []),
  ]);

  const bannerItems: BannerItem[] = banners.map((b) => ({
    id: b.id,
    src: b.image_url,
    alt: b.title || "배너",
    href: safeBannerHref(b.link_url),
  }));

  // 커버가 있는 글만. 배너는 이미지가 주인공이라 커버 없는 글은 걸 자리가 없다.
  const articleItems: BannerItem[] = articles
    .filter((a) => a.cover_url)
    .slice(0, MAX_ARTICLE_SLIDES)
    .map((a) => ({
      id: `article-${a.id}`,
      src: a.cover_url as string,
      alt: a.cover_alt || a.title,
      href: `/articles/${encodeURIComponent(a.slug)}`,
      kicker: "스냅 촬영 이야기",
      title: a.title,
    }));

  const items = [...bannerItems, ...articleItems];
  if (items.length === 0) return null;

  return <BannerCarousel items={items} />;
}
