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

export type PhotoGender = "female" | "male";

export type SearchQueryParse = {
  purposes: PhotoPurposeKey[];
  /** 개인 사진을 성별로 찾을 때만 — "여자 노을" 은 female. 갱신 전 맥미니는 안 준다(null). */
  gender: PhotoGender | null;
  /** 목적 세부분류 — "임신" 은 ["event.maternity"] (0133). 갱신 전 맥미니는 안 준다([]). */
  details: string[];
  /** 목적(과 성별)을 뗀 나머지 글자. 비어 있으면 목적만 검색한 것이다. */
  moodText: string;
  vector: number[] | null;
};

const isPurposeKey = (value: unknown): value is PhotoPurposeKey =>
  typeof value === "string" && (PHOTO_PURPOSE_KEYS as readonly string[]).includes(value);

/** 맥미니 응답을 검증한다. 무드 글자가 있는데 벡터가 없으면 쓸 수 없는 응답이다. */
export function parseSearchQueryResponse(value: unknown): SearchQueryParse | null {
  if (!value || typeof value !== "object") return null;
  const response = value as {
    purposes?: unknown; gender?: unknown; details?: unknown; mood_text?: unknown; vector?: unknown; model?: unknown;
  };
  if (!Array.isArray(response.purposes) || !response.purposes.every(isPurposeKey)) return null;
  if (typeof response.mood_text !== "string") return null;
  const moodText = response.mood_text.trim();
  const vector = response.vector == null
    ? null
    : parseTextEmbeddingResponse({ model: response.model, vectors: [response.vector] });
  if (moodText && !vector) return null;
  // 목적도 무드도 없으면("스냅" "사진") 전체 사진이다 — 모든 사진이 스냅이고 사진이다.
  const gender = response.gender === "female" || response.gender === "male" ? response.gender : null;
  // "목적.세부" 꼴이고 그 목적이 함께 온 것만 받는다. 키 목록은 DB CHECK 가 최종으로 지킨다.
  const details = Array.isArray(response.details)
    ? [...new Set(response.details.filter((detail): detail is string =>
        typeof detail === "string" && /^[a-z]+\.[a-z_]+$/.test(detail) &&
        (response.purposes as string[]).includes(detail.split(".")[0])))]
    : [];
  return { purposes: [...response.purposes], gender, details, moodText, vector: moodText ? vector : null };
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

// ── z 컷 (0131 search_photos_by_z) ──────────────────────────────────────────
//
// 검색어마다 사진 전체의 평균 점수가 달라서 절대 점수로는 자를 수 없다 — 관련이 끊기는 점수가
// 바다 0.081 · 한복 0.119 로 들쭉날쭉했다. 그 검색어 평균에서 얼마나 튀어나왔나(z)로 보면
// 장면어 넷이 z 2.0~2.7 에서 끊겼다(docs/29 §12.8). 사람 눈으로 센 관련 비율로 나눈다.

/** 이 이상이면 검색 결과 — 관련 약 90% */
export const SEARCH_MATCH_Z = 2.5;
/** 이 이상이면 "비슷한 무드의 사진들이에요" — 관련 약 55%. 이 아래(약 15%)는 보여주지 않는다. */
export const SEARCH_RELATED_Z = 2.0;

/**
 * z 컷을 검색 화면에 쓰나. 0131(search_photos_by_z)이 DB 에 있어도 **아직 끈다** — 무드어는
 * SigLIP 이 약하게 읽어 z 로 자르면 결과가 굶는다. 무드어 영어 문구 작업 뒤에 켠다.
 * 0131 은 지금 성별 필터에만 쓴다(사진 전체의 점수가 필요해서).
 */
export const SEARCH_Z_CUT_ENABLED = false;

/** 점수순 목록을 z 로 가른다. 각자 점수순은 그대로다. */
export function splitByZ<T extends { z: number }>(
  scored: T[],
  matchZ = SEARCH_MATCH_Z
): { matches: T[]; related: T[] } {
  const matches: T[] = [];
  const related: T[] = [];
  for (const photo of scored) {
    if (photo.z >= matchZ) matches.push(photo);
    else related.push(photo);
  }
  return { matches, related };
}

/**
 * 같은 앨범이 연달아 나오지 않게 48장 구간 안에서만 흩뜨린다. 장수 상한이 없다 —
 * diversifySearchResults 는 300장에서 자르는데, z 로 자른 결과를 또 자르면 안 된다.
 */
export function spreadAlbumsInBands<T extends { id: string; width: number; height: number; album_id?: string | null }>(
  photos: T[]
): T[] {
  return diversifySimilarityCandidates(
    photos.map((photo) => ({ ...photo, photo, albumId: photo.album_id ?? null })),
    { preserveOrientationOrder: true, albumWindow: 12, relevanceBandSize: SEARCH_RELEVANCE_BAND_SIZE }
  ).map((candidate) => candidate.photo);
}

// ── 성별 필터 ────────────────────────────────────────────────────────────
// 성별은 점수 순위로 자를 수 없다. 개인 사진 1,027장 중 약 1,000장이 여성이라 "여자" 는
// 평균보다 튀는 사진이 없고, 상위 300장으로 자르면 여자 사진 대부분이 잘린다. 대신 사진마다
// "여자" 와 "남자" 중 어느 쪽에 더 가까운지 비교한다(2026-09-18 실측, docs/29 §12.9).

/**
 * 남자 쪽 경계 (코사인 거리 차 = 남자까지 거리 − 여자까지 거리). 이보다 작으면 남자 사진이다.
 * 차가 작은 쪽부터 눈으로 봤을 때 24위(0.0046)까지 전부 남자, 25위(0.0059)부터 사람이 작거나
 * 어두운 사진이 섞이고 곧 여자 사진이 나왔다.
 */
export const GENDER_BOUNDARY = 0.005;

type DistanceRow = { id: string; distance: number };

/**
 * 같은 사진들의 "여자"·"남자" 거리로 한 성별만 고른다. 고른 성별과 가까운 순서로 준다.
 * 두 목록에 다 있는 사진만 본다.
 */
export function pickByGender<T extends DistanceRow>(
  female: T[],
  male: DistanceRow[],
  gender: PhotoGender,
  boundary = GENDER_BOUNDARY
): T[] {
  const maleDistance = new Map(male.map((row) => [row.id, row.distance]));
  const picked = female.filter((row) => {
    const toMale = maleDistance.get(row.id);
    if (toMale === undefined) return false;
    const womanLean = toMale - row.distance;
    return gender === "female" ? womanLean >= boundary : womanLean < boundary;
  });
  if (gender === "female") return picked;
  return picked.sort((a, b) => (maleDistance.get(a.id) ?? 0) - (maleDistance.get(b.id) ?? 0));
}

// ── 검색어의 목적·세부분류·성별에 맞는 사진인가 (2026-09-21) ─────────────
// 목적은 **전부** 있어야 한다 — "커플 강아지" 는 커플이면서 강아지다(예전엔 둘 중 하나였다).
// 세부분류는 같은 목적 안에서 **하나라도** 있으면 된다 — "돌잔치 가족사진" 은 돌잔치 사진과 가족사진 둘 다.
// 목적이 다르면 목적마다 따로 본다 — "가족 강아지" 는 가족사진이면서 강아지 사진.

export type TaggedPhoto = {
  admin_purposes?: string[] | null;
  admin_purpose_details?: string[] | null;
  admin_purpose_gender?: string | null;
};

export function matchesSearchTags(
  photo: TaggedPhoto,
  tags: { purposes: readonly string[]; details?: readonly string[]; gender?: PhotoGender | null },
): boolean {
  const purposes = photo.admin_purposes ?? [];
  if (!tags.purposes.every((purpose) => purposes.includes(purpose))) return false;
  if (tags.gender && photo.admin_purpose_gender !== tags.gender) return false;
  const photoDetails = photo.admin_purpose_details ?? [];
  const byPurpose = new Map<string, string[]>();
  for (const detail of tags.details ?? []) {
    const purpose = detail.split(".")[0];
    byPurpose.set(purpose, [...(byPurpose.get(purpose) ?? []), detail]);
  }
  for (const wanted of byPurpose.values()) {
    if (!wanted.some((detail) => photoDetails.includes(detail))) return false;
  }
  return true;
}

/**
 * 포트폴리오가 뭉치지 않게 **전체에 고르게** 뿌린다(2026-09-21). 포트폴리오마다 사진을 목록 길이에 비례한 간격으로
 * 놓는다 — 45장짜리는 약 1/45 마다, 3장짜리는 약 1/3 마다. 한 바퀴씩 돌리면 작은 포트폴리오가 먼저 바닥나 뒤에
 * 큰 포트폴리오만 남아 줄줄이 이어졌다("개인" 뒤 127장이 한 작가). 작가가 아니라 포트폴리오가 기준이다 —
 * 다양한 사진이 고르게 나오는 게 목적이다. 포트폴리오 안의 순서는 그대로, 시작 위치만 고정된 무작위로 흔든다.
 */
export function spreadPortfolios<T extends { id: string; album_id?: string | null }>(photos: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const photo of photos) {
    const key = photo.album_id ?? `photo:${photo.id}`;
    groups.set(key, [...(groups.get(key) ?? []), photo]);
  }
  const next = seededRandom(photos.map((photo) => photo.id).slice(0, 8).join("|"));
  const placed: Array<{ photo: T; at: number; tie: number }> = [];
  for (const group of groups.values()) {
    const offset = next();
    group.forEach((photo, k) => placed.push({ photo, at: (k + offset) / group.length, tie: next() }));
  }
  return placed.sort((a, b) => a.at - b.at || a.tie - b.tie).map((item) => item.photo);
}

/**
 * 여러 무리를 돌아가며 **1~4장씩** 섞는다 — 같은 사진이 두 무리에 있으면 한 번만.
 * "커플 강아지" 처럼 목적을 전부 가진 사진이 없을 때, 커플 사진과 강아지 사진을 번갈아 보여준다(2026-09-21).
 * 한 장씩 딱딱 번갈아 나오면 기계적으로 보여 묶음 크기를 흔든다. 흔드는 값은 사진 id 로 정해지는 고정된
 * 무작위라 같은 검색은 늘 같은 순서다(새로고침·뒤로 가기에 자리가 안 바뀐다).
 */
export function interleaveGroups<T extends { id: string }>(groups: T[][], maxRun = 4): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const next = seededRandom(groups.map((group) => group[0]?.id ?? "").join("|"));
  const cursors = groups.map(() => 0);
  const total = groups.reduce((sum, group) => sum + group.length, 0);
  let turn = 0;
  for (let guard = 0; guard < total * 2 && cursors.some((c, i) => c < groups[i].length); guard += 1) {
    const g = turn % groups.length;
    turn += 1;
    const run = 1 + Math.floor(next() * maxRun);
    for (let taken = 0; taken < run && cursors[g] < groups[g].length; ) {
      const photo = groups[g][cursors[g]];
      cursors[g] += 1;
      if (seen.has(photo.id)) continue;
      seen.add(photo.id);
      out.push(photo);
      taken += 1;
    }
  }
  return out;
}

/** 문자열로 씨앗을 정하는 가벼운 난수(mulberry32) — 같은 씨앗이면 같은 수열. */
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
