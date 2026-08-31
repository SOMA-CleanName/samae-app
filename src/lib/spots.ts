import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { GalleryPhoto } from "@/lib/discovery";
import type { Spot } from "@/lib/spots-data";

// 장소 페이지가 블로그와 갈리는 지점은 여기다.
// 소개글은 블로그도 쓴다. **그 장소에서 실제로 찍힌 사진 · 찍은 작가 · 실제 패키지 가격**은
// 우리만 붙일 수 있다. 그래서 이 세 개가 비면 페이지를 낼 이유가 없다.

const GALLERY_SELECT =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name)";

export type SpotPhotographer = {
  id: string;
  displayName: string;
  photoCount: number;
  /** 활성 패키지 최저가. 가격을 안 걸어둔 작가는 null. */
  minPriceKrw: number | null;
};

export type SpotDetail = {
  /** 지면에 실제로 거는 사진. MAX_PHOTOS 로 잘린다. */
  photos: GalleryPhoto[];
  /**
   * 이 장소에서 찍힌 공개 사진 전체 수.
   *
   * photos.length 와 다르다. 화면에 24장만 걸어도 "몇 장 있냐"는 질문의 답은
   * 전체 수여야 한다 — FAQ·JSON-LD 에 24 를 쓰면 사실이 틀어진다.
   */
  totalCount: number;
  photographers: SpotPhotographer[];
  /** 작가들의 활성 패키지 최저가 범위. 값이 하나도 없으면 null. */
  priceRange: { min: number; max: number } | null;
};

const MAX_PHOTOS = 24;

/** 키워드를 PostgREST or 필터로. 콤마·괄호가 들어가면 필터가 깨지므로 먼저 막는다. */
function orFilter(spot: Spot): string | null {
  const safe = spot.keywords.filter((k) => !/[,()]/.test(k));
  if (safe.length === 0) return null;
  return safe.map((k) => `location_text.ilike.%${k}%`).join(",");
}

/** location_text 에 키워드가 들어간 공개 사진. 최신순으로 MAX_PHOTOS 장. */
export async function fetchSpotPhotos(spot: Spot): Promise<GalleryPhoto[]> {
  const or = orFilter(spot);
  if (!or) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("photos")
    .select(GALLERY_SELECT)
    .or(or)
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    // 정렬을 안 주면 매번 순서가 달라져 ISR 재생성 때마다 지면이 흔들린다.
    .order("created_at", { ascending: false })
    .limit(MAX_PHOTOS);

  if (error) return [];
  return (data ?? []) as unknown as GalleryPhoto[];
}

/**
 * 장소 상세에 필요한 것을 한 번에 모은다.
 *
 * 사진이 0장이면 작가도 가격도 나올 수 없으므로 즉시 빈 결과를 준다.
 * (호출부는 이걸 보고 페이지를 낼지 말지 정한다)
 */
export async function fetchSpotDetail(spot: Spot): Promise<SpotDetail> {
  const [photos, totalCount] = await Promise.all([
    fetchSpotPhotos(spot),
    countSpotPhotos(spot),
  ]);
  if (photos.length === 0) {
    return { photos, totalCount, photographers: [], priceRange: null };
  }

  const counts = new Map<string, { displayName: string; n: number }>();
  for (const p of photos) {
    const id = p.photographer?.id;
    if (!id) continue;
    const cur = counts.get(id);
    if (cur) cur.n += 1;
    else counts.set(id, { displayName: p.photographer.display_name ?? "이름 비공개", n: 1 });
  }

  const ids = [...counts.keys()];
  const supabase = createAdminClient();
  // ids 는 사진 24장에서 나온 작가라 많아야 24개다. .in() URL 한계에 안 걸린다.
  // (수백 개를 한 번에 넣으면 에러 없이 data 가 null 로 온다 — explore-db 참고)
  const { data: pkgRows } = await supabase
    .from("packages")
    .select("photographer_id, price_krw")
    .in("photographer_id", ids)
    .eq("is_active", true);

  const minByPhotographer = new Map<string, number>();
  for (const row of (pkgRows ?? []) as Array<{ photographer_id: string; price_krw: number }>) {
    if (typeof row.price_krw !== "number" || row.price_krw <= 0) continue;
    const cur = minByPhotographer.get(row.photographer_id);
    if (cur === undefined || row.price_krw < cur) {
      minByPhotographer.set(row.photographer_id, row.price_krw);
    }
  }

  const photographers: SpotPhotographer[] = ids
    .map((id) => ({
      id,
      displayName: counts.get(id)!.displayName,
      photoCount: counts.get(id)!.n,
      minPriceKrw: minByPhotographer.get(id) ?? null,
    }))
    .sort((a, b) => b.photoCount - a.photoCount);

  const prices = [...minByPhotographer.values()];
  const priceRange = prices.length
    ? { min: Math.min(...prices), max: Math.max(...prices) }
    : null;

  return { photos, totalCount, photographers, priceRange };
}

/** 이 장소에서 찍힌 공개 사진 전체 수. 목록 페이지와 사이트맵이 쓴다. */
export async function countSpotPhotos(spot: Spot): Promise<number> {
  const or = orFilter(spot);
  if (!or) return 0;

  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .or(or)
    .eq("visibility", "published")
    .eq("feed_hidden", false);

  if (error) return 0;
  return count ?? 0;
}

export function formatKrw(n: number): string {
  return `${Math.round(n / 10000)}만원`;
}
