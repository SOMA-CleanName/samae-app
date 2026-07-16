import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { searchPhotosByTag } from "@/lib/discovery";
import type { GalleryPhoto } from "@/lib/discovery";

const GALLERY_SELECT =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)";

// 어드민 피커 썸네일 최소 필드
export type PoolPhoto = { id: string; thumb_url: string | null; src_url: string };

export const EXPLORE_POOL_PAGE = 48;

// 탐색 편집형 카테고리(DB) — 광고 랜딩 categories 와 별개 체계. (docs/20)
export type ExploreCategory = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  published: boolean;
  sort: number;
};

const EXPLORE_COLUMNS = "id, slug, title, subtitle, published, sort";

function mapRow(r: Record<string, unknown>): ExploreCategory {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? "",
    published: !!r.published,
    sort: (r.sort as number) ?? 0,
  };
}

// 운영자용 — 전체 카테고리 + 담긴 사진 수(수동 멤버십).
export async function listExploreCategoriesWithCounts(): Promise<
  Array<ExploreCategory & { photoCount: number }>
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("explore_categories")
    .select(EXPLORE_COLUMNS)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });

  const cats = (data ?? []).map(mapRow);

  const counts = await Promise.all(
    cats.map(async (c) => {
      const { count } = await admin
        .from("explore_category_photos")
        .select("photo_id", { count: "exact", head: true })
        .eq("category_id", c.id);
      return count ?? 0;
    })
  );

  return cats.map((c, i) => ({ ...c, photoCount: counts[i] }));
}

// 카테고리에 담긴 사진 id (position 순).
export async function getExploreCategoryPhotoIds(categoryId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("explore_category_photos")
    .select("photo_id")
    .eq("category_id", categoryId)
    .order("position", { ascending: true });
  return (data ?? []).map((r) => r.photo_id as string);
}

// ── 프론트(사용자) 읽기 — RLS(published·승인작가) 를 태워 안전하게 노출 ──

// 공개 카테고리 1건 (slug). 비공개/미존재는 null.
export async function getPublishedExploreCategory(slug: string): Promise<ExploreCategory | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("explore_categories")
    .select(EXPLORE_COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

// 카테고리에 담긴 사진을 position 순으로(갤러리 필드). 비공개 사진은 RLS 로 제외된다.
export async function fetchExploreCategoryGalleryPhotos(
  categoryId: string,
  limit?: number
): Promise<GalleryPhoto[]> {
  const ids = await getExploreCategoryPhotoIds(categoryId);
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(GALLERY_SELECT)
    .in("id", ids)
    .eq("visibility", "published");
  const byId = new Map(
    ((data ?? []) as unknown as GalleryPhoto[]).map((p) => [p.id, p])
  );
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((p): p is GalleryPhoto => !!p);
  return typeof limit === "number" ? ordered.slice(0, limit) : ordered;
}

// /explore 홈 — 공개 카테고리 각각 앞 perCat 장(position 순). 3쿼리로 배치.
export async function listPublishedExploreSections(
  perCat: number
): Promise<Array<{ category: ExploreCategory; photos: GalleryPhoto[] }>> {
  const supabase = await createClient();
  const { data: catData } = await supabase
    .from("explore_categories")
    .select(EXPLORE_COLUMNS)
    .eq("published", true)
    .order("sort", { ascending: true });
  const cats = (catData ?? []).map(mapRow);
  if (cats.length === 0) return [];

  // 멤버십(순서) — 관리 데이터라 admin 으로 한 번에. 사진 가시성은 아래 RLS 조회가 판단.
  const admin = createAdminClient();
  const { data: memData } = await admin
    .from("explore_category_photos")
    .select("category_id, photo_id, position")
    .in(
      "category_id",
      cats.map((c) => c.id)
    )
    .order("position", { ascending: true });
  const mem = (memData ?? []) as Array<{
    category_id: string;
    photo_id: string;
    position: number;
  }>;

  const allIds = [...new Set(mem.map((m) => m.photo_id))];
  const photoById = new Map<string, GalleryPhoto>();
  if (allIds.length > 0) {
    const { data: photoData } = await supabase
      .from("photos")
      .select(GALLERY_SELECT)
      .in("id", allIds)
      .eq("visibility", "published");
    for (const p of (photoData ?? []) as unknown as GalleryPhoto[]) photoById.set(p.id, p);
  }

  return cats.map((c) => {
    const photos = mem
      .filter((m) => m.category_id === c.id) // 이미 position 오름차순
      .map((m) => photoById.get(m.photo_id))
      .filter((p): p is GalleryPhoto => !!p)
      .slice(0, perCat);
    return { category: c, photos };
  });
}

// id 목록으로 썸네일 조회 — 담긴 사진이 검색 윈도우 밖이어도 존을 채우기 위함.
// 순서는 입력 ids 를 따른다(쿼리 반환 순서 무시).
export async function fetchPhotosByIds(ids: string[]): Promise<PoolPhoto[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("photos")
    .select("id, thumb_url, src_url")
    .in("id", ids);
  const byId = new Map((data ?? []).map((r) => [r.id as string, r as PoolPhoto]));
  return ids.map((id) => byId.get(id)).filter((p): p is PoolPhoto => !!p);
}

// 어드민 피커 풀 — 태그 검색(있으면) 또는 최신 브라우즈(없으면), offset 페이지네이션.
// RLS(anon = 승인 작가·published) 를 그대로 태워 미승인/비공개는 제외한다.
export async function fetchExplorePhotoPool(q: string, offset: number): Promise<PoolPhoto[]> {
  const query = q.trim();
  if (query) {
    // 사이트 검색과 동일한 태그 스코어 매칭. 전체 결과에서 offset 윈도우만 잘라 페이지네이션.
    const results = await searchPhotosByTag(query);
    return results
      .slice(offset, offset + EXPLORE_POOL_PAGE)
      .map((p) => ({ id: p.id, thumb_url: p.thumb_url, src_url: p.src_url }));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, thumb_url, src_url, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .range(offset, offset + EXPLORE_POOL_PAGE - 1);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    thumb_url: r.thumb_url as string | null,
    src_url: r.src_url as string,
  }));
}
