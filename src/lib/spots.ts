import "server-only";

// 공개 데이터만 읽는다 → anon. /spots/[slug] 는 SSG 라 빌드 타임에 프리렌더되는데,
// admin(service_role)을 쓰면 그 키가 없는 Vercel Preview 스코프에서 빌드가 죽는다.
// RLS 가 published·approved·is_active 를 대신 걸러 주므로 보안도 더 낫다.
import { createPublicClient } from "@/lib/supabase/public";
import type { GalleryPhoto } from "@/lib/discovery";
import type { Spot } from "@/lib/spots-data";

// 장소 페이지가 블로그와 갈리는 지점은 여기다.
// 소개글은 블로그도 쓴다. **그 장소에서 실제로 찍힌 사진 · 찍은 작가 · 실제 패키지 가격**은
// 우리만 붙일 수 있다. 그래서 이 세 개가 비면 페이지를 낼 이유가 없다.

const GALLERY_SELECT =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name, status)";

/** fetchMatched 안에서만 쓰는 부가 필드 — 순서를 정하는 데 필요하다. */
type MatchedPhoto = GalleryPhoto & {
  location_text: string | null;
  album_id: string | null;
};

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

/**
 * 한 사진의 location_text 에 장소가 몇 곳까지 적혀 있으면 촬영지로 인정할지.
 *
 * 실제 데이터에 이런 게 있다 (2026-08-31 확인):
 *   "경복궁, 창덕궁, 창경궁, 덕수궁"  — 11장
 * 이건 **그 사진을 어디서 찍었는지**가 아니라 그 작가가 다니는 궁 목록이다.
 * 그대로 매칭하면 이 11장이 경복궁(13장 중 11장)에도 덕수궁(29장 중 11장)에도
 * 걸려서 두 장소 지면에 똑같은 사진이 뜬다 — 실제로 그렇게 보였다.
 *
 * "여기서 실제로 찍힌 사진"이 이 지면이 블로그를 이기는 유일한 근거라,
 * 애매한 건 세지 않는다. 두 곳까지는 하루에 둘 다 갈 수 있으니 인정한다.
 */
const MAX_LISTED_PLACES = 2;

/** 촬영지로 볼 수 있는 표기인가 — 나열이 길면 커버 지역 목록으로 본다. */
function isSpecificLocation(text: string | null | undefined): boolean {
  if (!text) return false;
  const parts = text
    .split(/[,·/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length <= MAX_LISTED_PLACES;
}

/** 키워드를 PostgREST or 필터로. 콤마·괄호가 들어가면 필터가 깨지므로 먼저 막는다. */
function orFilter(spot: Spot): string | null {
  const safe = spot.keywords.filter((k) => !/[,()]/.test(k));
  if (safe.length === 0) return null;
  return safe.map((k) => `location_text.ilike.%${k}%`).join(",");
}

/** 이 장소만 가리키는 표기인가 — "성수 골목, 을지로 골목"은 두 장소 중 어디인지 모른다. */
function namesOnePlace(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.split(/[,·/]/).map((t) => t.trim()).filter(Boolean).length === 1;
}

/**
 * 앨범을 돌아가며 한 장씩 뽑는다.
 *
 * 최신순 그대로 두면 **한 번의 촬영에서 나온 연속 컷이 앞에 통째로 몰린다.**
 * 실제로 13곳 중 12곳이 대표 3장을 같은 앨범에서 뽑고 있었다 — 세 장을 걸어 두고
 * 사실상 한 장을 보여준 셈이다. 장소마다 결이 다르다는 걸 보이려던 자리인데 정반대였다.
 *
 * 앨범 순서는 그 앨범의 가장 최신 컷 기준이라 결과가 매번 같다
 * (ISR 재생성 때 지면이 흔들리면 안 된다).
 */
function spreadByAlbum<T extends { id: string; album_id: string | null }>(photos: T[]): T[] {
  const albums = new Map<string, T[]>();
  for (const p of photos) {
    const key = p.album_id ?? `photo:${p.id}`;
    const cur = albums.get(key);
    if (cur) cur.push(p);
    else albums.set(key, [p]);
  }
  const queues = [...albums.values()];
  const out: T[] = [];
  for (let round = 0; out.length < photos.length; round += 1) {
    for (const q of queues) if (q[round]) out.push(q[round]);
  }
  return out;
}

/**
 * 키워드가 걸린 공개 사진을 전부 읽어 나열형을 걸러내고, 앞자리를 정리한다.
 *
 * 콤마 개수는 SQL 로 못 세서 받아 온 뒤 자바스크립트로 거른다.
 * 장소가 스무 곳 남짓이고 장소당 수십 장이라 그래도 된다.
 */
async function fetchMatched(spot: Spot): Promise<MatchedPhoto[]> {
  const or = orFilter(spot);
  if (!or) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("photos")
    .select(`${GALLERY_SELECT}, location_text, album_id`)
    .or(or)
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    // RLS 가 이미 '승인 작가만' 을 걸러 주지만, 조인 조건으로 한 겹 더 건다.
    .eq("photographer.status", "approved")
    // 정렬을 안 주면 매번 순서가 달라져 ISR 재생성 때마다 지면이 흔들린다.
    .order("created_at", { ascending: false });

  if (error) return [];
  const matched = ((data ?? []) as unknown as MatchedPhoto[]).filter((p) =>
    isSpecificLocation(p.location_text)
  );

  /*
    앞자리(= 목록의 대표 사진)에 뭘 세울지가 여기서 정해진다.

    ① 이 장소만 가리키는 사진을 먼저 — "성수 골목, 을지로 골목"으로 적힌 한 앨범이
       을지로와 성수 양쪽 대표 3장을 똑같이 차지하고 있었다. 장수에는 그대로 세되
       얼굴로는 안 내세운다.
    ② 그 안에서 앨범을 돌아가며 — 같은 촬영의 연속 컷이 앞에 몰리지 않게.
  */
  const solo = matched.filter((p) => namesOnePlace(p.location_text));
  const shared = matched.filter((p) => !namesOnePlace(p.location_text));
  return [...spreadByAlbum(solo), ...spreadByAlbum(shared)];
}

/** location_text 에 키워드가 들어간 공개 사진. 최신순으로 MAX_PHOTOS 장. */
export async function fetchSpotPhotos(spot: Spot): Promise<GalleryPhoto[]> {
  return (await fetchMatched(spot)).slice(0, MAX_PHOTOS);
}

/**
 * 장소 상세에 필요한 것을 한 번에 모은다.
 *
 * 사진이 0장이면 작가도 가격도 나올 수 없으므로 즉시 빈 결과를 준다.
 * (호출부는 이걸 보고 페이지를 낼지 말지 정한다)
 */
export async function fetchSpotDetail(spot: Spot): Promise<SpotDetail> {
  // 한 번만 읽고 표시분과 전체 수를 함께 뽑는다(같은 쿼리를 두 번 내지 않게).
  const matched = await fetchMatched(spot);
  const photos = matched.slice(0, MAX_PHOTOS);
  const totalCount = matched.length;
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
  const supabase = createPublicClient();
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

/**
 * 이 장소에서 찍힌 공개 사진 전체 수. 목록 페이지와 사이트맵이 쓴다.
 *
 * head+count 로 세지 않는다 — 나열형 제외가 자바스크립트에서 일어나므로,
 * DB 가 센 숫자를 쓰면 화면에 거른 뒤 장수와 표기가 어긋난다.
 */
export async function countSpotPhotos(spot: Spot): Promise<number> {
  return (await fetchMatched(spot)).length;
}

export function formatKrw(n: number): string {
  return `${Math.round(n / 10000)}만원`;
}

export type SpotCard = {
  slug: string;
  name: string;
  /** 광역 지자체 — 목록을 지역별로 묶는 데 쓴다 */
  city: string;
  area: string;
  /** 이 장소에서 찍힌 공개 사진 수 */
  count: number;
  /** 대표 사진. 없으면 null — 그런 장소는 목록에 싣지 않는다. */
  coverUrl: string | null;
  /** 목록 지면용 대표 3장(있는 만큼). 첫 장은 coverUrl 과 같다. */
  covers: string[];
};

/**
 * 탐색·목록에서 쓸 장소 카드.
 *
 * 사진이 0장인 곳은 뺀다. 소개글만 남는 장소는 들어가 봐야 볼 게 없고,
 * 탐색은 사진을 보러 오는 지면이라 더더욱 실을 이유가 없다.
 */
export async function listSpotCards(limit = 6): Promise<SpotCard[]> {
  const { PUBLISHED_SPOTS } = await import("@/lib/spots-data");

  const matchedBySpot = await Promise.all(
    PUBLISHED_SPOTS.map(async (s) => ({ spot: s, matched: await fetchMatched(s) }))
  );

  /*
    장소끼리 같은 사진을 대표로 쓰지 않게 한 번 더 막는다.

    fetchMatched 가 이미 '이 장소만 가리키는 사진'을 앞으로 보내지만, 두 장소가
    같은 사진을 지목하는 표기가 또 생길 수 있다. 목록에서 두 줄이 똑같은 사진을
    걸고 있으면 그건 그냥 고장 난 화면으로 보인다.

    사진이 많은 장소부터 고른다 — 여유 있는 쪽이 양보하는 게 손해가 적다.
    쓸 게 없으면 중복이라도 쓴다(빈 칸보다는 낫다).
  */
  const taken = new Set<string>();
  const cards = matchedBySpot
    .slice()
    .sort((a, b) => b.matched.length - a.matched.length)
    .map(({ spot: s, matched }) => {
      const urls = matched
        .map((p) => p.thumb_url ?? p.src_url)
        .filter((u): u is string => !!u);
      const fresh = urls.filter((u) => !taken.has(u));
      // 다른 장소가 이미 쓴 사진이라도 쓸 게 없으면 쓴다(빈 칸보다는 낫다).
      // 다만 **한 장소 안에서 같은 사진이 두 번 나오지는 않게** 한다 — 사진이 두 장뿐인
      // 곳(경복궁)에서 세 칸을 채우려다 첫 장을 다시 걸고 있었다. 그건 그냥 고장으로 보인다.
      const covers = [...new Set([...fresh, ...urls])].slice(0, 3);
      covers.forEach((u) => taken.add(u));
      return {
        slug: s.slug,
        name: s.name,
        city: s.city,
        area: s.area,
        count: matched.length,
        coverUrl: covers[0] ?? null,
        covers,
      };
    });

  return cards
    .filter((c) => c.count > 0 && c.coverUrl)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
