import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveCoverForPurpose } from "@/lib/taste-purposes";
import type { GalleryPhoto } from "@/lib/discovery";

const GALLERY_SELECT =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)";

// 탐색 편집형 카테고리(DB) — 광고 랜딩 categories 와 별개 체계. (docs/20)
export type ExploreCategoryKind = "purpose" | "mood" | "other";

export type ExploreCategory = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  published: boolean;
  sort: number;
  previewPhotoIds: string[]; // /explore 홈 스트립에 노출할 사진 id (순서). 비면 position 순 앞 N장
  kind: ExploreCategoryKind; // 취향 테스트 분류: 목적/무드/기타
  coverByPurpose: Record<string, string>; // 무드 카테고리의 목적별 대표 사진 {purposeKey: photoId}
};

const EXPLORE_COLUMNS =
  "id, slug, title, subtitle, published, sort, preview_photo_ids, kind, cover_by_purpose";

function mapRow(r: Record<string, unknown>): ExploreCategory {
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    subtitle: (r.subtitle as string) ?? "",
    published: !!r.published,
    sort: (r.sort as number) ?? 0,
    previewPhotoIds: (r.preview_photo_ids as string[]) ?? [],
    kind: ((r.kind as string) ?? "other") as ExploreCategoryKind,
    coverByPurpose: (r.cover_by_purpose as Record<string, string> | null) ?? {},
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

  // 카테고리당 필요한 사진 id 만 추린다 — 전량 조회(.in 수천 개)는 URL 초과로 fetch 실패한다.
  // 필요분 = 미리보기 지정(앞 perCat) + position 순 앞 perCat(폴백용). 합쳐도 카테고리당 최대 2·perCat.
  const posByCat = new Map<string, string[]>();
  for (const c of cats) {
    posByCat.set(
      c.id,
      mem.filter((m) => m.category_id === c.id).map((m) => m.photo_id).slice(0, perCat)
    );
  }
  const neededIds = [
    ...new Set(
      cats.flatMap((c) => [...c.previewPhotoIds.slice(0, perCat), ...(posByCat.get(c.id) ?? [])])
    ),
  ];

  // 안전하게 청크(100개)로 나눠 조회 — 긴 .in URL 회피.
  const photoById = new Map<string, GalleryPhoto>();
  for (let i = 0; i < neededIds.length; i += 100) {
    const { data: photoData } = await supabase
      .from("photos")
      .select(GALLERY_SELECT)
      .in("id", neededIds.slice(i, i + 100))
      .eq("visibility", "published");
    for (const p of (photoData ?? []) as unknown as GalleryPhoto[]) photoById.set(p.id, p);
  }

  return cats.map((c) => {
    // position 순 (폴백/기본)
    const byPosition = (posByCat.get(c.id) ?? [])
      .map((id) => photoById.get(id))
      .filter((p): p is GalleryPhoto => !!p);
    // 미리보기 지정이 있으면 그 사진들을 앞에 두고, 나머지 담긴 사진으로 채운다.
    // (지정만 쓰면 2장만 골랐을 때 스트립이 빈약해지므로 — 항상 담긴 만큼 채워 노출)
    let photos = byPosition;
    if (c.previewPhotoIds.length > 0) {
      const previewIds = new Set(c.previewPhotoIds);
      const preview = c.previewPhotoIds
        .map((id) => photoById.get(id))
        .filter((p): p is GalleryPhoto => !!p);
      const rest = byPosition.filter((p) => !previewIds.has(p.id));
      photos = [...preview, ...rest];
    }
    return { category: c, photos: photos.slice(0, perCat) };
  });
}

// 게시물(앨범) 1건 — id=대표(커버) 사진 id(링크용), shots=앨범 사진 sort_order 순(최대 5장, 순환용).
export type RecentPost = { id: string; shots: { id: string; url: string }[] };

const SNAP_MAX_SHOTS = 5;

// 새로 올라온 스냅 — 최신 공개 게시물(앨범)당 사진들을 sort_order 순으로. 카드가 이 순서로 순환한다.
// 대형 앨범이 최근을 독식하지 않게 넉넉히 당겨 게시물 단위로 추린다.
export async function listRecentPhotos(limit = 12): Promise<RecentPost[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    // 작가명 노출 안 하므로 가벼운 컬럼만. !inner 로 미승인 작가 사진은 RLS 로 제외.
    .select(
      "id, src_url, album_id, sort_order, created_at, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    src_url: string;
    album_id: string | null;
    sort_order: number | null;
    created_at: string;
  }>;

  // 게시물(앨범) 단위 그룹핑 — 사진 모으고, 최신도는 첫 등장(=최신) created_at.
  const groups = new Map<string, { photos: (typeof rows)[number][]; recency: string }>();
  for (const p of rows) {
    const key = p.album_id ?? `photo:${p.id}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { photos: [p], recency: p.created_at });
    else g.photos.push(p);
  }

  return [...groups.values()]
    .sort((a, b) => (a.recency < b.recency ? 1 : -1))
    .slice(0, limit)
    .map((g) => {
      const shots = g.photos
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)) // 커버(최소)부터
        .slice(0, SNAP_MAX_SHOTS)
        .map((p) => ({ id: p.id, url: p.src_url }));
      return { id: shots[0]?.id ?? g.photos[0].id, shots };
    });
}

// Fisher-Yates 셔플 (원본 불변). 취향 테스트 방문마다 다른 구성용.
function shuffleArr<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let k = a.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [a[k], a[j]] = [a[j], a[k]];
  }
  return a;
}

// 취향 테스트용 사진 — 태그 다양성을 최대화해 최대 max 장. (비슷한 컷·한쪽 태그 쏠림 억제)
export type QuizPhoto = { id: string; url: string; tags: string[] };

export async function listDiverseQuizPhotos(max = 100): Promise<QuizPhoto[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    // mood_tags 있는 것만(취향 신호). !inner 로 미승인 작가 제외.
    .select(
      "id, src_url, thumb_url, album_id, mood_tags, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .not("mood_tags", "eq", "{}")
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    src_url: string;
    thumb_url: string | null;
    album_id: string | null;
    mood_tags: string[] | null;
  }>;

  // 게시물(앨범)당 1장만 후보로 — 같은 촬영 사진 배제, 최대한 다양하게. + 셔플(방문마다 다르게)
  const seenAlbum = new Set<string>();
  const eligible = rows.filter((r) => {
    if (!(r.mood_tags?.length)) return false;
    const k = r.album_id ?? `p:${r.id}`;
    if (seenAlbum.has(k)) return false;
    seenAlbum.add(k);
    return true;
  });
  const pool = shuffleArr(eligible);

  // 태그 → 사진들. 태그별로 한 장씩 라운드로빈해 최대한 다양한 태그가 고루 섞이게(태그 순서도 셔플).
  const tagMap = new Map<string, typeof pool>();
  for (const p of pool) {
    for (const t of p.mood_tags ?? []) {
      const arr = tagMap.get(t) ?? [];
      arr.push(p);
      tagMap.set(t, arr);
    }
  }
  const tags = shuffleArr([...tagMap.keys()]);
  const picked = new Set<string>();
  const out: typeof pool = [];
  let added = true;
  while (out.length < max && added) {
    added = false;
    for (const t of tags) {
      if (out.length >= max) break;
      const next = (tagMap.get(t) ?? []).find((p) => !picked.has(p.id));
      if (next) {
        picked.add(next.id);
        out.push(next);
        added = true;
      }
    }
  }

  return shuffleArr(out)
    .slice(0, max)
    .map((p) => ({ id: p.id, url: p.src_url, tags: p.mood_tags ?? [] }));
}

// 인기순 카테고리 id — 실지표(조회수 + 문의)로 점수 매겨 정렬.
// view = analytics_events(pageview) 중 /explore/{slug} 카운트.
// 문의 = inquiries.source_photo_id 가 그 카테고리에 담긴 사진인 건수.
// 점수 = 조회수 + 문의수·가중 + 문의전환율·가중 (튜닝 가능). 동점은 admin sort 순 유지(안정 정렬).
export async function rankExploreCategoriesByPopularity(windowDays = 60): Promise<string[]> {
  const admin = createAdminClient();
  const { data: catData } = await admin
    .from("explore_categories")
    .select("id, slug")
    .eq("published", true)
    .order("sort", { ascending: true });
  const cats = (catData ?? []).map((r) => ({ id: r.id as string, slug: r.slug as string }));
  if (cats.length === 0) return [];

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // 카테고리별 조회수 — /explore/{slug} pageview
  const { data: pv } = await admin
    .from("analytics_events")
    .select("path")
    .eq("type", "pageview")
    .like("path", "/explore/%")
    .gte("created_at", since)
    .limit(100000);
  const viewsBySlug = new Map<string, number>();
  for (const r of pv ?? []) {
    const m = ((r.path as string) || "").match(/^\/explore\/([^/?#]+)/);
    if (m) viewsBySlug.set(m[1], (viewsBySlug.get(m[1]) ?? 0) + 1);
  }

  // 멤버십(사진→카테고리) + 문의(source_photo_id) → 카테고리별 문의수
  const { data: memData } = await admin
    .from("explore_category_photos")
    .select("category_id, photo_id")
    .in(
      "category_id",
      cats.map((c) => c.id)
    );
  const catsByPhoto = new Map<string, string[]>();
  for (const m of memData ?? []) {
    const pid = m.photo_id as string;
    const arr = catsByPhoto.get(pid) ?? [];
    arr.push(m.category_id as string);
    catsByPhoto.set(pid, arr);
  }
  const { data: inqData } = await admin
    .from("inquiries")
    .select("source_photo_id")
    .not("source_photo_id", "is", null)
    .gte("created_at", since);
  const inqByCat = new Map<string, number>();
  for (const q of inqData ?? []) {
    for (const cid of catsByPhoto.get(q.source_photo_id as string) ?? []) {
      inqByCat.set(cid, (inqByCat.get(cid) ?? 0) + 1);
    }
  }

  const scored = cats.map((c, i) => {
    const views = viewsBySlug.get(c.slug) ?? 0;
    const inq = inqByCat.get(c.id) ?? 0;
    const ratio = views > 0 ? inq / views : 0;
    const score = views + inq * 30 + ratio * 200; // 튜닝 포인트
    return { id: c.id, score, order: i };
  });
  // 점수 내림차순, 동점은 admin sort 순
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.id);
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

// ── 취향 테스트 v2 (목적 칩 + 무드 스와이프) ──
export type QuizDeckPhoto = { id: string; url: string };
export type TasteCat = { id: string; title: string; slug: string };

export type MoodCard = { moodId: string; title: string; coverUrl: string };
export type PoolPhotoLite = { id: string; thumb_url: string | null; src_url: string };

// 취향 테스트 무드 덱 — 고른 목적(purposeKey)의 대표 사진이 지정된 공개 무드 카테고리. 셔플.
// 목적별로 cover_by_purpose[purposeKey] 가 달라 스와이프 사진이 목적마다 다르게 뜬다.
export async function listMoodDeckForPurpose(purposeKey: string): Promise<MoodCard[]> {
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from("explore_categories")
    .select("id, title, cover_by_purpose")
    .eq("published", true)
    .eq("kind", "mood")
    .order("sort", { ascending: true });
  const rows = (cats ?? []) as Array<{
    id: string;
    title: string;
    cover_by_purpose: Record<string, string> | null;
  }>;
  // 이 목적의 대표 사진(폴백 포함 — 미지정이면 다른 목적 대표를 가져옴, 커플↔웨딩 우선)
  const withCover = rows
    .map((r) => ({
      id: r.id,
      title: r.title,
      photoId: resolveCoverForPurpose(r.cover_by_purpose ?? {}, purposeKey),
    }))
    .filter((r): r is { id: string; title: string; photoId: string } => !!r.photoId);
  if (withCover.length === 0) return [];
  const { data: photos } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url")
    .in(
      "id",
      withCover.map((r) => r.photoId)
    )
    .eq("visibility", "published");
  const byId = new Map(
    (photos ?? []).map((p) => [
      p.id as string,
      p as { thumb_url: string | null; src_url: string },
    ])
  );
  const cards = withCover
    .map((r): MoodCard | null => {
      const p = byId.get(r.photoId);
      return p ? { moodId: r.id, title: r.title, coverUrl: p.thumb_url ?? p.src_url } : null;
    })
    .filter((c): c is MoodCard => !!c);
  return shuffleArr(cards);
}

// 어드민 — (무드 × 목적) 대표 사진 후보. 그 무드에 담긴 사진 ∩ 목적 참조 카테고리 사진.
export async function fetchMoodPurposeCandidates(
  moodCategoryId: string,
  purposeCatIds: string[]
): Promise<PoolPhotoLite[]> {
  const admin = createAdminClient();
  const { data: moodMem } = await admin
    .from("explore_category_photos")
    .select("photo_id")
    .eq("category_id", moodCategoryId);
  const moodIds = new Set((moodMem ?? []).map((m) => m.photo_id as string));
  if (moodIds.size === 0) return [];
  let ids = [...moodIds];
  if (purposeCatIds.length > 0) {
    const { data: purMem } = await admin
      .from("explore_category_photos")
      .select("photo_id")
      .in("category_id", purposeCatIds);
    const purSet = new Set((purMem ?? []).map((m) => m.photo_id as string));
    const inter = ids.filter((id) => purSet.has(id));
    if (inter.length > 0) ids = inter; // 교집합 있으면 그것만, 없으면 무드 전체(폴백)
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url")
    .in("id", ids)
    .eq("visibility", "published");
  return (data ?? []).map((r) => ({
    id: r.id as string,
    thumb_url: r.thumb_url as string | null,
    src_url: r.src_url as string,
  }));
}

// 공개 무드 카테고리 전체 {id,title} (sort순). 페르소나 매칭 Stage2가
// "이 목록 안에서만 무드를 고르도록" 런타임에 주입하는 카탈로그. (어드민이 무드를
// 추가/변경해도 자동 동기화 — 하드코딩 금지)
export async function listPublishedMoods(): Promise<Array<{ id: string; title: string }>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("explore_categories")
    .select("id, title")
    .eq("published", true)
    .eq("kind", "mood")
    .order("sort", { ascending: true });
  return (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string }));
}

// id 목록 → 공개 무드 카테고리 {id,title} (결과 화면 라벨용).
export async function fetchMoodTitles(moodIds: string[]): Promise<TasteCat[]> {
  const clean = [...new Set(moodIds.filter(Boolean))];
  if (clean.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("explore_categories")
    .select("id, title, slug")
    .in("id", clean);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    slug: r.slug as string,
  }));
}

// 슬러그 목록 → 공개 카테고리 id 목록. (목적 고정 목록이 참조하는 탐색 카테고리 해석)
export async function resolveCategoryIdsBySlugs(slugs: string[]): Promise<string[]> {
  const clean = [...new Set(slugs.filter(Boolean))];
  if (clean.length === 0) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("explore_categories")
    .select("id")
    .in("slug", clean);
  return (data ?? []).map((r) => r.id as string);
}

// 고른 목적 카테고리의 멤버 사진 id (published) — 앨범 dedup 전 원본.
async function purposeMemberPhotos(
  purposeIds: string[]
): Promise<Array<{ id: string; src_url: string; thumb_url: string | null; album_id: string | null }>> {
  if (purposeIds.length === 0) return [];
  const admin = createAdminClient();
  const { data: mem } = await admin
    .from("explore_category_photos")
    .select("photo_id")
    .in("category_id", purposeIds);
  const ids = [...new Set((mem ?? []).map((m) => m.photo_id as string))];
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, album_id, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .in("id", ids)
    .eq("visibility", "published");
  return (data ?? []).map((r) => {
    const rr = r as Record<string, unknown>;
    return {
      id: rr.id as string,
      src_url: rr.src_url as string,
      thumb_url: rr.thumb_url as string | null,
      album_id: rr.album_id as string | null,
    };
  });
}

// 스와이프 덱 — 고른 목적의 멤버 사진, 앨범당 1장, 셔플, limit.
export async function fetchQuizDeckForPurposes(
  purposeIds: string[],
  limit = 12
): Promise<QuizDeckPhoto[]> {
  const rows = await purposeMemberPhotos(purposeIds);
  const seen = new Set<string>();
  const eligible = rows.filter((r) => {
    const k = r.album_id ?? `p:${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return shuffleArr(eligible)
    .slice(0, limit)
    .map((r) => ({ id: r.id, url: r.thumb_url ?? r.src_url }));
}

// 좋아요한 사진들 → 무드 카테고리 랭킹(멤버십 겹침 수 desc). 최대 max개.
export async function deriveMoodCategories(
  likedPhotoIds: string[],
  max = 3
): Promise<TasteCat[]> {
  if (likedPhotoIds.length === 0) return [];
  const admin = createAdminClient();
  const { data: mem } = await admin
    .from("explore_category_photos")
    .select("category_id")
    .in("photo_id", likedPhotoIds);
  const counts = new Map<string, number>();
  for (const m of (mem ?? []) as Array<{ category_id: string }>) {
    counts.set(m.category_id, (counts.get(m.category_id) ?? 0) + 1);
  }
  if (counts.size === 0) return [];
  const { data: cats } = await admin
    .from("explore_categories")
    .select("id, title, slug, kind, published")
    .in("id", [...counts.keys()])
    .eq("kind", "mood")
    .eq("published", true);
  return (cats ?? [])
    .map((c) => ({
      id: c.id as string,
      title: c.title as string,
      slug: c.slug as string,
      n: counts.get(c.id as string) ?? 0,
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map(({ id, title, slug }) => ({ id, title, slug }));
}

// 주어진 사진들이 taste 카테고리(purpose∪mood)에 몇 개 속하는지 점수. (홈 개인화 부스트용)
export async function scoreTastePhotos(
  photoIds: string[],
  catIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (photoIds.length === 0 || catIds.length === 0) return out;
  const admin = createAdminClient();
  const { data } = await admin
    .from("explore_category_photos")
    .select("photo_id")
    .in("photo_id", photoIds)
    .in("category_id", catIds);
  for (const r of (data ?? []) as Array<{ photo_id: string }>) {
    out.set(r.photo_id, (out.get(r.photo_id) ?? 0) + 1);
  }
  return out;
}

// 취향 가중랜덤 정렬 — 시드 기반 지터(id+seed 해시)에서 점수만큼 앞으로 당김.
// 딱딱한 블록(점수순 정렬)이 아니라 '앞에 올 확률만' 높여 뭉침 없이 섞이게 한다.
// demote(예: 개인 선택 시 웨딩/커플) 점수가 있으면 큰 페널티로 뒤로 강하게 민다.
export function boostByTaste<T extends { id: string }>(
  photos: T[],
  score: Map<string, number>,
  seed: string,
  weight = 0.35,
  demote?: Map<string, number>,
  demotePenalty = 2.5
): T[] {
  const rnd = (id: string): number => {
    let h = 2166136261;
    const s = id + seed;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 100000) / 100000;
  };
  // rnd 는 [0,1). demotePenalty(2.5)가 rnd 를 압도해 demote 사진은 항상 뒤로.
  const key = (p: T) =>
    rnd(p.id) - (score.get(p.id) ?? 0) * weight + (demote?.get(p.id) ?? 0) * demotePenalty;
  return [...photos].sort((a, b) => key(a) - key(b));
}

// 결과 큐레이션 — 목적∩무드 사진(부족하면 목적만), 앨범당 1장, limit.
export async function fetchTasteCurated(
  purposeIds: string[],
  moodIds: string[],
  limit = 12
): Promise<QuizDeckPhoto[]> {
  const rows = await purposeMemberPhotos(purposeIds);
  if (rows.length === 0) return [];
  let pool = rows;
  if (moodIds.length > 0) {
    const admin = createAdminClient();
    const { data: moodMem } = await admin
      .from("explore_category_photos")
      .select("photo_id")
      .in("category_id", moodIds);
    const moodSet = new Set((moodMem ?? []).map((m) => m.photo_id as string));
    const inter = rows.filter((r) => moodSet.has(r.id));
    if (inter.length >= 4) pool = inter; // 교집합이 충분할 때만 좁힘
  }
  const seen = new Set<string>();
  const eligible = pool.filter((r) => {
    const k = r.album_id ?? `p:${r.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return shuffleArr(eligible)
    .slice(0, limit)
    .map((r) => ({ id: r.id, url: r.thumb_url ?? r.src_url }));
}
