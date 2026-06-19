import "server-only";

import { createClient } from "@/lib/supabase/server";

// 탐색 갤러리 사진 1장
export type GalleryPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  region: string | null;
  mood_tags: string[];
  price_krw: number | null;
  photographer: { id: string; display_name: string | null };
};

// 제자리 셔플 (탐색 낱개 랜덤 노출용)
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 작가 카드/프로필 공통
export type PhotographerCard = {
  id: string;
  display_name: string | null;
  bio: string;
  regions: string[];
  mood_tags: string[];
  rating_avg: number;
  review_count: number;
  price_from_krw: number;
  cover_url?: string | null;
};

// 검색어에서 PostgREST or-필터를 깨뜨릴 문자 제거
function sanitize(q: string): string {
  return q.replace(/[,(){}*]/g, " ").trim().slice(0, 40);
}

// 공개 사진 갤러리 (무드·지역 필터). 승인 작가의 published 만.
export async function fetchPublishedPhotos(opts: {
  mood?: string;
  region?: string;
  limit?: number;
}): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  let q = supabase
    .from("photos")
    // !inner + RLS(anon은 승인 작가만 조회 가능) → 미승인 작가 사진은 자동 제외.
    // photos↔photographers FK가 2개(photographer_id, hero_photo_id)라 FK명으로 명시.
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.region) q = q.eq("region", opts.region);
  if (opts.mood) q = q.contains("mood_tags", [opts.mood]);

  const { data } = await q;
  // 최신 풀을 매 요청 랜덤 셔플 → 방문할 때마다 다른 순서. 클라이언트가 점진적으로 노출.
  return shuffle((data ?? []) as unknown as GalleryPhoto[]);
}

// 카테고리(여러 태그)에 해당하는 공개 사진 — 태그가 더 많이 겹칠수록 상위(추천 정렬).
export async function fetchPhotosByTags(tags: string[], limit = 60): Promise<GalleryPhoto[]> {
  if (!tags || tags.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
    )
    .eq("visibility", "published")
    .overlaps("mood_tags", tags)
    .order("created_at", { ascending: false })
    .limit(200);

  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  const rows = (data ?? []) as unknown as GalleryPhoto[];
  // 매칭 태그 수 내림차순(추천 강도), 동률은 최근순(이미 created_at desc로 들어옴)
  const scored = rows
    .map((p) => ({
      p,
      score: (p.mood_tags ?? []).filter((t) => tagSet.has(t.toLowerCase())).length,
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.p);
}

// 무드 태그로 공개 사진 검색 — 부분 일치(대소문자 무시), 결과는 메이슨리 사진.
// text[] 부분 일치는 PostgREST 단일 연산자로 어려워, published 전체를 페이지 단위로 받아 JS에서 필터.
export async function searchPhotosByTag(qRaw: string): Promise<GalleryPhoto[]> {
  const q = sanitize(qRaw).toLowerCase();
  if (!q) return [];
  const supabase = await createClient();
  const rows = await fetchAllSearchablePhotos(supabase);
  // 낱개 매칭 결과 (묶음 무시)
  const matched = rows.filter((p) => (p.mood_tags ?? []).some((t) => t.toLowerCase().includes(q)));
  return sortPhotosByLikeCount(supabase, matched);
}

async function sortPhotosByLikeCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  photos: GalleryPhoto[]
): Promise<GalleryPhoto[]> {
  if (photos.length === 0) return photos;

  // 검색 결과는 좋아요가 많은 사진을 먼저 보여준다. 집계 실패 시 0으로 보고 기존 순서를 유지한다.
  const counts = await Promise.all(
    photos.map(async (photo) => {
      try {
        const res = await supabase.rpc("photo_like_count", { pid: photo.id });
        return typeof res.data === "number" ? res.data : 0;
      } catch {
        return 0;
      }
    })
  );

  return photos
    .map((photo, index) => ({ photo, index, count: counts[index] ?? 0 }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map((item) => item.photo);
}

async function fetchAllSearchablePhotos(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<GalleryPhoto[]> {
  const pageSize = 1000;
  const rows: GalleryPhoto[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("photos")
      .select(
        "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) break;
    const page = (data ?? []) as unknown as GalleryPhoto[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

// id 목록으로 작가 카드 조회 (찜 목록용). 승인 작가만, 대표 사진 포함.
// 주어진 사진들 중 현재 사용자가 좋아요한 id 집합 — 갤러리 하트 초기 상태용(1쿼리).
export async function fetchLikedPhotoIds(
  photoIds: string[],
  userId?: string
): Promise<string[]> {
  if (!userId || photoIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("profile_id", userId)
    .eq("target_type", "photo")
    .in("target_id", photoIds);
  return (data ?? []).map((r) => r.target_id as string);
}

export async function fetchPhotographersByIds(ids: string[]): Promise<PhotographerCard[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw")
    .in("id", ids)
    .eq("status", "approved");

  const rows = (data ?? []) as PhotographerCard[];
  const covers = await coverPhotoMap(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, cover_url: covers[r.id] ?? null }));
}

// 작가 id 목록 → 각자의 대표(published) 사진 1장 맵
async function coverPhotoMap(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("photographer_id, thumb_url, src_url")
    .in("photographer_id", ids)
    .eq("visibility", "published")
    .order("created_at", { ascending: false });

  const map: Record<string, string> = {};
  for (const p of data ?? []) {
    if (!map[p.photographer_id]) map[p.photographer_id] = p.thumb_url ?? p.src_url;
  }
  return map;
}

// 사진 상세용 1장 — 작가 정보 포함. RLS: published 또는 본인.
export type PhotoDetail = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
  mood_tags: string[];
  region: string | null;
  location_text: string | null;
  price_krw: number | null;
  album_id: string | null;
  photographer_id: string;
  photographer: { id: string; display_name: string | null } | null;
  // 사진별 작가 코멘트 — 추후 photos.caption 컬럼 추가 후 select 연동(현재 미선택 → undefined).
  caption?: string | null;
};

export async function fetchPhotoById(id: string): Promise<PhotoDetail | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, mood_tags, region, location_text, price_krw, album_id, photographer_id, photographer:photographers!photos_photographer_id_fkey(id, display_name)"
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as PhotoDetail) ?? null;
}

// 여러 사진의 좋아요 수 + 내 좋아요 여부 (캐러셀 슬라이드별 하트용)
export async function fetchPhotoLikeInfo(
  ids: string[],
  profileId?: string | null
): Promise<Record<string, { liked: boolean; count: number }>> {
  const out: Record<string, { liked: boolean; count: number }> = {};
  if (ids.length === 0) return out;
  const supabase = await createClient();

  const counts = await Promise.all(
    ids.map((id) =>
      supabase.rpc("photo_like_count", { pid: id }).then((r) => (typeof r.data === "number" ? r.data : 0))
    )
  );

  let likedSet = new Set<string>();
  if (profileId) {
    const { data } = await supabase
      .from("favorites")
      .select("target_id")
      .eq("profile_id", profileId)
      .eq("target_type", "photo")
      .in("target_id", ids);
    likedSet = new Set((data ?? []).map((f) => f.target_id as string));
  }

  ids.forEach((id, i) => {
    out[id] = { liked: likedSet.has(id), count: counts[i] };
  });
  return out;
}

// 게시물(album) 설명글 — 사진 상세에 노출.
export async function fetchAlbumDescription(albumId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("albums")
    .select("description")
    .eq("id", albumId)
    .maybeSingle();
  return (data?.description as string | null) ?? null;
}

// 한 게시물(album)의 공개 사진들 — 스와이프 캐러셀용. 정렬 순.
export async function fetchAlbumPhotos(
  albumId: string
): Promise<{ id: string; src_url: string; thumb_url: string | null; width: number; height: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url, width, height")
    .eq("album_id", albumId)
    .eq("visibility", "published")
    // 게시물 대표 선정과 동일 정렬 → 대표가 캐러셀 첫 장(1/N)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as {
    id: string;
    src_url: string;
    thumb_url: string | null;
    width: number;
    height: number;
  }[];
}

// 작가 총 찜 수 (공개 집계 함수 경유) — 관심 작가 통계용
export async function fetchPhotographerFavoriteCount(photographerId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("photographer_favorite_count", {
    pid: photographerId,
  });
  return typeof data === "number" ? data : 0;
}

// 사진 총 좋아요 수 (공개 집계 함수 경유) — 사진 상세 하트 옆 표기
export async function fetchPhotoLikeCount(photoId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("photo_like_count", { pid: photoId });
  return typeof data === "number" ? data : 0;
}

// 내가 이 대상을 찜/좋아요 했는지 (본인 favorites 행, 비로그인 false)
export async function isFavorited(
  targetType: "photographer" | "photo",
  targetId: string
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("favorites")
    .select("id")
    .eq("profile_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();
  return !!data;
}

// 내가 좋아요한 사진들 (좋아요 최신순) — 찜 화면 '좋아요한 사진' 탭
export async function fetchMyLikedPhotos(profileId: string): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  const { data: favs } = await supabase
    .from("favorites")
    .select("target_id")
    .eq("profile_id", profileId)
    .eq("target_type", "photo")
    .order("created_at", { ascending: false });

  const ids = (favs ?? []).map((f) => f.target_id as string);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey(id, display_name)"
    )
    .in("id", ids);

  // 좋아요 순서(ids) 유지
  const rows = (data ?? []) as unknown as GalleryPhoto[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((p): p is GalleryPhoto => !!p);
}

// 사진 상세 2단계 랜덤 추천 — 같은 무드 우선, 본인 사진/같은 작가 제외, 셔플.
export async function fetchRandomRecommendations(
  photoId: string,
  moodTags: string[],
  excludePhotographerId: string,
  limit = 8
): Promise<GalleryPhoto[]> {
  const supabase = await createClient();
  let q = supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
    )
    .eq("visibility", "published")
    .neq("id", photoId)
    .neq("photographer_id", excludePhotographerId)
    .limit(40);
  // 같은 무드가 있으면 우선 필터
  if (moodTags.length > 0) q = q.overlaps("mood_tags", moodTags);

  let rows = ((await q).data ?? []) as unknown as GalleryPhoto[];
  // 같은 무드 결과가 없으면 무드 무시하고 재조회
  if (rows.length === 0 && moodTags.length > 0) {
    const { data } = await supabase
      .from("photos")
      .select(
        "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
      )
      .eq("visibility", "published")
      .neq("id", photoId)
      .neq("photographer_id", excludePhotographerId)
      .limit(40);
    rows = (data ?? []) as unknown as GalleryPhoto[];
  }

  // 셔플 후 limit (요청마다 랜덤)
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.slice(0, limit);
}

// 작가 id로 공개 프로필 (승인된 작가만)
export async function fetchPhotographerById(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw, status")
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle();
  return data;
}

// 작가 공개 사진 (사진별 가격·장소·무드·게시물)
export async function fetchPhotographerPhotos(photographerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url, width, height, price_krw, location_text, region, mood_tags, album_id")
    .eq("photographer_id", photographerId)
    .eq("visibility", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
}

// 유사 사진 — 현재 사진의 mood_tags 와 겹치는 태그 수가 많은 순(현재 사진/같은 게시물 제외).
// 사진 상세 '추천' 피드용. 전체 풀을 한 번에 반환하고 클라이언트가 점진 노출.
export type SimilarPhoto = {
  id: string;
  src_url: string;
  thumb_url: string | null;
  width: number;
  height: number;
};

export async function fetchSimilarPhotos(opts: {
  photoId: string;
  albumId: string | null;
  tags: string[];
  limit?: number;
}): Promise<SimilarPhoto[]> {
  const supabase = await createClient();
  const limit = opts.limit ?? 400;
  const { data } = await supabase
    .from("photos")
    // 승인 작가의 published 만(!inner + RLS). 현재 사진 제외.
    .select(
      "id, src_url, thumb_url, width, height, mood_tags, album_id, photographer:photographers!photos_photographer_id_fkey!inner(id)"
    )
    .eq("visibility", "published")
    .neq("id", opts.photoId)
    .order("created_at", { ascending: false })
    .limit(limit);

  type Row = SimilarPhoto & { mood_tags: string[] | null; album_id: string | null };
  const rows = (data ?? []) as unknown as Row[];
  const tagSet = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));

  // 같은 게시물(앨범) 사진 제외 (null 앨범은 유지)
  const candidates = rows.filter((p) => !(opts.albumId && p.album_id === opts.albumId));

  // 태그 겹침 점수 계산
  const score = (p: Row) =>
    tagSet.size === 0 ? 0 : (p.mood_tags ?? []).filter((t) => tagSet.has(t.toLowerCase())).length;

  // 점수별 묶기 (점수 높은 묶음이 위로)
  const byScore = new Map<number, Row[]>();
  for (const p of candidates) {
    const s = score(p);
    (byScore.get(s) ?? byScore.set(s, []).get(s)!).push(p);
  }

  // 점수 묶음 안에서 앨범별 라운드로빈 → 같은 게시물 사진이 줄지어 뜨지 않게 분산.
  // 유사도(점수)는 그대로 상위 유지하되, 동점은 여러 게시물이 번갈아 섞이도록.
  const result: SimilarPhoto[] = [];
  for (const s of [...byScore.keys()].sort((a, b) => b - a)) {
    const items = byScore.get(s)!;
    // 앨범(단일 사진은 각자)별로 묶고, 앨범 순서·앨범 내 순서를 셔플
    const albums = new Map<string, Row[]>();
    for (const p of items) {
      const key = p.album_id ?? `single:${p.id}`;
      (albums.get(key) ?? albums.set(key, []).get(key)!).push(p);
    }
    const groups = shuffle([...albums.values()].map((g) => shuffle(g)));
    // 라운드로빈: 각 앨범에서 한 장씩 번갈아 뽑기
    for (let round = 0; ; round++) {
      let any = false;
      for (const g of groups) {
        if (round < g.length) {
          const p = g[round];
          result.push({ id: p.id, src_url: p.src_url, thumb_url: p.thumb_url, width: p.width, height: p.height });
          any = true;
        }
      }
      if (!any) break;
    }
  }

  return result;
}

// 작가 활성 패키지
export async function fetchPhotographerPackages(photographerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("packages")
    .select("id, name, description, price_krw, duration_min, edited_count")
    .eq("photographer_id", photographerId)
    .eq("is_active", true)
    .order("price_krw", { ascending: true });
  return data ?? [];
}
