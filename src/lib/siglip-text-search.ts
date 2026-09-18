import "server-only";

import type { GalleryPhoto } from "@/lib/discovery";
import {
  normalizeSiglipSearchLimit,
  orderVectorMatches,
  pickByGender,
  requestSearchQuery,
  requestTextEmbedding,
  SEARCH_Z_CUT_ENABLED,
  SIGLIP_SEARCH_MAX_RESULTS,
  SEARCH_RELATED_Z,
  splitByPurposes,
  splitByZ,
  type PhotoGender,
  type PhotoPurposeKey,
  type SearchQueryParse,
} from "@/lib/siglip-text-search-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTO_SEARCH_TIMEOUT_MS } from "@/lib/photo-search-state";

const DEFAULT_LIMIT = SIGLIP_SEARCH_MAX_RESULTS;

export {
  diversifySearchResults,
  mergeMetadataAndVectorResults,
  SIGLIP_SEARCH_MAX_RESULTS,
} from "@/lib/siglip-text-search-core";

type VectorSearchRow = {
  id: string;
  distance: number;
};

function embedBaseUrl(): string | null {
  const configured = process.env.PERSONA_EMBED_URL?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "development" ? "http://127.0.0.1:8077" : null;
}

/** 검색어 한 개를 SigLIP2 텍스트 벡터로 변환한다. 실패는 null로 무해화한다. */
export async function embedSearchText(query: string, signal?: AbortSignal): Promise<number[] | null> {
  return requestTextEmbedding(query, {
    baseUrl: embedBaseUrl(),
    token: process.env.PERSONA_SERVICE_TOKEN,
    timeoutMs: 4_000,
    signal,
  });
}

// 목적으로 가르려면 사진마다 목적이 필요하다 — 검색 결과 메타데이터에 함께 싣는다.
const PHOTO_COLUMNS =
  "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, album_id, admin_purposes, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name, status)";

type SearchPhoto = GalleryPhoto & { admin_purposes?: string[] | null };

/** 정상 0건은 [], 장애는 예외로 전달해 고객에게 재시도 화면을 보여준다. */
export async function searchPhotosBySiglip(
  query: string,
  limit = DEFAULT_LIMIT,
  signal = AbortSignal.timeout(PHOTO_SEARCH_TIMEOUT_MS),
): Promise<GalleryPhoto[]> {
  const vector = await embedSearchText(query, signal);
  if (!vector) throw new Error("SigLIP 검색어 임베딩을 받지 못했습니다");
  return rankPhotosByVector(vector, limit, signal);
}

/** 벡터와 가까운 공개 사진을 거리순으로. 피드에서 내린 사진·미승인 작가는 뺀다. */
async function rankPhotosByVector(
  vector: number[],
  limit: number,
  signal: AbortSignal,
): Promise<SearchPhoto[]> {
  return loadPhotosInOrder(await nearestRows(vector, limit, signal), signal);
}

/** 벡터와 가까운 사진 id·거리 — 최대 300장(similar_photos_by_vector 가 DB 안에서 자른다). */
async function nearestRows(vector: number[], limit: number, signal: AbortSignal): Promise<VectorSearchRow[]> {
  const admin = createAdminClient();
  const safeLimit = normalizeSiglipSearchLimit(limit);
  const { data: nearest, error: nearestError } = await admin.rpc(
    "similar_photos_by_vector",
    {
      p_embedding: JSON.stringify(vector),
      p_limit: safeLimit,
    }
  ).abortSignal(signal);
  if (nearestError) {
    console.error("[siglip-search] 벡터 RPC 실패:", nearestError.message);
    throw nearestError;
  }
  return (nearest ?? []) as VectorSearchRow[];
}

// .in() 은 GET 주소에 id 를 늘어놓는다. 성별 검색은 1,000장이 넘어 주소가 수십 KB 가 되므로 나눠 부른다.
const ID_CHUNK = 200;

/** RPC 가 준 거리순 id 에 사진 메타데이터를 붙인다. .in() 조회가 잃는 순서는 되살린다. */
async function loadPhotosInOrder(nearest: VectorSearchRow[], signal: AbortSignal): Promise<SearchPhoto[]> {
  const ids = nearest.map((row) => row.id);
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const pages = await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await createAdminClient()
      .from("photos")
      .select(PHOTO_COLUMNS)
      .in("id", chunk)
      .eq("visibility", "published")
      .eq("feed_hidden", false)
      .eq("photographer.status", "approved")
      .abortSignal(signal);
    if (error) {
      console.error("[siglip-search] 사진 메타데이터 조회 실패:", error.message);
      throw error;
    }
    return (data ?? []) as unknown as SearchPhoto[];
  }));

  return orderVectorMatches(pages.flat(), nearest);
}

/**
 * 사진 전체 기준 z 가 SEARCH_RELATED_Z 이상인 사진을 점수순으로(0131). 목적이 있으면 그 목적만.
 * 300장 상한이 없다 — 장수는 z 가 정한다. 0131 이 없는 DB 면 null — 호출하는 쪽이 예전 방식으로 간다.
 */
async function rankPhotosByZ(
  vector: number[],
  purposes: PhotoPurposeKey[],
  signal: AbortSignal,
): Promise<Array<SearchPhoto & { z: number }> | null> {
  const { data, error } = await createAdminClient()
    .rpc("search_photos_by_z", {
      p_embedding: JSON.stringify(vector),
      p_purposes: purposes.length ? purposes : null,
      p_min_z: SEARCH_RELATED_Z,
    })
    .abortSignal(signal);
  if (error) {
    console.error("[siglip-search] z 검색 실패(0131 미적용?):", error.message);
    return null;
  }
  const rows = (data ?? []) as Array<VectorSearchRow & { z: number }>;
  const zById = new Map(rows.map((row) => [row.id, row.z]));
  const photos = await loadPhotosInOrder(rows, signal);
  return photos.map((photo) => ({ ...photo, z: zById.get(photo.id) ?? 0 }));
}

/**
 * 목적 안의 사진 **전부**의 거리(0131, 300장 상한 없음). 성별 필터가 쓴다 — 여자·남자 두 거리를
 * 사진마다 비교하려면 일부가 아니라 전부가 필요하다. 0131 이 없는 DB 면 null.
 */
async function distancesInPurposes(
  vector: number[],
  purposes: PhotoPurposeKey[],
  signal: AbortSignal,
): Promise<VectorSearchRow[] | null> {
  const rows: VectorSearchRow[] = [];
  // Supabase API 는 한 번에 1,000줄까지만 준다. 개인 사진은 1,027장이라 한 번에 받으면 여자·남자
  // 목록이 서로 다른 27장씩 잘려 비교에서 빠졌다(여자 975·남자 11 — 실제 1,003·24).
  for (let from = 0; ; from += RPC_PAGE) {
    const { data, error } = await createAdminClient()
      .rpc("search_photos_by_z", {
        p_embedding: JSON.stringify(vector),
        p_purposes: purposes.length ? purposes : null,
        p_min_z: -1000,   // 자르지 않는다 — 거리만 쓴다
      })
      .range(from, from + RPC_PAGE - 1)
      .abortSignal(signal);
    if (error) {
      console.error("[siglip-search] 목적 안 거리 조회 실패(0131 미적용?):", error.message);
      return null;
    }
    const page = (data ?? []) as VectorSearchRow[];
    rows.push(...page);
    if (page.length < RPC_PAGE) return rows;
  }
}

const RPC_PAGE = 1000;

// "여자"·"남자" 벡터는 검색어와 상관없이 늘 같다. 서버가 살아 있는 동안 한 번만 받는다.
const GENDER_WORD: Record<PhotoGender, string> = { female: "여자", male: "남자" };
const genderVectors = new Map<PhotoGender, number[]>();

async function genderVector(gender: PhotoGender, signal: AbortSignal): Promise<number[] | null> {
  const cached = genderVectors.get(gender);
  if (cached) return cached;
  const vector = await embedSearchText(GENDER_WORD[gender], signal);
  if (vector) genderVectors.set(gender, vector);   // 실패는 담아 두지 않는다 — 다음 검색에서 다시
  return vector;
}

/**
 * 어드민이 정한 성별(0132 admin_purpose_gender)로 그 목적 사진 **전부**를 최신순으로.
 * 목적만 검색할 때("웨딩")와 같은 순서다. 성별 칸이 없는 DB 면 null.
 */
async function fetchPhotosByStoredGender(
  purposes: PhotoPurposeKey[],
  gender: PhotoGender,
  signal: AbortSignal,
): Promise<SearchPhoto[] | null> {
  const photos: SearchPhoto[] = [];
  for (let from = 0; ; from += RPC_PAGE) {
    const { data, error } = await createAdminClient()
      .from("photos")
      .select(PHOTO_COLUMNS)
      .overlaps("admin_purposes", purposes)
      .eq("admin_purpose_gender", gender)
      .eq("visibility", "published")
      .eq("feed_hidden", false)
      .eq("photographer.status", "approved")
      .order("created_at", { ascending: false })
      .range(from, from + RPC_PAGE - 1)
      .abortSignal(signal);
    if (error?.code === "42703") return null;   // 0132 전 — 성별 칸이 없다
    if (error) {
      console.error("[siglip-search] 성별 사진 조회 실패:", error.message);
      throw error;
    }
    const page = (data ?? []) as unknown as SearchPhoto[];
    photos.push(...page);
    if (page.length < RPC_PAGE) return photos;
  }
}

/**
 * "여자" "남자 노을" — 개인 사진을 성별로 가른다. 남은 말("노을")이 있으면 다른 검색과 같은
 * 방식(가까운 300장)으로 그 성별 사진만, 없으면 그 성별 사진 **전부**.
 *
 * 어드민이 정한 성별(0132)을 먼저 쓴다. 그 칸이 없는 DB 면 검색할 때 여자·남자 거리를 비교해
 * 가른다(0131). 둘 다 없거나 성별 벡터를 못 받으면 null — 호출하는 쪽이 예전 방식으로 간다.
 */
async function searchByGender(
  parsed: SearchQueryParse,
  gender: PhotoGender,
  limit: number,
  signal: AbortSignal,
): Promise<PhotoSearchResult | null> {
  const stored = await fetchPhotosByStoredGender(parsed.purposes, gender, signal);
  if (stored) {
    let matches: SearchPhoto[] = stored;
    if (parsed.vector) {
      const byId = new Map(stored.map((photo) => [photo.id, photo]));
      matches = (await nearestRows(parsed.vector, limit, signal))
        .map((row) => byId.get(row.id))
        .filter((photo): photo is SearchPhoto => photo !== undefined);
    }
    return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related: [], capped: false };
  }

  const [female, male] = await Promise.all([genderVector("female", signal), genderVector("male", signal)]);
  if (!female || !male) return null;
  const [toFemale, toMale] = await Promise.all([
    distancesInPurposes(female, parsed.purposes, signal),
    distancesInPurposes(male, parsed.purposes, signal),
  ]);
  if (!toFemale || !toMale) return null;

  const picked = pickByGender(toFemale, toMale, gender);
  let ordered: VectorSearchRow[] = picked;
  if (parsed.vector) {
    const allowed = new Set(picked.map((row) => row.id));
    ordered = (await nearestRows(parsed.vector, limit, signal)).filter((row) => allowed.has(row.id));
  }
  const matches = await loadPhotosInOrder(ordered, signal);
  return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related: [], capped: false };
}

/** 목적만 검색했을 때 — 그 목적 사진을 최신순으로. SigLIP 은 부르지 않는다. */
async function fetchPhotosByPurposes(
  purposes: PhotoPurposeKey[],
  limit: number,
  signal: AbortSignal,
): Promise<SearchPhoto[]> {
  const { data, error } = await createAdminClient()
    .from("photos")
    .select(PHOTO_COLUMNS)
    .overlaps("admin_purposes", purposes)
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    .eq("photographer.status", "approved")
    .order("created_at", { ascending: false })
    .limit(normalizeSiglipSearchLimit(limit))
    .abortSignal(signal);
  if (error) {
    console.error("[siglip-search] 목적 사진 조회 실패:", error.message);
    throw error;
  }
  return (data ?? []) as unknown as SearchPhoto[];
}

export type PhotoSearchResult = {
  purposes: PhotoPurposeKey[];
  moodText: string;
  /** 검색 결과 — z 2.5 이상 (목적만 검색했으면 그 목적 사진). 위에 놓는다. */
  matches: GalleryPhoto[];
  /** z 2.0~2.5 — 아래 "비슷한 무드의 사진들이에요". 목적이 있으면 그 목적 사진만. */
  related: GalleryPhoto[];
  /** 결과가 300장 상한에서 잘렸나 — 목적만 검색했거나 0131 이 없는 DB 일 때만 생긴다 */
  capped: boolean;
};

/**
 * 검색어를 목적과 무드로 나눠 찾는다.
 *
 *   "웨딩"          → 웨딩 사진을 최신순으로
 *   "몽환적인 노을"   → 전체에서 SigLIP 순서
 *   "가을 커플스냅"   → 커플 사진만. "가을" z 2.5 이상이 위, 2.0~2.5 가 아래 "비슷한 무드"
 *
 * z 2.0 미만은 보여주지 않는다 — 300장을 무조건 채우던 방식을 버렸다(docs/29 §12.8).
 *
 * 맥미니가 검색어 분리를 모르면(갱신 전) 예전처럼 검색어 통째로 SigLIP 에 넣는다.
 */
export async function searchPhotos(
  query: string,
  limit = DEFAULT_LIMIT,
  signal = AbortSignal.timeout(PHOTO_SEARCH_TIMEOUT_MS),
): Promise<PhotoSearchResult> {
  const parsed = await requestSearchQuery(query, {
    baseUrl: embedBaseUrl(),
    token: process.env.PERSONA_SERVICE_TOKEN,
    timeoutMs: 4_000,
    signal,
  });
  if (parsed === "unsupported") {
    const matches = await searchPhotosBySiglip(query, limit, signal);
    return { purposes: [], moodText: query, matches, related: [], capped: matches.length >= limit };
  }
  if (!parsed) throw new Error("검색어 분리·임베딩을 받지 못했습니다");

  if (parsed.gender) {
    const byGender = await searchByGender(parsed, parsed.gender, limit, signal);
    if (byGender) return byGender;
    // 0131 이 없는 DB — 예전처럼 성별 낱말을 SigLIP 글자로 쓴다(가까운 300장 중 개인 사진)
    const fallback = parsed.vector ?? (await genderVector(parsed.gender, signal));
    if (fallback) return searchByVector({ ...parsed, vector: fallback }, limit, signal);
  }

  if (!parsed.vector) {
    // 목적만 검색 — SigLIP 을 안 쓰니 z 가 없다. 그 목적 사진을 최신순으로.
    const matches = await fetchPhotosByPurposes(parsed.purposes, limit, signal);
    return { purposes: parsed.purposes, moodText: "", matches, related: [], capped: matches.length >= limit };
  }

  return searchByVector({ ...parsed, vector: parsed.vector }, limit, signal);
}

async function searchByVector(
  parsed: SearchQueryParse & { vector: number[] },
  limit: number,
  signal: AbortSignal,
): Promise<PhotoSearchResult> {
  // z 컷은 무드어 작업 뒤에 켠다(SEARCH_Z_CUT_ENABLED). 그전에는 0131 이 있어도 안 쓴다.
  const scored = SEARCH_Z_CUT_ENABLED ? await rankPhotosByZ(parsed.vector, parsed.purposes, signal) : null;
  if (scored) {
    const { matches, related } = splitByZ(scored);
    return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related, capped: false };
  }

  // z 컷을 안 쓸 때 — 예전처럼 가까운 300장. 목적이 있으면 그 목적만 위에 두고 아래는 비운다
  // (목적이 다른 사진은 보여주지 않기로 했다).
  const nearest = await rankPhotosByVector(parsed.vector, limit, signal);
  const { matches } = splitByPurposes(nearest, parsed.purposes);
  return {
    purposes: parsed.purposes,
    moodText: parsed.moodText,
    matches,
    related: [],
    capped: parsed.purposes.length === 0 && matches.length >= limit,
  };
}
