import "server-only";

import type { GalleryPhoto } from "@/lib/discovery";
import {
  normalizeSiglipSearchLimit,
  orderVectorMatches,
  requestSearchQuery,
  requestTextEmbedding,
  SIGLIP_SEARCH_MAX_RESULTS,
  SEARCH_RELATED_Z,
  splitByPurposes,
  splitByZ,
  type PhotoPurposeKey,
} from "@/lib/siglip-text-search-core";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_LIMIT = SIGLIP_SEARCH_MAX_RESULTS;

// 임시로 늘린 제한 (2026-09-18). 운영에서 모든 검색이 비어, 맥미니(Funnel) 응답이 4초를
// 넘기는지 가리려고 요청 한 번 4초 → 10초, 검색 전체 8초 → 20초로 둔다. 옛 맥미니는
// /search-query(404) 뒤에 /embed-text 를 한 번 더 불러 두 번 왕복하므로 전체를 두 배로 잡았다.
// 원인이 가려지면 되돌린다.
const EMBED_REQUEST_TIMEOUT_MS = 10_000;
const SEARCH_TOTAL_TIMEOUT_MS = 20_000;

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
    timeoutMs: EMBED_REQUEST_TIMEOUT_MS,
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
  signal = AbortSignal.timeout(SEARCH_TOTAL_TIMEOUT_MS),
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
  signal = AbortSignal.timeout(SEARCH_TOTAL_TIMEOUT_MS),
): Promise<PhotoSearchResult> {
  const parsed = await requestSearchQuery(query, {
    baseUrl: embedBaseUrl(),
    token: process.env.PERSONA_SERVICE_TOKEN,
    timeoutMs: EMBED_REQUEST_TIMEOUT_MS,
    signal,
  });
  if (parsed === "unsupported") {
    const matches = await searchPhotosBySiglip(query, limit, signal);
    return { purposes: [], moodText: query, matches, related: [], capped: matches.length >= limit };
  }
  if (!parsed) throw new Error("검색어 분리·임베딩을 받지 못했습니다");

  if (!parsed.vector) {
    // 목적만 검색 — SigLIP 을 안 쓰니 z 가 없다. 그 목적 사진을 최신순으로.
    const matches = await fetchPhotosByPurposes(parsed.purposes, limit, signal);
    return { purposes: parsed.purposes, moodText: "", matches, related: [], capped: matches.length >= limit };
  }

  const scored = await rankPhotosByZ(parsed.vector, parsed.purposes, signal);
  if (scored) {
    const { matches, related } = splitByZ(scored);
    return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related, capped: false };
  }

  // 0131 이 없는 DB — 예전처럼 가까운 300장. 목적이 있으면 그 목적만 위에 두고 아래는 비운다
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
