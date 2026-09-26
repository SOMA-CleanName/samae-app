import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPublishedCategories } from "@/lib/categories";
import { listPublishedExploreSlugs, countVisiblePhotos } from "@/lib/explore-db";
import { resolveExplorePhotoIds } from "@/lib/target-categories";
import { SITE_URL } from "@/lib/site";
import { listGuidePageItems } from "@/lib/guide";
import { listPublishedArticleSlugs } from "@/lib/articles";
import { listPublishedSpots } from "@/lib/spots-db";
import { countSpotPhotos } from "@/lib/spots";
import { isSpotLive } from "@/lib/spot-live";

// 하루 1회 재생성 — 공개 작가·사진은 자주 바뀌므로.
export const revalidate = 86400;

/*
  정적 경로.

  빠져 있던 셋을 넣었다 —
    /explore  매거진 인덱스. 아티클·화보·촬영 장소·자주 묻는 것이 모이는 허브인데
              하위(/explore/{slug})만 싣고 정작 인덱스가 없었다.
    /trust    작가 심사·결제 보호·환불 기준. "사매 안전한가" 류 검색이 닿을 유일한 지면.
    /privacy  개인정보 처리방침. 사이트 신뢰 평가에 쓰인다.

  ⚠️ 여기 넣는 경로는 **자기 canonical 을 갖고 있어야 한다.** 루트 layout 의
     canonical:"/" 를 상속한 채로 sitemap 에만 올리면, 색인해 달라고 해 놓고
     같은 태그로 "나는 홈의 복제본"이라고 말하는 꼴이 된다.
*/
const STATIC_ROUTES = [
  "",
  "/explore",
  "/apply",
  "/guide",
  "/articles",
  "/spots",
  "/trust",
  "/privacy",
  "/terms",
  "/terms/refund",
  "/terms/photographer",
  "/terms/photographer-contract",
];

/** 법적 고지는 콘텐츠가 아니다 — 실려는 있되 우선순위는 낮게. */
const LOW_PRIORITY = new Set([
  "/privacy",
  "/terms",
  "/terms/refund",
  "/terms/photographer",
  "/terms/photographer-contract",
  "/apply",
]);

/*
  `lastmod` — **"이거 바뀌었으니 다시 와라" 를 구글에게 말하는 유일한 수단이다.**

  없으면 구글은 이 URL 이 새 것인지 6개월 전 것인지 알 방법이 없어서, 크롤 우선순위를
  자기 판단에만 맡긴다. 신규 도메인에서는 그게 곧 "한참 뒤" 다.

  실측 2026-09-18 — articles·photos 에만 lastmod 가 있었고 spots·guide·explore·/c/·
  작가 프로필은 전부 비어 있었다. 하필 그 넷이 GEO 의 본체다. 서치콘솔에서 확인해 보면
  그 URL 들이 **"발견됨 - 현재 색인이 생성되지 않음"** 에 머물러 있었다.

  ⚠️ 공유 타입(GuideItem·Spot·Category…)을 넓히지 않는다. 이 값을 쓰는 건 sitemap 뿐이라
     거기까지 고치면 관련 없는 지면들이 같이 흔들린다. 여기서 표를 직접 한 번 읽는다.
*/
async function lastmodBy(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
  keyCol: string,
  filter?: { col: string; val: string | boolean }
): Promise<Map<string, Date>> {
  let q = admin.from(table).select(`${keyCol}, updated_at`);
  if (filter) q = q.eq(filter.col, filter.val);
  const { data } = await q;
  const out = new Map<string, Date>();
  // 컬럼 목록이 템플릿 문자열이라 Supabase 의 타입 추론이 못 따라온다 — unknown 경유
  for (const r of ((data ?? []) as unknown) as Array<Record<string, unknown>>) {
    const k = r[keyCol];
    const t = r.updated_at;
    if (typeof k === "string" && typeof t === "string") {
      const d = new Date(t);
      if (!Number.isNaN(d.getTime())) out.set(k, d);
    }
  }
  return out;
}

/** 둘 중 더 최근. 둘 다 없으면 undefined — 지어내지 않는다 */
function newer(a?: Date, b?: Date): Date | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "/privacy" ? "yearly" : "weekly",
    priority: path === "" ? 1 : LOW_PRIORITY.has(path) ? 0.4 : 0.7,
  }));

  // 촬영 가이드 — 질문-답 페이지. AI 답변이 가장 잘 인용하는 형식이라 우선순위를 높게 준다.
  // published 로 켠 것 중 본문이 충분한 것만 개별 URL 을 갖는다(GUIDE_PAGE_ITEMS).
  const guidePageItems = await listGuidePageItems();
  // lastmod 는 아래 try 안에서 붙인다(admin 클라이언트가 거기 있다). DB 가 죽으면
  // lastmod 없이라도 URL 은 실린다 — catch 로 떨어지는 폴백이 그것이다.
  const guideEntry = (g: { slug: string }, lastModified?: Date): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}/guide/${encodeURIComponent(g.slug)}`,
    lastModified,
    changeFrequency: "monthly",
    priority: 0.8,
  });
  const guideEntries: MetadataRoute.Sitemap = guidePageItems.map((g) => guideEntry(g));

  try {
    const admin = createAdminClient();

    // 지면별 갱신 시각을 한 번에 읽는다. 작가는 프로필만으로 부족해서 따로 합친다(아래).
    const [lmSpot, lmGuide, lmExplore, lmCategory, lmPhotographer, pkgRows] = await Promise.all([
      lastmodBy(admin, "spots", "slug", { col: "published", val: true }),
      lastmodBy(admin, "guide_items", "slug", { col: "published", val: true }),
      lastmodBy(admin, "explore_categories", "slug", { col: "published", val: true }),
      lastmodBy(admin, "categories", "slug", { col: "published", val: true }),
      lastmodBy(admin, "photographers", "id", { col: "status", val: "approved" }),
      admin.from("packages").select("photographer_id, updated_at").eq("is_active", true),
    ]);

    // 작가 지면의 lastmod = 프로필 · 패키지 · 사진 중 **가장 최근**.
    // 프로필만 보면 가격을 고쳐도(= JSON-LD Product 가 바뀌어도) 신호가 안 간다.
    const lmPackage = new Map<string, Date>();
    for (const r of (pkgRows.data ?? []) as Array<Record<string, unknown>>) {
      const pid = r.photographer_id;
      const t = r.updated_at;
      if (typeof pid !== "string" || typeof t !== "string") continue;
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) continue;
      const cur = lmPackage.get(pid);
      if (!cur || d > cur) lmPackage.set(pid, d);
    }

    // 공개 카테고리는 DB 에서 가져와 항상 최신 slug 로 (하드코딩 시 카테고리 개편 때 죽은 링크 발생)
    const categories = await listPublishedCategories();
    const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${SITE_URL}/c/${encodeURIComponent(c.slug)}`,
      lastModified: lmCategory.get(c.slug),
      changeFrequency: "weekly",
      priority: 0.7,
    }));

    // 탐색 카테고리(무드·장면 큐레이션). /c/ 보다 우선순위를 높게 잡는다 —
    // "성수 스냅", "빈티지 사진" 같은 롱테일 검색이 닿는 지점이라 유입 가치가 가장 크다.
    //
    // ⚠️ **사진이 실제로 잡히는 카테고리만 싣는다.** 공개(published)라도 사진이 0장인 카테고리가 있고,
    //    빈 페이지를 sitemap 에 올리면 색인 품질 점수를 깎고 크롤 예산만 먹는다.
    //    페이지와 같은 해석기(resolveExplorePhotoIds)를 써서 판정이 어긋나지 않게 한다.
    const exploreSlugs = await listPublishedExploreSlugs();
    const exploreResolved = await Promise.all(
      exploreSlugs.map(async (e) => ({
        ...e,
        count: await countVisiblePhotos(await resolveExplorePhotoIds(e.id)),
      }))
    );
    const exploreEntries: MetadataRoute.Sitemap = exploreResolved
      .filter((e) => e.count > 0)
      .map((e) => ({
        url: `${SITE_URL}/explore/${encodeURIComponent(e.slug)}`,
        lastModified: lmExplore.get(e.slug),
        changeFrequency: "weekly",
        priority: 0.8,
      }));

    // 아티클 — 롱폼 글. 검색·AI 유입의 본체라 우선순위를 높게 준다.
    const articleSlugs = await listPublishedArticleSlugs();
    const articleEntries: MetadataRoute.Sitemap = articleSlugs.map((a) => ({
      url: `${SITE_URL}/articles/${encodeURIComponent(a.slug)}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
      changeFrequency: "monthly",
      priority: 0.9,
    }));

    // 촬영 장소 — 사진이 실제로 잡히는 곳만. 소개글만 남는 페이지는 블로그가 더 잘 쓴다.
    const spotResolved = await Promise.all(
      (await listPublishedSpots()).map(async (s) => ({ s, n: await countSpotPhotos(s) }))
    );
    const spotEntries: MetadataRoute.Sitemap = spotResolved
      // 0장만 빼던 것을 기준(9장) 미달로 바꿨다 — 사진 두 장짜리 지면을
      // 색인에 올려 봐야 "내용 빈약" 으로 잡힐 뿐이다
      .filter((x) => isSpotLive(x.n))
      .map((x) => ({
        url: `${SITE_URL}/spots/${x.s.slug}`,
        lastModified: lmSpot.get(x.s.slug),
        changeFrequency: "weekly",
        priority: 0.9,
      }));

    // 🔴 **`.limit(5000)` 은 안 먹는다.** PostgREST 는 요청당 반환 행을 기본 1000 으로 자르고,
    //    그 상한이 클라이언트 limit 보다 우선한다. 그래서 공개 사진이 1779장인데 sitemap 에는
    //    정확히 1000개만 실려 있었다 — **44% 가 조용히 빠진 채로** 몇 달을 보냈다
    //    (2026-09-17 점검). 잘린 게 아니라 채워진 것처럼 보여서 눈치채기 어렵다.
    //
    //    range() 로 페이지를 넘겨 가며 다 가져온다. 마지막 페이지는 PAGE 보다 짧다.
    const PAGE = 1000;
    const MAX = 45_000; // sitemap.xml 한 장의 표준 상한은 50,000 — 정적 경로 몫을 남긴다
    //
    // ⚠️ **운영이 내린 사진(feed_hidden)은 싣지 않는다.** 여기 실으면 구글이 색인하고
    //    검색에 뜬다 — 피드에서 내린 의미가 없어진다. 크롤이 막혀 있던 동안에는 드러나지
    //    않던 문제였는데, robots 를 푸는 순간 실제 노출로 바뀐다(2026-09-17 결정).
    const rows: Array<{ id: string; photographer_id: string | null; updated_at: string | null }> = [];
    for (let from = 0; from < MAX; from += PAGE) {
      const { data: page } = await admin
        .from("photos")
        .select("id, photographer_id, updated_at")
        .eq("visibility", "published")
        .eq("feed_hidden", false)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      const got = (page ?? []) as typeof rows;
      rows.push(...got);
      if (got.length < PAGE) break; // 마지막 페이지
    }

    // 작가 페이지는 **작가 표에서 직접** 뽑는다. 사진 목록에서 역산하면 위 페이지네이션이
    // 잘릴 때 작가까지 같이 사라진다 — 실제로 17명 중 11명만 실려 있었다.
    // 사진이 한 장도 없는 작가는 뺀다(빈 프로필은 색인 품질만 깎는다).
    const withPhotos = new Set(rows.map((r) => r.photographer_id).filter(Boolean) as string[]);
    // 승인 작가 목록과 프로필 갱신 시각은 위에서 이미 한 번 읽었다(lmPhotographer).
    const photographerIds = [...lmPhotographer.keys()].filter((id) => withPhotos.has(id));

    // 작가별 최신 사진 시각 — 포트폴리오가 늘면 프로필 지면도 바뀐 것이다
    const lmPhoto = new Map<string, Date>();
    for (const r of rows) {
      if (!r.photographer_id || !r.updated_at) continue;
      const d = new Date(r.updated_at);
      if (Number.isNaN(d.getTime())) continue;
      const cur = lmPhoto.get(r.photographer_id);
      if (!cur || d > cur) lmPhoto.set(r.photographer_id, d);
    }

    const photographerEntries: MetadataRoute.Sitemap = photographerIds.map((id) => ({
      url: `${SITE_URL}/photographers/${id}`,
      // 프로필 · 패키지 · 사진 중 가장 최근. 셋 중 뭐가 바뀌어도 지면이 바뀐다
      lastModified: newer(newer(lmPhotographer.get(id), lmPackage.get(id)), lmPhoto.get(id)),
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const photoEntries: MetadataRoute.Sitemap = rows.map((r) => ({
      url: `${SITE_URL}/photos/${r.id}`,
      lastModified: r.updated_at ? new Date(r.updated_at as string) : undefined,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

    const guideWithLastmod: MetadataRoute.Sitemap = guidePageItems.map((g) =>
      guideEntry(g, lmGuide.get(g.slug))
    );

    return [
      ...staticEntries,
      ...articleEntries,
      ...spotEntries,
      ...guideWithLastmod,
      ...exploreEntries,
      ...categoryEntries,
      ...photographerEntries,
      ...photoEntries,
    ];
  } catch {
    // DB 접근 실패 시에도 정적 경로·가이드 sitemap 은 제공 (DB 를 안 타는 항목들)
    return [...staticEntries, ...guideEntries];
  }
}
