import { SITE_URL, SITE_NAME } from "@/lib/site";
import { listPublishedArticlesWithBody } from "@/lib/articles";
import { listPublishedGuideItems } from "@/lib/guide";
import { buildRss, mdToFeedHtml, sameOriginImage, urlFor, escapeXml, type RssItem } from "@/lib/rss";

/**
 * RSS 피드 — **네이버 서치어드바이저 「RSS 제출」용.**
 *
 * 구글은 sitemap.xml 하나로 끝이지만 네이버는 RSS 를 **별개 채널**로 받고, 새 글을
 * 빠르게 집어가는 경로로 쓴다. 2026-09-26 기준 네이버 색인이 7개뿐이고 수집 현황이
 * 0에 붙어 있었다 — 열 수 있는 경로는 다 연다.
 *
 * ⚠️ 사진·작가 지면은 **싣지 않는다.** 피드는 "새로 쓰인 글" 을 알리는 물건이라
 *    1,500장짜리 사진 목록을 넣으면 본문이 있는 글이 묻힌다. 사진은 sitemap 이 맡는다.
 *
 * 쿠키를 읽지 않는 조회만 쓴다(articles·guide 둘 다 public 클라이언트) — 그래야
 * 정적으로 굳어 매 요청마다 DB 를 치지 않는다.
 */
export const revalidate = 3600;

export async function GET() {
  const [articles, guide] = await Promise.all([
    listPublishedArticlesWithBody(),
    listPublishedGuideItems(),
  ]);

  const items: RssItem[] = [
    ...articles.map((a) => ({
      url: urlFor(SITE_URL, "articles", a.slug),
      title: a.title,
      // 네이버 안내: "이미지 링크가 포함된 **본문 전체**를 제공하는 것을 권장합니다."
      // 표지를 맨 앞에 세우고 본문을 잇는다. 이미지는 우리 도메인으로 되쏜다.
      description: [
        a.cover_url
          ? `<img src="${escapeXml(sameOriginImage(SITE_URL, a.cover_url))}" alt="${escapeXml(a.cover_alt)}"/>`
          : "",
        mdToFeedHtml(a.body_md, SITE_URL),
      ]
        .filter(Boolean)
        .join("\n"),
      publishedAt: a.published_at ?? a.updated_at,
    })),
    // 가이드 문답에는 날짜 컬럼이 없다. pubDate 를 지어내지 않고 생략한다 —
    // 가짜 날짜를 넣으면 피드가 "오늘 쓴 글" 처럼 보인다.
    ...guide.map((g) => ({
      url: urlFor(SITE_URL, "guide", g.slug),
      title: g.question,
      description: mdToFeedHtml(g.answer, SITE_URL),
    })),
  ];

  const xml = buildRss(
    {
      title: `${SITE_NAME} 읽을거리`,
      description: "스냅 촬영을 준비하며 궁금해할 것들 — 가격·장소·준비물·보정.",
      link: SITE_URL,
      feedUrl: `${SITE_URL}/rss.xml`,
    },
    items
  );

  return new Response(xml, {
    headers: {
      // charset 을 붙여야 한글이 깨지지 않는다
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
