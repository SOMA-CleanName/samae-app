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
    .limit(160);

  if (opts.region) q = q.eq("region", opts.region);
  if (opts.mood) q = q.contains("mood_tags", [opts.mood]);

  const { data } = await q;
  // 낱개 사진을 랜덤으로 노출 (탐색은 묶음 무시)
  const rows = shuffle((data ?? []) as unknown as GalleryPhoto[]);
  return rows.slice(0, opts.limit ?? 48);
}

// 무드 태그로 공개 사진 검색 — 부분 일치(대소문자 무시), 결과는 메이슨리 사진.
// text[] 부분 일치는 PostgREST 단일 연산자로 어려워, 최근 published 사진을 받아 JS에서 필터(베타 한정 범위).
export async function searchPhotosByTag(qRaw: string): Promise<GalleryPhoto[]> {
  const q = sanitize(qRaw).toLowerCase();
  if (!q) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as GalleryPhoto[];
  // 낱개 매칭 결과 (묶음 무시)
  return rows.filter((p) => (p.mood_tags ?? []).some((t) => t.toLowerCase().includes(q)));
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
): Promise<{ id: string; src_url: string; thumb_url: string | null }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url")
    .eq("album_id", albumId)
    .eq("visibility", "published")
    // 프로필 대표 선정과 동일 정렬 → 대표가 캐러셀 첫 장(1/N)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return (data ?? []) as { id: string; src_url: string; thumb_url: string | null }[];
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
    .select("id, src_url, thumb_url, price_krw, location_text, region, mood_tags, album_id")
    .eq("photographer_id", photographerId)
    .eq("visibility", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  return data ?? [];
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
