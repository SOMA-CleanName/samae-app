import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AD_CONSENT_VERSION } from "@/lib/ad-consent";

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

/**
 * 작가·운영자 선택 UI 용 — 공개 타겟 + 각 타겟에 연결된 공개 탐색 카테고리.
 * (타겟 4개 × 탐색 수십 개 규모라 한 번에 읽어 메모리에서 조립한다)
 */
export type TargetWithExplores = {
  id: string;
  slug: string;
  name: string;
  explores: Array<{ id: string; title: string }>;
};

export async function listTargetsWithExplores(): Promise<TargetWithExplores[]> {
  const admin = createAdminClient();
  const [{ data: targets }, { data: links }, { data: explores }] = await Promise.all([
    admin
      .from("categories")
      .select("id, slug, name")
      .eq("published", true)
      .order("sort", { ascending: true }),
    admin
      .from("target_explore_categories")
      .select("target_category_id, explore_category_id, position")
      .order("position", { ascending: true }),
    admin.from("explore_categories").select("id, title").eq("published", true),
  ]);

  const titleById = new Map((explores ?? []).map((e) => [e.id as string, e.title as string]));
  const byTarget = new Map<string, Array<{ id: string; title: string }>>();
  for (const l of links ?? []) {
    const title = titleById.get(l.explore_category_id as string);
    if (!title) continue; // 비공개·삭제된 탐색 카테고리는 제외
    const arr = byTarget.get(l.target_category_id as string) ?? [];
    arr.push({ id: l.explore_category_id as string, title });
    byTarget.set(l.target_category_id as string, arr);
  }

  return (targets ?? []).map((t) => ({
    id: t.id as string,
    slug: t.slug as string,
    name: t.name as string,
    explores: byTarget.get(t.id as string) ?? [],
  }));
}

export type AlbumCategoryState = {
  targetId: string | null;
  exploreIds: string[];
  requestedMoods: string[]; // 작가가 직접 적은 희망 무드(운영자 검토 대기)
  adConsent: boolean; // 사매 광고 소재 사용 동의
};

/** 앨범(포트폴리오)들의 현재 카테고리 선택 — 편집 폼 기본값. */
export async function loadAlbumCategorySelections(
  albumIds: string[]
): Promise<Map<string, AlbumCategoryState>> {
  const out = new Map<string, AlbumCategoryState>();
  if (albumIds.length === 0) return out;
  const admin = createAdminClient();
  const [{ data: albums }, { data: links }] = await Promise.all([
    admin
      .from("albums")
      .select("id, target_category_id, requested_moods, ad_consent")
      .in("id", albumIds),
    admin
      .from("album_explore_categories")
      .select("album_id, explore_category_id")
      .in("album_id", albumIds),
  ]);
  for (const a of albums ?? []) {
    out.set(a.id as string, {
      targetId: (a.target_category_id as string | null) ?? null,
      exploreIds: [],
      requestedMoods: (a.requested_moods as string[] | null) ?? [],
      adConsent: !!a.ad_consent,
    });
  }
  for (const l of links ?? []) {
    const cur = out.get(l.album_id as string);
    if (cur) cur.exploreIds.push(l.explore_category_id as string);
  }
  return out;
}

export const MAX_REQUESTED_MOODS = 5;
const REQUESTED_MOOD_MAX_LEN = 20;

/**
 * 앨범의 카테고리 선택 저장 — 타겟 1개(필수) + 그 타겟에 연결된 탐색 여러 개(선택).
 * 권한 검증은 호출부(서버액션)에서. 탐색이 그 타겟에 속하는지는 여기서 거른다.
 * 요청 무드는 카테고리를 만들지 않고 문자열로만 남긴다(운영자 검토용).
 */
export async function saveAlbumCategories(
  albumId: string,
  targetCategoryId: string,
  exploreCategoryIds: string[],
  opts?: { requestedMoods?: string[]; adConsent?: boolean; actorProfileId?: string | null }
): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { data: links } = await admin
    .from("target_explore_categories")
    .select("explore_category_id")
    .eq("target_category_id", targetCategoryId);
  const allowed = new Set((links ?? []).map((l) => l.explore_category_id as string));
  const picked = [...new Set(exploreCategoryIds)].filter((id) => allowed.has(id));

  const requested = [
    ...new Set(
      (opts?.requestedMoods ?? [])
        .map((m) => m.trim().slice(0, REQUESTED_MOOD_MAX_LEN))
        .filter(Boolean)
    ),
  ].slice(0, MAX_REQUESTED_MOODS);
  const adConsent = !!opts?.adConsent;

  // 동의 상태가 '바뀐 경우에만' 시각·버전을 갱신하고 이력을 남긴다.
  // (매 저장마다 시각을 덮어쓰면 '언제 동의했는지'가 사라진다)
  const { data: prev } = await admin
    .from("albums")
    .select("ad_consent")
    .eq("id", albumId)
    .maybeSingle();
  const changed = !!prev && !!prev.ad_consent !== adConsent;
  const now = new Date().toISOString();

  const { error: upErr } = await admin
    .from("albums")
    .update({
      target_category_id: targetCategoryId,
      requested_moods: requested,
      ad_consent: adConsent,
      // 철회해도 마지막 동의 시각·버전은 남긴다(증적) — 현재 동의 여부는 ad_consent 로 판단.
      ...(changed && adConsent
        ? { ad_consent_at: now, ad_consent_version: AD_CONSENT_VERSION }
        : {}),
    })
    .eq("id", albumId);
  if (upErr) return { error: upErr.message };

  if (changed) {
    await admin.from("album_ad_consent_logs").insert({
      album_id: albumId,
      consented: adConsent,
      version: AD_CONSENT_VERSION,
      actor: opts?.actorProfileId ?? null,
    });
  }

  const { error: delErr } = await admin
    .from("album_explore_categories")
    .delete()
    .eq("album_id", albumId);
  if (delErr) return { error: delErr.message };

  if (picked.length === 0) return {}; // 무드는 선택 — 안 고르면 연결 없이 저장

  const { error } = await admin
    .from("album_explore_categories")
    .insert(picked.map((id) => ({ album_id: albumId, explore_category_id: id })));
  return error ? { error: error.message } : {};
}

/** 어드민 — 작가가 직접 적은 요청 무드가 있는 포트폴리오 목록(검토 대기). */
export type AlbumMoodRequest = {
  albumId: string;
  title: string | null;
  photographer: string | null;
  moods: string[];
  adConsent: boolean;
};

export async function listAlbumMoodRequests(): Promise<AlbumMoodRequest[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("albums")
    .select("id, title, requested_moods, ad_consent, photographer:photographers(display_name)")
    .neq("requested_moods", "{}")
    .order("updated_at", { ascending: false });
  return (data ?? []).map((a) => {
    // PostgREST 조인은 배열로 오기도 한다(관계 카디널리티 추론) — 둘 다 받는다.
    const raw = a.photographer as
      | { display_name: string | null }
      | Array<{ display_name: string | null }>
      | null;
    const ph = Array.isArray(raw) ? raw[0] ?? null : raw;
    return {
      albumId: a.id as string,
      title: (a.title as string | null) ?? null,
      photographer: ph?.display_name ?? null,
      moods: (a.requested_moods as string[] | null) ?? [],
      adConsent: !!a.ad_consent,
    };
  });
}

/** 어드민 할당 화면 — 앨범별 요청 무드·광고동의 (헤더 배지용). */
export async function loadAlbumFlags(): Promise<
  Record<string, { moods: string[]; adConsent: boolean }>
> {
  const admin = createAdminClient();
  const { data } = await admin.from("albums").select("id, requested_moods, ad_consent");
  const out: Record<string, { moods: string[]; adConsent: boolean }> = {};
  for (const a of data ?? []) {
    out[a.id as string] = {
      moods: (a.requested_moods as string[] | null) ?? [],
      adConsent: !!a.ad_consent,
    };
  }
  return out;
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

// ── 사진 단위 예외 (타겟) ───────────────────────────────────────────

/** 타겟 카테고리에 사진 1장 수동 추가(제외 표시가 있으면 함께 해제). */
export async function addPhotoToTarget(photoId: string, targetCategoryId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("target_category_photos")
    .upsert(
      { category_id: targetCategoryId, photo_id: photoId, excluded: false },
      { onConflict: "category_id,photo_id" }
    );
}

/**
 * 타겟 카테고리에서 사진 1장 빼기.
 * 포트폴리오 상속분이면 행을 지워도 다시 들어오므로 '제외' 표시를 남긴다.
 */
export async function removePhotoFromTarget(
  photoId: string,
  targetCategoryId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: photo } = await admin
    .from("photos")
    .select("album_id")
    .eq("id", photoId)
    .maybeSingle();
  const albumId = (photo?.album_id as string | null) ?? null;
  let inherited = false;
  if (albumId) {
    const { data: album } = await admin
      .from("albums")
      .select("target_category_id")
      .eq("id", albumId)
      .maybeSingle();
    inherited = (album?.target_category_id as string | null) === targetCategoryId;
  }

  if (inherited) {
    await admin
      .from("target_category_photos")
      .upsert(
        { category_id: targetCategoryId, photo_id: photoId, excluded: true },
        { onConflict: "category_id,photo_id" }
      );
    return;
  }
  await admin
    .from("target_category_photos")
    .delete()
    .eq("category_id", targetCategoryId)
    .eq("photo_id", photoId);
}

/**
 * 할당 화면용 — 사진이 그 카테고리에 '왜' 들어있는지까지.
 *  inherited: 작가가 포트폴리오에서 고름 / manual: 운영자가 손으로 담음 / excluded: 운영자가 뺌
 * 화면에서 출처를 구분해 보여주고, 작가 선택을 덮어쓸 때 경고하기 위해 쓴다.
 */
export type MembershipSource = {
  inherited: string[];
  manual: string[];
  excluded: string[];
};

export async function getExploreMembershipSources(): Promise<Record<string, MembershipSource>> {
  const admin = createAdminClient();
  const out: Record<string, MembershipSource> = {};
  const bucket = (pid: string) =>
    (out[pid] ??= { inherited: [], manual: [], excluded: [] });

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("explore_category_photos")
      .select("photo_id, category_id, excluded")
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as Array<{
      photo_id: string;
      category_id: string;
      excluded: boolean;
    }>;
    for (const r of batch) {
      const b = bucket(r.photo_id);
      (r.excluded ? b.excluded : b.manual).push(r.category_id);
    }
    if (batch.length < PAGE) break;
  }

  const { data: links } = await admin
    .from("album_explore_categories")
    .select("album_id, explore_category_id");
  const catsByAlbum = new Map<string, string[]>();
  for (const l of links ?? []) {
    const aid = l.album_id as string;
    catsByAlbum.set(aid, [...(catsByAlbum.get(aid) ?? []), l.explore_category_id as string]);
  }
  const albumIds = [...catsByAlbum.keys()];
  for (let i = 0; i < albumIds.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id, album_id")
      .in("album_id", albumIds.slice(i, i + 100));
    for (const p of data ?? []) {
      const cats = catsByAlbum.get(p.album_id as string) ?? [];
      if (cats.length > 0) bucket(p.id as string).inherited.push(...cats);
    }
  }
  return out;
}

/** 타겟 축의 출처 — 앨범의 target_category_id 상속 + target_category_photos 예외. */
export async function getTargetMembershipSources(): Promise<Record<string, MembershipSource>> {
  const admin = createAdminClient();
  const out: Record<string, MembershipSource> = {};
  const bucket = (pid: string) =>
    (out[pid] ??= { inherited: [], manual: [], excluded: [] });

  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("target_category_photos")
      .select("photo_id, category_id, excluded")
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as Array<{
      photo_id: string;
      category_id: string;
      excluded: boolean;
    }>;
    for (const r of batch) {
      const b = bucket(r.photo_id);
      (r.excluded ? b.excluded : b.manual).push(r.category_id);
    }
    if (batch.length < PAGE) break;
  }

  const { data: albums } = await admin
    .from("albums")
    .select("id, target_category_id")
    .not("target_category_id", "is", null);
  const targetByAlbum = new Map(
    (albums ?? []).map((a) => [a.id as string, a.target_category_id as string])
  );
  const albumIds = [...targetByAlbum.keys()];
  for (let i = 0; i < albumIds.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id, album_id")
      .in("album_id", albumIds.slice(i, i + 100));
    for (const p of data ?? []) {
      const t = targetByAlbum.get(p.album_id as string);
      if (t) bucket(p.id as string).inherited.push(t);
    }
  }
  return out;
}

/** 할당 화면용 — 사진별 실효 타겟 소속(상속 ∪ 수동 − 제외). */
export async function getAllTargetMemberships(): Promise<Record<string, string[]>> {
  const admin = createAdminClient();
  const manual: Record<string, Set<string>> = {};
  const excluded: Record<string, Set<string>> = {};
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await admin
      .from("target_category_photos")
      .select("photo_id, category_id, excluded")
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as Array<{
      photo_id: string;
      category_id: string;
      excluded: boolean;
    }>;
    for (const r of batch) {
      const bucket = r.excluded ? excluded : manual;
      (bucket[r.photo_id] ??= new Set()).add(r.category_id);
    }
    if (batch.length < PAGE) break;
  }

  // 상속분 — 앨범의 타겟 × 그 앨범 사진
  const { data: albums } = await admin
    .from("albums")
    .select("id, target_category_id")
    .not("target_category_id", "is", null);
  const targetByAlbum = new Map(
    (albums ?? []).map((a) => [a.id as string, a.target_category_id as string])
  );
  const inherited: Record<string, Set<string>> = {};
  const albumIds = [...targetByAlbum.keys()];
  for (let i = 0; i < albumIds.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id, album_id")
      .in("album_id", albumIds.slice(i, i + 100));
    for (const p of data ?? []) {
      const t = targetByAlbum.get(p.album_id as string);
      if (t) (inherited[p.id as string] ??= new Set()).add(t);
    }
  }

  const out: Record<string, string[]> = {};
  for (const pid of new Set([...Object.keys(manual), ...Object.keys(inherited)])) {
    const eff = new Set([...(manual[pid] ?? []), ...(inherited[pid] ?? [])]);
    for (const c of excluded[pid] ?? []) eff.delete(c);
    if (eff.size > 0) out[pid] = [...eff];
  }
  return out;
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

// ── 탐색탭 렌더 데이터 ──────────────────────────────────────────────

type PhotoLite = { id: string; src_url: string; thumb_url: string | null };

async function fetchPhotoLites(ids: string[]): Promise<Map<string, PhotoLite>> {
  const out = new Map<string, PhotoLite>();
  if (ids.length === 0) return out;
  const admin = createAdminClient();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await admin
      .from("photos")
      .select("id, src_url, thumb_url")
      .in("id", ids.slice(i, i + 100))
      .eq("visibility", "published");
    for (const p of (data ?? []) as PhotoLite[]) out.set(p.id, p);
  }
  return out;
}

export type CurationSlide = {
  slug: string; // 타겟 slug — /c/<slug> 로 연결
  title: string;
  subtitle: string;
  shots: Array<{ id: string; url: string }>;
};

/**
 * '오늘의 큐레이션' 슬라이드 — 타겟당 운영자가 지정한 3장.
 * 지정이 모자라면 그 타겟에 담긴 사진(상속 포함)으로 채운다.
 */
export async function loadCurationSlides(
  targets: Array<{ id: string; slug: string; name: string; description: string; curationPhotoIds: string[] }>
): Promise<CurationSlide[]> {
  if (targets.length === 0) return [];

  // 1차 — 지정된 사진을 한 번에 조회
  const picked = new Map<string, string[]>();
  for (const t of targets) picked.set(t.id, t.curationPhotoIds.slice(0, CURATION_SLOTS));
  const lites = await fetchPhotoLites([...picked.values()].flat());

  // 2차 — 3장이 안 되는 타겟만 담긴 사진으로 보충
  const slides: CurationSlide[] = [];
  for (const t of targets) {
    let ids = (picked.get(t.id) ?? []).filter((id) => lites.has(id));
    if (ids.length < CURATION_SLOTS) {
      const all = await resolveTargetPhotoIds(t.id);
      const extraIds = all.filter((id) => !ids.includes(id)).slice(0, CURATION_SLOTS - ids.length);
      const extra = await fetchPhotoLites(extraIds);
      for (const [id, p] of extra) lites.set(id, p);
      ids = [...ids, ...extraIds.filter((id) => extra.has(id))];
    }
    if (ids.length === 0) continue; // 보여줄 게 없으면 슬라이드에서 제외
    slides.push({
      slug: t.slug,
      title: t.name,
      subtitle: t.description,
      shots: ids.map((id) => ({ id, url: lites.get(id)!.src_url })),
    });
  }
  return slides;
}

export type MoodGridItem = { slug: string; title: string; subtitle: string; url: string };

/**
 * '추천 무드' 타일 — 타겟에 연결된 탐색 카테고리 + 타겟별 대표 사진.
 * 대표사진 우선순위: 타겟별 지정 → 미리보기 지정 1번 → 담긴 첫 장(상속 포함).
 * 담긴 사진이 아예 없는 무드는 타일에서 뺀다(빈 타일 방지).
 */
export async function loadMoodItemsForTarget(targetCategoryId: string): Promise<MoodGridItem[]> {
  const cats = await listExploreCategoriesForTarget(targetCategoryId);
  if (cats.length === 0) return [];

  const coverIds = new Map<string, string>();
  for (const c of cats) {
    const id = coverPhotoIdForTarget(c, targetCategoryId);
    if (id) coverIds.set(c.id, id);
  }
  // 지정이 없는 무드만 담긴 사진에서 첫 장을 가져온다.
  for (const c of cats) {
    if (coverIds.has(c.id)) continue;
    const ids = await resolveExplorePhotoIds(c.id);
    if (ids[0]) coverIds.set(c.id, ids[0]);
  }

  const lites = await fetchPhotoLites([...coverIds.values()]);
  const items: MoodGridItem[] = [];
  for (const c of cats) {
    const photo = lites.get(coverIds.get(c.id) ?? "");
    if (!photo) continue;
    items.push({ slug: c.slug, title: c.title, subtitle: c.subtitle, url: photo.src_url });
  }
  return items;
}

/**
 * 어드민 지정 화면용 후보 — 그 타겟에 담긴 사진(상속 ∪ 수동 − 제외) 앞부분.
 * 이미 고른 사진은 후보 밖이라도 항상 포함해 체크 상태가 유지되게 한다.
 */
export async function loadTargetPhotoCandidates(
  targetCategoryId: string,
  keepIds: string[] = [],
  limit = 300
): Promise<PhotoLite[]> {
  const ids = (await resolveTargetPhotoIds(targetCategoryId)).slice(0, limit);
  const merged = [...new Set([...keepIds, ...ids])];
  const lites = await fetchPhotoLites(merged);
  return merged.map((id) => lites.get(id)).filter((p): p is PhotoLite => !!p);
}

/** 어드민 — 탐색 카테고리에 담긴 사진 후보(대표사진 지정용). */
export async function loadExplorePhotoCandidates(
  exploreCategoryId: string,
  keepIds: string[] = [],
  limit = 300
): Promise<PhotoLite[]> {
  const ids = (await resolveExplorePhotoIds(exploreCategoryId)).slice(0, limit);
  const merged = [...new Set([...keepIds, ...ids])];
  const lites = await fetchPhotoLites(merged);
  return merged.map((id) => lites.get(id)).filter((p): p is PhotoLite => !!p);
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
