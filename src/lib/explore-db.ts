import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
};

const EXPLORE_COLUMNS = "id, slug, title, subtitle, published, sort, preview_photo_ids, kind";

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
