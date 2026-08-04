import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// 타겟 카테고리(categories) × 탐색 카테고리(explore_categories) 체계.
//
//  · 타겟 1개 ↔ 탐색 N개 (target_explore_categories, N:M — 한 무드를 여러 타겟이 공유)
//  · 작가는 포트폴리오(앨범) 단위로 타겟 1개 + 그 타겟의 탐색 여러 개를 고른다.
//  · 사진 멤버십 = (포트폴리오 상속) ∪ (운영자 수동 추가) − (운영자 수동 제외)
//
// 멤버십을 매번 계산하는 이유: 작가가 앨범 카테고리를 바꾸면 즉시 반영돼야 하고,
// 사진 수천 장 규모에선 id 집합 연산이 조인보다 싸다(캐시는 호출부 책임).

export type ExploreCategoryLite = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  kind: string;
  coverByTarget: Record<string, string>;
  coverByPurpose: Record<string, string>;
  previewPhotoIds: string[];
};

const EXPLORE_LITE_COLUMNS =
  "id, slug, title, subtitle, kind, cover_by_target, cover_by_purpose, preview_photo_ids";

function mapExplore(r: Record<string, unknown>): ExploreCategoryLite {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? "",
    kind: (r.kind as string) ?? "other",
    coverByTarget: (r.cover_by_target as Record<string, string>) ?? {},
    coverByPurpose: (r.cover_by_purpose as Record<string, string>) ?? {},
    previewPhotoIds: (r.preview_photo_ids as string[]) ?? [],
  };
}

// ── 타겟 ↔ 탐색 연결 ────────────────────────────────────────────────

/** 타겟에 연결된 공개 탐색 카테고리 (연결 position 순). */
export async function listExploreCategoriesForTarget(
  targetCategoryId: string
): Promise<ExploreCategoryLite[]> {
  const admin = createAdminClient();
  const { data: links } = await admin
    .from("target_explore_categories")
    .select("explore_category_id, position")
    .eq("target_category_id", targetCategoryId)
    .order("position", { ascending: true });
  const ids = (links ?? []).map((l) => l.explore_category_id as string);
  if (ids.length === 0) return [];

  const { data } = await admin
    .from("explore_categories")
    .select(EXPLORE_LITE_COLUMNS)
    .in("id", ids)
    .eq("published", true);
  const byId = new Map((data ?? []).map((r) => [r.id as string, mapExplore(r)]));
  // 연결 순서 유지(비공개·삭제된 건 건너뜀)
  return ids.map((id) => byId.get(id)).filter((c): c is ExploreCategoryLite => !!c);
}

/** 탐색 카테고리가 속한 타겟 id 목록 (작가 UI 검증용). */
export async function listTargetIdsForExplore(exploreCategoryId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("target_explore_categories")
    .select("target_category_id")
    .eq("explore_category_id", exploreCategoryId);
  return (data ?? []).map((r) => r.target_category_id as string);
}

/** 운영자 — 타겟에 연결할 탐색 카테고리를 통째로 교체(순서 = 배열 순서). */
export async function setTargetExploreCategories(
  targetCategoryId: string,
  exploreCategoryIds: string[]
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error: delErr } = await admin
    .from("target_explore_categories")
    .delete()
    .eq("target_category_id", targetCategoryId);
  if (delErr) return { error: delErr.message };
  if (exploreCategoryIds.length === 0) return {};

  const rows = exploreCategoryIds.map((id, i) => ({
    target_category_id: targetCategoryId,
    explore_category_id: id,
    position: i,
  }));
  const { error } = await admin.from("target_explore_categories").insert(rows);
  return error ? { error: error.message } : {};
}

// ── 사진 멤버십 (상속 ∪ 수동추가 − 수동제외) ─────────────────────────

type Override = { photo_id: string; excluded: boolean; position: number };

// 앨범 id 목록 → 그 앨범들의 공개 사진 id (최신순)
async function publishedPhotoIdsOfAlbums(albumIds: string[]): Promise<string[]> {
  if (albumIds.length === 0) return [];
  const admin = createAdminClient();
  const out: string[] = [];
  // .in() URL 길이 방어 — 앨범 100개씩 끊어 조회
  for (let i = 0; i < albumIds.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id")
      .in("album_id", albumIds.slice(i, i + 100))
      .eq("visibility", "published")
      .order("created_at", { ascending: false });
    out.push(...(data ?? []).map((p) => p.id as string));
  }
  return out;
}

// 수동 추가/제외를 상속분에 얹어 최종 id 순서를 만든다(수동 추가가 앞).
function applyOverrides(inherited: string[], overrides: Override[]): string[] {
  const excluded = new Set(overrides.filter((o) => o.excluded).map((o) => o.photo_id));
  const manual = overrides
    .filter((o) => !o.excluded)
    .sort((a, b) => a.position - b.position)
    .map((o) => o.photo_id)
    .filter((id) => !excluded.has(id));
  const manualSet = new Set(manual);
  const rest = inherited.filter((id) => !excluded.has(id) && !manualSet.has(id));
  return [...manual, ...rest];
}

/** 탐색 카테고리의 최종 사진 id (수동 추가 → 상속 순). */
export async function resolveExplorePhotoIds(exploreCategoryId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: albumLinks }, { data: overrides }] = await Promise.all([
    admin
      .from("album_explore_categories")
      .select("album_id")
      .eq("explore_category_id", exploreCategoryId),
    admin
      .from("explore_category_photos")
      .select("photo_id, excluded, position")
      .eq("category_id", exploreCategoryId),
  ]);
  const inherited = await publishedPhotoIdsOfAlbums(
    (albumLinks ?? []).map((a) => a.album_id as string)
  );
  return applyOverrides(inherited, (overrides ?? []) as Override[]);
}

/** 타겟 카테고리의 최종 사진 id (수동 추가 → 상속 순). */
export async function resolveTargetPhotoIds(targetCategoryId: string): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: albums }, { data: overrides }] = await Promise.all([
    admin.from("albums").select("id").eq("target_category_id", targetCategoryId),
    admin
      .from("target_category_photos")
      .select("photo_id, excluded, position")
      .eq("category_id", targetCategoryId),
  ]);
  const inherited = await publishedPhotoIdsOfAlbums((albums ?? []).map((a) => a.id as string));
  return applyOverrides(inherited, (overrides ?? []) as Override[]);
}

// ── 대표 사진 / 큐레이션 ────────────────────────────────────────────

/**
 * 추천 무드 카드에 걸 대표 사진 id.
 * 타겟별 지정(cover_by_target) → 미지정이면 호출부가 넘긴 폴백(담긴 첫 장) 순.
 */
export function coverPhotoIdForTarget(
  cat: Pick<ExploreCategoryLite, "coverByTarget" | "previewPhotoIds">,
  targetCategoryId: string | null,
  fallbackPhotoId?: string
): string | undefined {
  if (targetCategoryId && cat.coverByTarget[targetCategoryId]) {
    return cat.coverByTarget[targetCategoryId];
  }
  return cat.previewPhotoIds[0] ?? fallbackPhotoId;
}

/** 운영자 — 탐색 카테고리의 '타겟별 대표 사진' 지정/해제. */
export async function setExploreCoverForTarget(
  exploreCategoryId: string,
  targetCategoryId: string,
  photoId: string | null
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("explore_categories")
    .select("cover_by_target")
    .eq("id", exploreCategoryId)
    .maybeSingle();
  const cur = { ...(((data?.cover_by_target as Record<string, string>) ?? {}) as Record<string, string>) };
  if (photoId) cur[targetCategoryId] = photoId;
  else delete cur[targetCategoryId];

  const { error } = await admin
    .from("explore_categories")
    .update({ cover_by_target: cur })
    .eq("id", exploreCategoryId);
  return error ? { error: error.message } : {};
}

/** 운영자 — 타겟의 '오늘의 큐레이션' 사진(최대 3장) 지정. */
export const CURATION_SLOTS = 3;

export async function setTargetCurationPhotos(
  targetCategoryId: string,
  photoIds: string[]
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("categories")
    .update({ curation_photo_ids: photoIds.slice(0, CURATION_SLOTS) })
    .eq("id", targetCategoryId);
  return error ? { error: error.message } : {};
}
