import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getPublishedExploreCategory,
  fetchExploreCategoryGalleryPhotos,
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

  const ordered = await fetchExploreCategoryGalleryPhotos(cat.id);
  const shuffled = seededShuffle(ordered, newFeedSeed());
  const cover = coverId ? shuffled.find((p) => p.id === coverId) : undefined;
  const photos = cover ? [cover, ...shuffled.filter((p) => p.id !== cover.id)] : shuffled;

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
