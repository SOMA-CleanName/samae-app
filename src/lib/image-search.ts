/**
 * 사진으로 검색 — 올린 사진 한 장을 SigLIP 벡터로 바꿔 분위기가 비슷한 작가 사진을 찾는다. (docs/42 §3)
 *
 * 글 검색과 같은 길을 쓴다: 벡터 → similar_photos_by_vector(공개·피드 숨김 제외·승인 작가) → 앨범 흩뜨리기.
 * 올린 사진은 저장하지 않는다 — 벡터로 바꾸고 버린다.
 */
import "server-only";

import type { GalleryPhoto } from "@/lib/discovery";
import { embedImages } from "@/lib/persona/embed";
import {
  searchPhotosByVector,
  SIGLIP_SEARCH_MAX_RESULTS,
} from "@/lib/siglip-text-search";
import { spreadAlbumsInBands } from "@/lib/siglip-text-search-core";

/** 맥미니가 사진 한 장을 벡터로 바꾸는 데 걸리는 시간은 0.2초 안팎이다. 사람이 기다리는 화면이라 짧게 끊는다. */
const EMBED_TIMEOUT_MS = 6_000;
/** 벡터를 받은 뒤 DB 조회 몫. 둘을 합쳐도 글 검색(8초)과 비슷하게 끝난다. */
const SEARCH_TIMEOUT_MS = 8_000;

export type ImageSearchResult =
  /** 맥미니가 꺼졌거나 답이 늦다 — 결과 0장과 구분해 안내 문구를 다르게 보여준다. */
  | { ok: false; reason: "embed-unavailable" }
  | { ok: true; photos: GalleryPhoto[]; capped: boolean };

/** base64 JPEG 한 장 → 비슷한 사진. */
export async function searchPhotosByImage(
  imageB64: string,
  limit = SIGLIP_SEARCH_MAX_RESULTS,
): Promise<ImageSearchResult> {
  const embedded = await embedImages([imageB64], { timeoutMs: EMBED_TIMEOUT_MS });
  const vector = embedded?.vectors[0];
  if (!vector) return { ok: false, reason: "embed-unavailable" };

  const photos = await searchPhotosByVector(vector, limit, AbortSignal.timeout(SEARCH_TIMEOUT_MS));
  return {
    ok: true,
    // 글 검색과 같게 — 한 앨범이 앞쪽을 통째로 먹지 않게 묶음 안에서 흩뜨린다
    photos: spreadAlbumsInBands(photos),
    capped: photos.length >= limit,
  };
}
