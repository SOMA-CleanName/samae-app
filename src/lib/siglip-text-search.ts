import "server-only";

import type { GalleryPhoto } from "@/lib/discovery";
import {
  normalizeSiglipSearchLimit,
  orderVectorMatches,
  requestTextEmbedding,
  SIGLIP_SEARCH_MAX_RESULTS,
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

/** 정상 0건은 [], 장애는 예외로 전달해 고객에게 재시도 화면을 보여준다. */
export async function searchPhotosBySiglip(
  query: string,
  limit = DEFAULT_LIMIT,
  signal = AbortSignal.timeout(PHOTO_SEARCH_TIMEOUT_MS),
): Promise<GalleryPhoto[]> {
  const vector = await embedSearchText(query, signal);
  if (!vector) throw new Error("SigLIP 검색어 임베딩을 받지 못했습니다");

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

  const ids = ((nearest ?? []) as VectorSearchRow[]).map((row) => row.id);
  if (ids.length === 0) return [];

  const { data: photos, error: photoError } = await admin
    .from("photos")
    .select(
      "id, src_url, thumb_url, width, height, region, mood_tags, price_krw, album_id, photographer:photographers!photos_photographer_id_fkey!inner(id, display_name, status)"
    )
    .in("id", ids)
    .eq("visibility", "published")
    .eq("feed_hidden", false)
    .eq("photographer.status", "approved")
    .abortSignal(signal);
  if (photoError) {
    console.error("[siglip-search] 사진 메타데이터 조회 실패:", photoError.message);
    throw photoError;
  }

  return orderVectorMatches(
    (photos ?? []) as unknown as GalleryPhoto[],
    (nearest ?? []) as VectorSearchRow[]
  );
}
