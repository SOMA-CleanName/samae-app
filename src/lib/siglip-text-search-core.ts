import {
  diversifySimilarityCandidates,
} from "./feed-demotion.ts";

export const SIGLIP_TEXT_MODEL = "google/siglip2-so400m-patch16-naflex";
export const SIGLIP_EMBED_DIM = 1152;
export const SIGLIP_SEARCH_MAX_RESULTS = 300;
const SEARCH_RELEVANCE_BAND_SIZE = 48;
const SEARCH_METADATA_PER_BAND = 36;

/** DB RPC와 화면이 같은 검색 결과 상한을 사용하게 정규화한다. */
export function normalizeSiglipSearchLimit(limit: number): number {
  return Math.min(
    Math.max(Math.floor(limit), 1),
    SIGLIP_SEARCH_MAX_RESULTS
  );
}

/** 직접 일치한 메타데이터 결과를 먼저 두고 나머지는 벡터 거리순으로 잇는다. */
export function mergeMetadataAndVectorResults<T extends { id: string }>(
  metadataResults: T[],
  vectorResults: T[],
  limit = SIGLIP_SEARCH_MAX_RESULTS
): T[] {
  const merged: T[] = [];
  const seen = new Set<string>();
  for (const photo of [...metadataResults, ...vectorResults]) {
    if (seen.has(photo.id)) continue;
    seen.add(photo.id);
    merged.push(photo);
    if (merged.length >= normalizeSiglipSearchLimit(limit)) break;
  }
  return merged;
}

const ORIENTATION_TERMS = new Set([
  "가로",
  "가로사진",
  "가로형",
  "랜드스케이프",
  "세로",
  "세로사진",
  "세로형",
  "와이드",
  "파노라마",
  "horizontal",
  "landscape",
  "panorama",
  "portrait",
  "vertical",
  "wide",
]);
const KOREAN_ORIENTATION_TERM =
  /^(?:가로|세로)(?:사진|형)?(?:으로|로|만|을|를|이|은|는)?$/;

export function hasOrientationIntent(rawQuery: string): boolean {
  const terms = rawQuery
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  return terms.some(
    (term) => ORIENTATION_TERMS.has(term) || KOREAN_ORIENTATION_TERM.test(term)
  );
}

export type SearchDiversityCandidate = {
  id: string;
  width: number;
  height: number;
  album_id?: string | null;
  distance?: number;
};

type RankedSearchCandidate<T> = SearchDiversityCandidate & {
  photo: T;
  albumId: string | null;
};

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function mixSearchRelevanceBands<T extends SearchDiversityCandidate>(
  metadataResults: T[],
  vectorResults: T[],
  limit: number
): T[] {
  const safeLimit = normalizeSiglipSearchLimit(limit);
  const vectorDistanceById = new Map(
    vectorResults.map((photo) => [photo.id, photo.distance])
  );
  const direct = uniqueById(metadataResults)
    .map((photo, metadataRank) => ({
      photo,
      metadataRank,
      distance: vectorDistanceById.get(photo.id),
    }))
    .sort((left, right) => {
      if (left.distance === undefined && right.distance === undefined) {
        return left.metadataRank - right.metadataRank;
      }
      if (left.distance === undefined) return 1;
      if (right.distance === undefined) return -1;
      return left.distance - right.distance || left.metadataRank - right.metadataRank;
    })
    .map((item) => item.photo);
  const directIds = new Set(direct.map((photo) => photo.id));
  const visualOnly = uniqueById(vectorResults).filter(
    (photo) => !directIds.has(photo.id)
  );

  const mixed: T[] = [];
  let directIndex = 0;
  let visualIndex = 0;
  const visualTarget = SEARCH_RELEVANCE_BAND_SIZE - SEARCH_METADATA_PER_BAND;

  while (
    mixed.length < safeLimit &&
    (directIndex < direct.length || visualIndex < visualOnly.length)
  ) {
    const band: T[] = [];
    const directCount = Math.min(
      SEARCH_METADATA_PER_BAND,
      direct.length - directIndex
    );
    const visualCount = Math.min(
      visualTarget,
      visualOnly.length - visualIndex
    );
    band.push(...direct.slice(directIndex, directIndex + directCount));
    directIndex += directCount;
    band.push(...visualOnly.slice(visualIndex, visualIndex + visualCount));
    visualIndex += visualCount;

    const remainingSlots = SEARCH_RELEVANCE_BAND_SIZE - band.length;
    if (remainingSlots > 0 && directIndex < direct.length) {
      const extra = direct.slice(directIndex, directIndex + remainingSlots);
      band.push(...extra);
      directIndex += extra.length;
    }
    const finalSlots = SEARCH_RELEVANCE_BAND_SIZE - band.length;
    if (finalSlots > 0 && visualIndex < visualOnly.length) {
      const extra = visualOnly.slice(visualIndex, visualIndex + finalSlots);
      band.push(...extra);
      visualIndex += extra.length;
    }
    mixed.push(...band.slice(0, safeLimit - mixed.length));
  }

  return mixed;
}

/** 직접 일치 우선순위를 유지하면서 검색 결과의 앨범·방향 뭉침을 푼다. */
export function diversifySearchResults<T extends SearchDiversityCandidate>(
  _query: string,
  metadataResults: T[],
  vectorResults: T[],
  limit = SIGLIP_SEARCH_MAX_RESULTS
): T[] {
  const metadataIds = new Set(metadataResults.map((photo) => photo.id));
  const vectorDistanceById = new Map(
    vectorResults.map((photo) => [photo.id, photo.distance])
  );
  const vectorDistances = vectorResults
    .map((photo) => photo.distance)
    .filter((distance): distance is number => Number.isFinite(distance));
  const bestDistance = vectorDistances.length > 0
    ? Math.min(...vectorDistances)
    : 0;
  const merged = mixSearchRelevanceBands(
    metadataResults,
    vectorResults,
    limit
  );
  if (merged.length < 2) return merged;

  const ranked: RankedSearchCandidate<T>[] = merged.map((photo) => ({
    ...photo,
    // 직접 일치 사진도 실제 벡터 거리가 있으면 그 관련도를 그대로 사용한다.
    distance:
      vectorDistanceById.get(photo.id) ??
      (metadataIds.has(photo.id) ? bestDistance : photo.distance),
    photo,
    albumId: photo.album_id ?? null,
  }));
  const diversified = diversifySimilarityCandidates(ranked, {
    preserveOrientationOrder: true,
    albumWindow: 12,
    relevanceBandSize: SEARCH_RELEVANCE_BAND_SIZE,
  });
  return diversified
    .map((candidate) => candidate.photo)
    .slice(0, normalizeSiglipSearchLimit(limit));
}

type TextEmbeddingRequestOptions = {
  baseUrl: string | null | undefined;
  token?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  signal?: AbortSignal;
};

type TextEmbeddingResponse = {
  model?: unknown;
  vectors?: unknown;
};

/** 맥미니 응답이 현재 사진 임베딩과 같은 모델·차원의 벡터인지 확인한다. */
export function parseTextEmbeddingResponse(value: unknown): number[] | null {
  if (!value || typeof value !== "object") return null;
  const response = value as TextEmbeddingResponse;
  if (response.model !== SIGLIP_TEXT_MODEL) return null;
  if (!Array.isArray(response.vectors) || response.vectors.length !== 1) return null;

  const vector = response.vectors[0];
  if (!Array.isArray(vector) || vector.length !== SIGLIP_EMBED_DIM) return null;
  if (!vector.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
  return vector as number[];
}

/** 인증된 맥미니 엔드포인트에서 검색어 벡터 한 개를 받는다. */
export async function requestTextEmbedding(
  rawQuery: string,
  options: TextEmbeddingRequestOptions
): Promise<number[] | null> {
  const baseUrl = options.baseUrl?.trim().replace(/\/$/, "");
  const query = rawQuery.trim();
  if (!baseUrl || !query || query.length > 120) return null;

  try {
    const response = await (options.fetcher ?? fetch)(`${baseUrl}/embed-text`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { "x-samae-token": options.token } : {}),
      },
      body: JSON.stringify({ texts: [query] }),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 4_000)])
        : AbortSignal.timeout(options.timeoutMs ?? 4_000),
    });
    if (!response.ok) return null;
    return parseTextEmbeddingResponse(await response.json());
  } catch {
    return null;
  }
}

/** Supabase의 .in() 메타데이터 조회가 잃어버린 벡터 RPC 거리순을 복원한다. */
export function orderByVectorIds<T extends { id: string }>(
  rows: T[],
  orderedIds: string[]
): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/** RPC 근접검색 순서를 복원하면서 각 사진에 실제 코사인 거리를 붙인다. */
export function orderVectorMatches<T extends { id: string }>(
  rows: T[],
  matches: Array<{ id: string; distance: number }>
): Array<T & { distance: number }> {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return matches.flatMap((match) => {
    const row = byId.get(match.id);
    return row ? [{ ...row, distance: match.distance }] : [];
  });
}

// ── 검색어 분리 (맥미니 /search-query) ─────────────────────────────────────
//
// "가을 커플스냅" 을 통째로 SigLIP 에 넣으면 눈에 뚜렷한 대상(커플)이 분위기(가을)를 삼킨다.
// 맥미니가 Kiwi 로 형태소를 쪼개 목적을 떼어내고, 나머지만 벡터로 만든다
// (scripts/embed/query_parse.py). 목적은 여기서 필터로 쓴다.

export const PHOTO_PURPOSE_KEYS = [
  "personal", "couple", "friendship", "wedding", "pet", "commercial", "event",
] as const;
export type PhotoPurposeKey = (typeof PHOTO_PURPOSE_KEYS)[number];

export type SearchQueryParse = {
  purposes: PhotoPurposeKey[];
  /** 목적을 뗀 나머지 글자. 비어 있으면 목적만 검색한 것이다. */
  moodText: string;
  vector: number[] | null;
};

const isPurposeKey = (value: unknown): value is PhotoPurposeKey =>
  typeof value === "string" && (PHOTO_PURPOSE_KEYS as readonly string[]).includes(value);

/** 맥미니 응답을 검증한다. 무드 글자가 있는데 벡터가 없으면 쓸 수 없는 응답이다. */
export function parseSearchQueryResponse(value: unknown): SearchQueryParse | null {
  if (!value || typeof value !== "object") return null;
  const response = value as { purposes?: unknown; mood_text?: unknown; vector?: unknown; model?: unknown };
  if (!Array.isArray(response.purposes) || !response.purposes.every(isPurposeKey)) return null;
  if (typeof response.mood_text !== "string") return null;
  const moodText = response.mood_text.trim();
  const vector = response.vector == null
    ? null
    : parseTextEmbeddingResponse({ model: response.model, vectors: [response.vector] });
  if (moodText && !vector) return null;
  if (!moodText && response.purposes.length === 0) return null;
  return { purposes: [...response.purposes], moodText, vector: moodText ? vector : null };
}

/**
 * 검색어를 맥미니에 보내 목적/나머지/벡터를 받는다.
 * 갱신 전 맥미니(kiwipiepy 없음)는 404·501 을 준다 — 그때는 "unsupported" 를 돌려
 * 호출하는 쪽이 예전처럼 검색어 통째로 임베딩하게 한다.
 */
export async function requestSearchQuery(
  rawQuery: string,
  options: TextEmbeddingRequestOptions
): Promise<SearchQueryParse | "unsupported" | null> {
  const baseUrl = options.baseUrl?.trim().replace(/\/$/, "");
  const query = rawQuery.trim();
  if (!baseUrl || !query || query.length > 120) return null;

  try {
    const response = await (options.fetcher ?? fetch)(`${baseUrl}/search-query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.token ? { "x-samae-token": options.token } : {}),
      },
      body: JSON.stringify({ query }),
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 4_000)])
        : AbortSignal.timeout(options.timeoutMs ?? 4_000),
    });
    if (response.status === 404 || response.status === 501) return "unsupported";
    if (!response.ok) return null;
    return parseSearchQueryResponse(await response.json());
  } catch {
    return null;
  }
}

/**
 * 목적이 맞는 사진을 위로, 나머지는 그 아래 "비슷한 무드" 로 가른다.
 * 각자 SigLIP 순서는 그대로 둔다. 목적이 없으면 전부 위쪽이다.
 */
export function splitByPurposes<T extends { admin_purposes?: string[] | null }>(
  photos: T[],
  purposes: readonly string[]
): { matches: T[]; related: T[] } {
  if (purposes.length === 0) return { matches: [...photos], related: [] };
  const wanted = new Set(purposes);
  const matches: T[] = [];
  const related: T[] = [];
  for (const photo of photos) {
    if ((photo.admin_purposes ?? []).some((purpose) => wanted.has(purpose))) matches.push(photo);
    else related.push(photo);
  }
  return { matches, related };
}

/**
 * 목적 사진(거리순)을 위/아래로 가른다. 전체 사진에서 가까운 상위(nearIds)에 든 것이 위,
 * 나머지는 아래 "비슷한 무드의 사진들이에요" 다. 둘 다 검색어의 목적 사진이고 각자 거리순이다.
 */
export function splitByNearest<T extends { id: string }>(
  inPurpose: T[],
  nearIds: ReadonlySet<string>
): { matches: T[]; related: T[] } {
  const matches: T[] = [];
  const related: T[] = [];
  for (const photo of inPurpose) {
    if (nearIds.has(photo.id)) matches.push(photo);
    else related.push(photo);
  }
  return { matches, related };
}
