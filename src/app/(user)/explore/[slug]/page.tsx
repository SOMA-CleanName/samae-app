import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getPublishedExploreCategory,
  getExploreCategoryPhotoIds,
  fetchGalleryPhotosByIds,
} from "@/lib/explore-db";
import { getPublishedCategory } from "@/lib/categories";
import { coverPhotoIdForTarget } from "@/lib/target-categories";
import { CATEGORY_COOKIE } from "@/lib/category-constants";
import { newFeedSeed } from "@/lib/discovery";
import { seededShuffle } from "@/lib/seeded-shuffle";
import { MpTrackOnce } from "@/components/MpTrackOnce";
import { JsonLd } from "@/components/JsonLd";
import { exploreCategoryMetadata, collectionJsonLd, breadcrumbJsonLd } from "@/lib/seo";
import { CategoryImmersive } from "./CategoryImmersive";
import type { Metadata } from "next";

/**
 * 한 카테고리 지면에 실어 보낼 최대 장수.
 *
 * 한 장씩 밀어 보는 화면이다 — 한 번에 백 장 넘게 보는 사람은 없다. 그보다 더 담으면
 * 초기 HTML 만 무거워진다(실측 2026-09-27: 1,124장 = 1.1MB, 본문은 18단어).
 * `newFeedSeed()` 가 요청마다 달라 다시 들어오면 새 묶음이 나온다.
 */
const MAX_GALLERY_PHOTOS = 120;

export const dynamic = "force-dynamic";

// Next.js 16: 동적 라우트 param 은 자동 디코딩되지 않음 — 한글 slug 매칭 위해 직접 디코딩
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getPublishedExploreCategory(safeDecode(slug));
  if (!cat) return {};
  return exploreCategoryMetadata({ title: cat.title, subtitle: cat.subtitle, slug: cat.slug });
}

// 탐색 카테고리 진입 — 홈 그리드가 아니라 '풀스크린 몰입 + 하단 필름스트립'으로.
// 요청마다 셔플(한 세션 순서는 CategoryImmersive 내부 상태로 유지되진 않으나 force-dynamic 이라 진입마다 변주).
export default async function ExploreCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cat = await getPublishedExploreCategory(safeDecode(slug));
  if (!cat) notFound();

  // 첫 장은 '추천 무드 대표 사진' — 타일에서 보고 누른 그 사진이 그대로 열리게 한다.
  // 대표사진 우선순위는 타일과 동일: 타겟별 지정 → 미리보기 지정 1번 → (없으면 셔플 첫 장).
  // 타겟은 광고 진입 시 심기는 samae_cat 쿠키로 판별.
  const adSlug = (await cookies()).get(CATEGORY_COOKIE)?.value;
  const adCat = adSlug ? await getPublishedCategory(adSlug) : null;
  const coverId = coverPhotoIdForTarget(cat, adCat?.id ?? null);

  /*
    🔴 **id 를 먼저 섞고 앞에서만 가져온다.** 전에는 배정된 사진을 **전량** 받아 그대로
       내보냈다 — `/explore/profile-image` 가 사진 1,124장을 초기 HTML 에 박아
       **1.1MB** 였다(본문은 18단어). 14개 지면 합이 8MB 가까웠다.

       몰입형 뷰어는 한 번에 한 장씩 밀어 보는 화면이라 1,124장이 필요할 일이 없다.
       그리고 `newFeedSeed()` 가 요청마다 달라서 **방문할 때마다 다른 묶음**이 나온다 —
       장수를 줄여도 "매번 같은 사진" 이 되지 않는다.

       ⚠️ 비공개·숨김 사진이 섞여 있을 수 있어 넉넉히 집은 뒤 잘라낸다. 딱 맞게 집으면
          걸러진 만큼 화면이 비어 보인다.
  */
  const allIds = await getExploreCategoryPhotoIds(cat.id);
  const shuffledIds = seededShuffle(allIds, newFeedSeed());
  const withCover =
    coverId && allIds.includes(coverId)
      ? [coverId, ...shuffledIds.filter((id) => id !== coverId)]
      : shuffledIds;
  const photos = (
    await fetchGalleryPhotosByIds(withCover.slice(0, Math.ceil(MAX_GALLERY_PHOTOS * 1.3)))
  ).slice(0, MAX_GALLERY_PHOTOS);

  // 검색·AI 가 읽을 구조. 사진이 없으면 collectionJsonLd 가 null 을 주고 아무것도 안 심는다.
  const collection = collectionJsonLd({
    title: cat.title,
    description: cat.subtitle,
    path: `/explore/${encodeURIComponent(cat.slug)}`,
    photoIds: photos.map((p) => p.id),
  });
  const breadcrumb = breadcrumbJsonLd([
    { name: "홈", path: "/" },
    { name: cat.title, path: `/explore/${encodeURIComponent(cat.slug)}` },
  ]);

  return (
    <>
      {collection && <JsonLd data={collection} />}
      <JsonLd data={breadcrumb} />
      {/* 카테고리 탐색 진입 — 취향 시그널(수요 차원) */}
      <MpTrackOnce
        event="View Category"
        props={{ category: cat.title, slug: cat.slug, result_count: photos.length }}
      />
      <CategoryImmersive photos={photos} title={cat.title} />
    </>
  );
}
