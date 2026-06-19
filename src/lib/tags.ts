import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type TagUsage = {
  tag: string;
  publishedCount: number; // 공개 사진 기준 (카테고리 매칭에 실제로 쓰이는 수)
  totalCount: number; // 전체(공개+비공개) 사진 기준
  mapped: boolean; // 어떤 카테고리에 매핑돼 있는지
};

export type TagUsageResult = {
  tags: TagUsage[];
  photoCount: number; // 집계 대상 사진 수
  mappedTagCount: number; // 매핑된 고유 태그 수
};

// 사진에 실제로 쓰인 태그 목록 + 빈도 + 카테고리 매핑 여부.
// mood_tags 는 배열 컬럼이라 SQL group-by 대신 JS로 집계한다.
// 사진에 실제로 쓰인 고유 태그 이름만 (공개 빈도 높은 순) — 카테고리 태그 선택용.
export async function listAllTags(): Promise<string[]> {
  const { tags } = await listTagUsage();
  return tags.map((t) => t.tag);
}

export async function listTagUsage(): Promise<TagUsageResult> {
  const admin = createAdminClient();

  const { data: photos } = await admin.from("photos").select("mood_tags, visibility");

  const total = new Map<string, number>();
  const published = new Map<string, number>();
  for (const p of photos ?? []) {
    const tags = (p.mood_tags as string[] | null) ?? [];
    const isPublished = p.visibility === "published";
    // 한 사진 안에서 중복된 태그는 1회만 카운트
    for (const t of new Set(tags)) {
      total.set(t, (total.get(t) ?? 0) + 1);
      if (isPublished) published.set(t, (published.get(t) ?? 0) + 1);
    }
  }

  // 카테고리에 매핑된 태그 집합
  const { data: cats } = await admin.from("categories").select("tags");
  const mappedSet = new Set<string>();
  for (const c of cats ?? []) {
    for (const t of (c.tags as string[] | null) ?? []) mappedSet.add(t);
  }

  // 정렬: 공개 빈도 ↓ → 전체 빈도 ↓ → 가나다순
  const tags: TagUsage[] = [...total.entries()]
    .map(([tag, totalCount]) => ({
      tag,
      totalCount,
      publishedCount: published.get(tag) ?? 0,
      mapped: mappedSet.has(tag),
    }))
    .sort(
      (a, b) =>
        b.publishedCount - a.publishedCount ||
        b.totalCount - a.totalCount ||
        a.tag.localeCompare(b.tag, "ko"),
    );

  return {
    tags,
    photoCount: photos?.length ?? 0,
    mappedTagCount: tags.filter((t) => t.mapped).length,
  };
}
