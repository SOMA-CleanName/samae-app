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
  photographer: { handle: string; display_name: string | null };
};

// 작가 카드/프로필 공통
export type PhotographerCard = {
  handle: string;
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
      "id, src_url, thumb_url, width, height, region, mood_tags, photographer:photographers!photos_photographer_id_fkey!inner(handle, display_name)"
    )
    .eq("visibility", "published")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 48);

  if (opts.region) q = q.eq("region", opts.region);
  if (opts.mood) q = q.contains("mood_tags", [opts.mood]);

  const { data } = await q;
  return (data ?? []) as unknown as GalleryPhoto[];
}

// 필터 칩 옵션 — 승인 작가의 지역·무드 집합
export async function fetchFilterOptions(): Promise<{
  regions: string[];
  moods: string[];
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("regions, mood_tags")
    .eq("status", "approved");

  const regions = new Set<string>();
  const moods = new Set<string>();
  for (const row of data ?? []) {
    (row.regions ?? []).forEach((r: string) => regions.add(r));
    (row.mood_tags ?? []).forEach((m: string) => moods.add(m));
  }
  return { regions: [...regions], moods: [...moods] };
}

// 작가 검색 (이름·핸들·지역) + 대표 사진
export async function searchPhotographers(qRaw: string): Promise<PhotographerCard[]> {
  const q = sanitize(qRaw);
  if (!q) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, handle, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw")
    .eq("status", "approved")
    .or(`display_name.ilike.%${q}%,handle.ilike.%${q}%,regions.cs.{${q}}`)
    .limit(30);

  const rows = (data ?? []) as Array<PhotographerCard & { id: string }>;
  const covers = await coverPhotoMap(rows.map((r) => r.id));
  return rows.map(({ id, ...rest }) => ({ ...rest, cover_url: covers[id] ?? null }));
}

// id 목록으로 작가 카드 조회 (찜 목록용). 승인 작가만, 대표 사진 포함.
export async function fetchPhotographersByIds(ids: string[]): Promise<PhotographerCard[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, handle, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw")
    .in("id", ids)
    .eq("status", "approved");

  const rows = (data ?? []) as Array<PhotographerCard & { id: string }>;
  const covers = await coverPhotoMap(rows.map((r) => r.id));
  return rows.map(({ id, ...rest }) => ({ ...rest, cover_url: covers[id] ?? null }));
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

// 핸들로 작가 공개 프로필 (승인된 작가만)
export async function fetchPhotographerByHandle(handle: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photographers")
    .select("id, handle, display_name, bio, regions, mood_tags, rating_avg, review_count, price_from_krw, status")
    .eq("handle", handle)
    .eq("status", "approved")
    .maybeSingle();
  return data;
}

// 작가 공개 사진
export async function fetchPhotographerPhotos(photographerId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("photos")
    .select("id, src_url, thumb_url")
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
