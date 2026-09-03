import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { listPublishedCategories } from "@/lib/categories";
import { listPublishedExploreSlugs, countVisiblePhotos } from "@/lib/explore-db";
import { resolveExplorePhotoIds } from "@/lib/target-categories";
import { SITE_URL } from "@/lib/site";
import { GUIDE_PAGE_ITEMS } from "@/lib/guide-data";
import { listPublishedArticleSlugs } from "@/lib/articles";
import { PUBLISHED_SPOTS } from "@/lib/spots-data";
import { countSpotPhotos } from "@/lib/spots";

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
  // ⚠️ /trust 는 아직 이 브랜치에 없다 — 그 지면은 에스크로·연락처 비공개(새 모델)를
  //    설명하는데 지금 운영은 리드 판매다. 없는 URL 을 사이트맵에 실으면 404 를 먹인다.
  //    본배포 때 지면과 함께 되살릴 것.
  "/privacy",
];

/** 법적 고지는 콘텐츠가 아니다 — 실려는 있되 우선순위는 낮게. */
const LOW_PRIORITY = new Set(["/privacy", "/apply"]);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "/privacy" ? "yearly" : "weekly",
    priority: path === "" ? 1 : LOW_PRIORITY.has(path) ? 0.4 : 0.7,
  }));

  // 촬영 가이드 — 질문-답 페이지. AI 답변이 가장 잘 인용하는 형식이라 우선순위를 높게 준다.
  // published 로 켠 것 중 본문이 충분한 것만 개별 URL 을 갖는다(GUIDE_PAGE_ITEMS).
  const guideEntries: MetadataRoute.Sitemap = GUIDE_PAGE_ITEMS.map((g) => ({
    url: `${SITE_URL}/guide/${encodeURIComponent(g.slug)}`,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  try {
    const admin = createAdminClient();

    // 공개 카테고리는 DB 에서 가져와 항상 최신 slug 로 (하드코딩 시 카테고리 개편 때 죽은 링크 발생)
    const categories = await listPublishedCategories();
    const categoryEntries: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${SITE_URL}/c/${encodeURIComponent(c.slug)}`,
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
      PUBLISHED_SPOTS.map(async (s) => ({ s, n: await countSpotPhotos(s) }))
    );
    const spotEntries: MetadataRoute.Sitemap = spotResolved
      .filter((x) => x.n > 0)
      .map((x) => ({
        url: `${SITE_URL}/spots/${x.s.slug}`,
        changeFrequency: "weekly",
        priority: 0.9,
      }));

    const { data } = await admin
      .from("photos")
      .select("id, photographer_id, updated_at")
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .limit(5000);

    const rows = data ?? [];
    const photographerIds = [...new Set(rows.map((r) => r.photographer_id).filter(Boolean))];

    const photographerEntries: MetadataRoute.Sitemap = photographerIds.map((id) => ({
      url: `${SITE_URL}/photographers/${id}`,
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    const photoEntries: MetadataRoute.Sitemap = rows.map((r) => ({
      url: `${SITE_URL}/photos/${r.id}`,
      lastModified: r.updated_at ? new Date(r.updated_at as string) : undefined,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

    return [
      ...staticEntries,
      ...articleEntries,
      ...spotEntries,
      ...guideEntries,
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
