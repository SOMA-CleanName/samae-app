import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type Category = {
  id: string;
  slug: string;
  name: string;
  description: string;
  tags: string[];
  published: boolean;
  sort: number;
};

function mapRow(r: Record<string, unknown>): Category {
  return {
    id: r.id as string,
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string) ?? "",
    tags: (r.tags as string[]) ?? [],
    published: !!r.published,
    sort: (r.sort as number) ?? 0,
  };
}

// 운영자용 — 전체 카테고리 + 각 카테고리에 매칭되는 공개 사진 수
export async function listCategoriesWithCounts(): Promise<Array<Category & { photoCount: number }>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("categories")
    .select("id, slug, name, description, tags, published, sort")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });

  const cats = (data ?? []).map(mapRow);

  // 카테고리 태그와 겹치는 공개 사진 수 (배열 overlap)
  const counts = await Promise.all(
    cats.map(async (c) => {
      if (c.tags.length === 0) return 0;
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
    .select("id, slug, name, description, tags, published, sort")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  return data ? mapRow(data) : null;
}

// 공개 카테고리 목록 (탐색 상단 칩 등)
export async function listPublishedCategories(): Promise<Category[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("categories")
    .select("id, slug, name, description, tags, published, sort")
    .eq("published", true)
    .order("sort", { ascending: true });
  return (data ?? []).map(mapRow);
}
