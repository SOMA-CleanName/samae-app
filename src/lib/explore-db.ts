import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { GalleryPhoto } from "@/lib/discovery";

const GALLERY_SELECT =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)";

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
// orderedIds 가 주어지면(광고 진입) 그 id 들만, 그 순서대로 노출(공개된 것만).
// 없으면 전체 공개 카테고리를 sort 순으로.
export async function listPublishedExploreSections(
  perCat: number,
  orderedIds?: string[]
): Promise<Array<{ category: ExploreCategory; photos: GalleryPhoto[] }>> {
  const supabase = await createClient();
  let cats: ExploreCategory[];
  if (orderedIds && orderedIds.length > 0) {
    const { data: catData } = await supabase
      .from("explore_categories")
      .select(EXPLORE_COLUMNS)
      .eq("published", true)
      .in("id", orderedIds);
    const byId = new Map((catData ?? []).map((r) => [r.id as string, mapRow(r)]));
    // 지정 순서 유지(비공개/삭제된 건 건너뜀)
    cats = orderedIds.map((id) => byId.get(id)).filter((c): c is ExploreCategory => !!c);
  } else {
    const { data: catData } = await supabase
      .from("explore_categories")
      .select(EXPLORE_COLUMNS)
      .eq("published", true)
      .order("sort", { ascending: true });
    cats = (catData ?? []).map(mapRow);
  }
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

// ── 사진→카테고리 할당(어드민) ────────────────
// 사진을 포트폴리오(앨범)별로 묶어 보고, 사진마다 카테고리를 토글한다.
export type AssignPhoto = {
  id: string;
  thumb_url: string | null;
  src_url: string;
  album_id: string | null;
  album_title: string | null;
  photographer_name: string | null;
};

// 할당 그리드 항목 — 사진 + 현재 소속 카테고리 id 들.
export type AssignPhotoWithCats = AssignPhoto & { categoryIds: string[] };

// 할당 그리드용 사진 — published 전체(최신순). RLS(승인작가·published) 태움.
// PostgREST 페이지 상한(1000)을 넘겨도 range 로 순회해 모두 수집(어드민 전량 로드).
export async function fetchAllExploreAssignPhotos(): Promise<AssignPhoto[]> {
  const supabase = await createClient();
  const PAGE = 1000;
  const out: AssignPhoto[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("photos")
      .select(
        "id, thumb_url, src_url, album_id, album:albums(title), photographer:photographers!photos_photographer_id_fkey!inner(display_name)"
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    const batch = (data ?? []).map((r) => {
      const rr = r as Record<string, unknown>;
      const album = rr.album as { title: string | null } | null;
      const photographer = rr.photographer as { display_name: string | null } | null;
      return {
        id: rr.id as string,
        thumb_url: rr.thumb_url as string | null,
        src_url: rr.src_url as string,
        album_id: rr.album_id as string | null,
        album_title: album?.title ?? null,
        photographer_name: photographer?.display_name ?? null,
      };
    });
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

// 전체 멤버십 → { photoId: [categoryId...] }. 조인 테이블은 담긴 것만 있어 작다.
export async function getAllExploreMemberships(): Promise<Record<string, string[]>> {
  const admin = createAdminClient();
  const out: Record<string, string[]> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("explore_category_photos")
      .select("photo_id, category_id")
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as Array<{ photo_id: string; category_id: string }>;
    for (const r of batch) (out[r.photo_id] ??= []).push(r.category_id);
    if (batch.length < PAGE) break;
  }
  return out;
}

// 카테고리 내 다음 position(맨 뒤에 추가) — 없으면 0.
async function nextExplorePosition(
  admin: ReturnType<typeof createAdminClient>,
  categoryId: string
): Promise<number> {
  const { data } = await admin
    .from("explore_category_photos")
    .select("position")
    .eq("category_id", categoryId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data?.position as number) ?? -1) + 1;
}

// 사진 1장을 카테고리에 추가(맨 뒤) — 이미 있으면 무시.
export async function addPhotoToCategory(photoId: string, categoryId: string): Promise<void> {
  const admin = createAdminClient();
  const position = await nextExplorePosition(admin, categoryId);
  await admin
    .from("explore_category_photos")
    .upsert(
      { category_id: categoryId, photo_id: photoId, position },
      { onConflict: "category_id,photo_id", ignoreDuplicates: true }
    );
}

// 사진 1장을 카테고리에서 제거.
export async function removePhotoFromCategory(photoId: string, categoryId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("explore_category_photos")
    .delete()
    .eq("category_id", categoryId)
    .eq("photo_id", photoId);
}

// 앨범(포트폴리오)의 published 사진 전체를 카테고리에 추가 — 이미 담긴 건 건너뜀. 추가된 수 반환.
export async function addAlbumPhotosToCategory(
  albumId: string,
  categoryId: string
): Promise<number> {
  const admin = createAdminClient();
  const { data: photos } = await admin
    .from("photos")
    .select("id")
    .eq("album_id", albumId)
    .eq("visibility", "published");
  const ids = (photos ?? []).map((p) => p.id as string);
  if (ids.length === 0) return 0;
  const { data: existing } = await admin
    .from("explore_category_photos")
    .select("photo_id")
    .eq("category_id", categoryId)
    .in("photo_id", ids);
  const have = new Set((existing ?? []).map((e) => e.photo_id as string));
  const toAdd = ids.filter((id) => !have.has(id));
  if (toAdd.length === 0) return 0;
  let pos = await nextExplorePosition(admin, categoryId);
  const rows = toAdd.map((photo_id) => ({ category_id: categoryId, photo_id, position: pos++ }));
  await admin.from("explore_category_photos").insert(rows);
  return toAdd.length;
}

// 앨범(포트폴리오)의 사진 전체를 카테고리에서 제거.
export async function removeAlbumPhotosFromCategory(
  albumId: string,
  categoryId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: photos } = await admin.from("photos").select("id").eq("album_id", albumId);
  const ids = (photos ?? []).map((p) => p.id as string);
  if (ids.length === 0) return;
  await admin
    .from("explore_category_photos")
    .delete()
    .eq("category_id", categoryId)
    .in("photo_id", ids);
}
