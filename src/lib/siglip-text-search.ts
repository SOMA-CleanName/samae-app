import "server-only";

import type { GalleryPhoto } from "@/lib/discovery";
import {
  normalizeSiglipSearchLimit,
  orderVectorMatches,
  requestSearchQuery,
  requestTextEmbedding,
  SIGLIP_SEARCH_MAX_RESULTS,
  splitByNearest,
  splitByPurposes,
  type PhotoPurposeKey,
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

  return loadPhotosInOrder((nearest ?? []) as VectorSearchRow[], signal);
}

/** RPC 가 준 거리순 id 에 사진 메타데이터를 붙인다. .in() 조회가 잃는 순서는 되살린다. */
async function loadPhotosInOrder(nearest: VectorSearchRow[], signal: AbortSignal): Promise<SearchPhoto[]> {
  const ids = nearest.map((row) => row.id);
  if (ids.length === 0) return [];

  const { data: photos, error: photoError } = await createAdminClient()
    .from("photos")
    .select(PHOTO_COLUMNS)
    .in("id", ids)
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    .eq("photographer.status", "approved")
    .abortSignal(signal);
  if (photoError) {
    console.error("[siglip-search] 사진 메타데이터 조회 실패:", photoError.message);
    throw photoError;
  }

  return orderVectorMatches((photos ?? []) as unknown as SearchPhoto[], nearest);
}

/**
 * 목적 사진만 벡터와 가까운 순으로 — 아래 "비슷한 무드의 사진들이에요" 를 채운다(0122).
 * 전체에서 가까운 300장에 든 목적 사진은 이미 위쪽에 있으므로, 나머지를 받으려면 목적 안에서
 * 따로 줄 세워야 한다. 0122 가 없는 DB 면 null — 호출하는 쪽이 아래를 비운다.
 */
async function rankPhotosInPurposes(
  vector: number[],
  purposes: PhotoPurposeKey[],
  limit: number,
  signal: AbortSignal,
): Promise<SearchPhoto[] | null> {
  const { data, error } = await createAdminClient()
    .rpc("similar_photos_in_purposes", {
      p_embedding: JSON.stringify(vector),
      p_purposes: purposes,
      p_limit: normalizeSiglipSearchLimit(limit),
    })
    .abortSignal(signal);
  if (error) {
    console.error("[siglip-search] 목적 안 근접검색 실패(0122 미적용?):", error.message);
    return null;
  }
  return loadPhotosInOrder((data ?? []) as VectorSearchRow[], signal);
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
  /** 목적이 맞는 사진 (목적이 없으면 전부). 위에 놓는다. */
  matches: GalleryPhoto[];
  /** 목적은 같고 무드가 조금 먼 사진 — 아래 "비슷한 무드의 사진들이에요". 목적이 없으면 비어 있다. */
  related: GalleryPhoto[];
};

/**
 * 검색어를 목적과 무드로 나눠 찾는다.
 *
 *   "웨딩"          → 웨딩 사진을 최신순으로
 *   "몽환적인 노을"   → 전체에서 SigLIP 순서
 *   "가을 커플스냅"   → 커플 사진만. 가을과 가장 가까운 것이 위, 나머지 커플은 아래에
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
    return { purposes: [], moodText: query, matches, related: [] };
  }
  if (!parsed) throw new Error("검색어 분리·임베딩을 받지 못했습니다");

  if (!parsed.vector) {
    const matches = await fetchPhotosByPurposes(parsed.purposes, limit, signal);
    return { purposes: parsed.purposes, moodText: "", matches, related: [] };
  }

  if (parsed.purposes.length === 0) {
    const matches = await rankPhotosByVector(parsed.vector, limit, signal);
    return { purposes: [], moodText: parsed.moodText, matches, related: [] };
  }

  // 검색어에 목적이 있으면 위·아래 모두 그 목적 사진만 — 아래 "비슷한 무드" 도 목적이 같아야 한다.
  const [nearest, inPurpose] = await Promise.all([
    rankPhotosByVector(parsed.vector, limit, signal),
    rankPhotosInPurposes(parsed.vector, parsed.purposes, limit, signal),
  ]);
  if (!inPurpose) {
    // 0122 가 없으면 목적 사진을 전체 300장 안에서만 찾을 수 있다. 아래에 다른 목적 사진을
    // 채우는 대신 비워 둔다 — 목적이 다른 사진은 보여주지 않기로 했다.
    const { matches } = splitByPurposes(nearest, parsed.purposes);
    return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related: [] };
  }
  const { matches, related } = splitByNearest(inPurpose, new Set(nearest.map((photo) => photo.id)));
  return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related };
}
