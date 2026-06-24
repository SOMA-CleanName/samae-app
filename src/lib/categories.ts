import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export { UNTAGGED_TOKEN, isUntaggedCategory } from "@/lib/category-constants";
import { isUntaggedCategory } from "@/lib/category-constants";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  published: boolean;
  sort: number;
  adPhotoIds: string[]; // 광고 소재로 채택한 사진 id (A/B 여러 장 가능)
};

const CATEGORY_COLUMNS = "id, slug, name, description, tags, published, sort, ad_photo_ids";

function mapRow(r: Record<string, unknown>): Category {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    tags: (r.tags as string[]) ?? [],
    published: !!r.published,
    sort: (r.sort as number) ?? 0,
    adPhotoIds: (r.ad_photo_ids as string[]) ?? [],
  };
}

// 채택 후보/선택된 광고 사진 썸네일
export type AdCandidatePhoto = {
  id: string;
  thumb_url: string | null;
  src_url: string;
};

// 운영자용 — 전체 카테고리 + 각 카테고리에 매칭되는 공개 사진 수
export async function listCategoriesWithCounts(): Promise<Array<Category & { photoCount: number }>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });

  const cats = (data ?? []).map(mapRow);

  // 카테고리 태그와 겹치는 공개 사진 수 (배열 overlap)
  const counts = await Promise.all(
    cats.map(async (c) => {
      if (c.tags.length === 0) return 0;
      // 임시: 미태그 카테고리는 mood_tags 가 빈 사진을 매칭
      if (isUntaggedCategory(c.tags)) {
        const { count } = await admin
          .from("photos")
          .select("id", { count: "exact", head: true })
          .eq("visibility", "published")
          .eq("mood_tags", "{}");
        return count ?? 0;
      }
      const { count } = await admin
        .from("photos")
        .select("id", { count: "exact", head: true })
        .eq("visibility", "published")
        .overlaps("mood_tags", c.tags);
      return count ?? 0;
    })
  );

  return cats.map((c, i) => ({ ...c, photoCount: counts[i] }));
}

// 공개 카테고리 1건 (slug) — 랜딩 페이지용
export async function getPublishedCategory(slug: string): Promise<Category | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

// 어드민 광고 소재 채택용 — 카테고리에 매칭되는 공개 사진 썸네일 후보.
// 이미 채택된 사진은 후보 윈도우 밖이라도 항상 포함해 체크 상태를 유지한다.
export async function fetchAdCandidates(
  category: Pick<Category, "tags" | "adPhotoIds">,
  limit = 300
): Promise<AdCandidatePhoto[]> {
  const admin = createAdminClient();
  const select = "id, thumb_url, src_url";

  let query = admin.from("photos").select(select).eq("visibility", "published");
  query = isUntaggedCategory(category.tags)
    ? query.eq("mood_tags", "{}")
    : query.overlaps("mood_tags", category.tags);
  const { data } = await query.order("created_at", { ascending: false }).limit(limit);

  const candidates = (data ?? []) as AdCandidatePhoto[];
  const have = new Set(candidates.map((p) => p.id));
  const missingAdopted = category.adPhotoIds.filter((id) => !have.has(id));

  if (missingAdopted.length > 0) {
    const { data: extra } = await admin.from("photos").select(select).in("id", missingAdopted);
    // 채택된 사진을 맨 앞에 둬서 잘 보이게
    return [...((extra ?? []) as AdCandidatePhoto[]), ...candidates];
  }
  return candidates;
}

// 공개 카테고리 목록 (탐색 상단 칩 등)
export async function listPublishedCategories(): Promise<Category[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("categories")
    .select(CATEGORY_COLUMNS)
    .eq("published", true)
    .order("sort", { ascending: true });
  return (data ?? []).map(mapRow);
}
