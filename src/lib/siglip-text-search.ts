import "server-only";

import type { GalleryPhoto } from "@/lib/discovery";
import {
  normalizeSiglipSearchLimit,
  orderVectorMatches,
  pickByGender,
  requestSearchQuery,
  requestTextEmbedding,
  interleaveGroups,
  matchesSearchTags,
  SEARCH_Z_CUT_ENABLED,
  SIGLIP_SEARCH_MAX_RESULTS,
  spreadPortfolios,
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

type SearchPhoto = GalleryPhoto & {
  admin_purposes?: string[] | null;
  admin_purpose_details?: string[] | null;
  admin_purpose_gender?: string | null;
};

// 태그로 거를 때만 세부분류(0133)·성별(0132)까지 받는다 — 그 칸이 없는 DB 에서도 기본 조회는 돌아야 한다.
const TAGGED_COLUMNS = `${PHOTO_COLUMNS}, admin_purpose_details, admin_purpose_gender`;

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
 * 검색어의 목적을 **전부** 가진 사진을 최신순으로(목적이 없으면 전체). 세부분류·성별 칸까지 싣는다.
 * 그 칸이 없는 DB(0132·0133 전)면 null.
 */
async function fetchPhotosWithPurposes(
  purposes: PhotoPurposeKey[],
  signal: AbortSignal,
): Promise<SearchPhoto[] | null> {
  const photos: SearchPhoto[] = [];
  for (let from = 0; ; from += RPC_PAGE) {
    let query = createAdminClient().from("photos").select(TAGGED_COLUMNS);
    // "커플 강아지" 는 커플이면서 강아지다 — 겹침(overlaps)이 아니라 포함(contains)
    if (purposes.length) query = query.contains("admin_purposes", purposes);
    const { data, error } = await query
      .eq("visibility", "published")
      .eq("feed_hidden", false)
      .eq("photographer.status", "approved")
      .order("created_at", { ascending: false })
      .range(from, from + RPC_PAGE - 1)
      .abortSignal(signal);
    if (error?.code === "42703") return null;   // 0132·0133 전 — 칸이 없다
    if (error) {
      console.error("[siglip-search] 목적 사진 조회 실패:", error.message);
      throw error;
    }
    const page = (data ?? []) as unknown as SearchPhoto[];
    photos.push(...page);
    if (page.length < RPC_PAGE) return photos;
  }
}

/**
 * 검색어의 목적·세부분류·성별에 맞는 사진(matchesSearchTags). 세부분류로 좁혔는데 0장이면 세부분류 없이 —
 * 검수 전이라 세부분류가 안 붙은 사진이 빠지면 안 된다("돌" → 돌 사진이 아직 없으면 행사 전체).
 * 칸이 없는 DB 면 null.
 */
async function photosForTags(parsed: SearchQueryParse, signal: AbortSignal): Promise<SearchPhoto[] | null> {
  const picked = await photosWithAll(parsed, parsed.purposes, signal);
  if (!picked || picked.length || parsed.purposes.length < 2) return picked;

  // 목적을 전부 가진 사진이 없다("커플 강아지") — 목적마다 따로 골라 섞는다.
  // 무드가 없으면 1~4장씩 번갈아(목적마다 포트폴리오를 고르게 뿌린다), 무드가 있으면 합쳐서 무드 순으로 선다(storedResult).
  const groups: SearchPhoto[][] = [];
  for (const purpose of parsed.purposes) {
    const own = await photosWithAll(parsed, [purpose], signal);
    if (own === null) return null;
    groups.push(parsed.vector ? own : spreadPortfolios(own));
  }
  return interleaveGroups(groups);
}

/** purposes 를 전부 가진 사진 중 성별·세부분류(그 목적 것만)가 맞는 것. 세부분류로 0장이면 세부분류 없이. */
async function photosWithAll(
  parsed: SearchQueryParse,
  purposes: PhotoPurposeKey[],
  signal: AbortSignal,
): Promise<SearchPhoto[] | null> {
  const base = await fetchPhotosWithPurposes(purposes, signal);
  if (!base) return null;
  const details = parsed.details.filter((detail) => purposes.includes(detail.split(".")[0] as PhotoPurposeKey));
  const gender = purposes.includes("personal") ? parsed.gender : null;
  const tags = { purposes, gender, details };
  const picked = base.filter((photo) => matchesSearchTags(photo, tags));
  if (picked.length || !details.length) return picked;
  return base.filter((photo) => matchesSearchTags(photo, { ...tags, details: [] }));
}

/**
 * "여자" "남자 노을" — 개인 사진을 성별로 가른다. 남은 말("노을")이 있으면 다른 검색과 같은
 * 방식(가까운 300장)으로 그 성별 사진만, 없으면 그 성별 사진 **전부**.
 *
 * 성별 칸(0132)이 없는 DB 에서만 쓴다 — 검색할 때 여자·남자 거리를 비교해 가른다(0131).
 * 0131 도 없거나 성별 벡터를 못 받으면 null — 호출하는 쪽이 예전 방식으로 간다.
 */
async function searchByGender(
  parsed: SearchQueryParse,
  gender: PhotoGender,
  limit: number,
  signal: AbortSignal,
): Promise<PhotoSearchResult | null> {
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

/** 태그로 고른 사진 — 남은 말(무드)이 있으면 그 안에서 가까운 순 300장, 없으면 전부(포트폴리오 고르게). */
async function storedResult(
  parsed: SearchQueryParse,
  stored: SearchPhoto[],
  limit: number,
  signal: AbortSignal,
): Promise<PhotoSearchResult> {
  if (!parsed.vector) {
    // 무드가 없으면 순서를 정할 말이 없다 — 포트폴리오가 뭉치지 않게 전체에 고르게 뿌린다.
    // (목적을 섞은 경우는 photosForTags 가 이미 목적마다 뿌리고 번갈아 놓았다 — 다시 섞지 않는다)
    const mixed = parsed.purposes.length > 1 && !stored.every((photo) =>
      parsed.purposes.every((purpose) => (photo.admin_purposes ?? []).includes(purpose)));
    const matches = mixed ? stored : spreadPortfolios(stored);
    return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related: [], capped: false, arranged: mixed };
  }
  // 남은 말("여자 노을" 의 노을)은 그 사진들 안에서 가까운 순으로, 위에서 300장
  const byId = new Map(stored.map((photo) => [photo.id, photo]));
  const ranked = await rankInPurposes(parsed.vector, parsed.purposes, limit, signal, new Set(byId.keys()));
  if (ranked) {
    return { purposes: parsed.purposes, moodText: parsed.moodText, ...ranked, related: [] };
  }
  // 0131 이 없는 DB — 전체에서 가까운 300장 안에서
  const matches = (await nearestRows(parsed.vector, limit, signal))
    .map((row) => byId.get(row.id))
    .filter((photo): photo is SearchPhoto => photo !== undefined);
  return { purposes: parsed.purposes, moodText: parsed.moodText, matches, related: [], capped: false };
}

/**
 * 목적 사진 **전부**를 벡터와 가까운 순으로 줄 세워 위에서 limit 장("가을 커플스냅" → 커플 228장을 가을 순으로).
 * 예전엔 전체에서 가까운 300장을 먼저 뽑고 목적으로 걸러, 개인 사진이 상위를 채우면 커플이 45장만 남았다
 * (2026-09-19). allowed 가 있으면 그 사진만(성별·세부분류로 고른 것). 0131 이 없는 DB 면 null.
 */
async function rankInPurposes(
  vector: number[],
  purposes: PhotoPurposeKey[],
  limit: number,
  signal: AbortSignal,
  allowed?: Set<string>,
): Promise<{ matches: SearchPhoto[]; capped: boolean } | null> {
  const rows = await distancesInPurposes(vector, purposes, signal);   // 가까운 순
  if (!rows) return null;
  const candidates = allowed ? rows.filter((row) => allowed.has(row.id)) : rows;
  return {
    matches: await loadPhotosInOrder(candidates.slice(0, limit), signal),
    capped: candidates.length > limit,
  };
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
  /** 순서를 이미 짰다 — 화면이 앨범 흩뜨리기로 다시 섞지 않는다(목적을 번갈아 섞은 경우) */
  arranged?: boolean;
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

  // 목적이 있거나 무드도 없으면("스냅") — 목적·세부분류·성별에 맞는 사진을 고르고, 무드로 줄 세운다.
  // 목적만이면 전부(300장에서 자르지 않는다), 무드가 붙으면 그 안에서 가까운 순 300장.
  if (parsed.purposes.length || !parsed.vector) {
    const picked = await photosForTags(parsed, signal);
    if (picked) return storedResult(parsed, picked, limit, signal);
  }

  // ── 여기부터는 성별·세부분류 칸(0132·0133)이 없는 DB 의 옛 길 ──
  if (parsed.gender) {
    const byGender = await searchByGender(parsed, parsed.gender, limit, signal);
    if (byGender) return byGender;
    const fallback = parsed.vector ?? (await genderVector(parsed.gender, signal));
    if (fallback) return searchByVector({ ...parsed, vector: fallback }, limit, signal);
  }
  if (!parsed.vector) return { purposes: parsed.purposes, moodText: "", matches: [], related: [], capped: false };

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

  // 목적이 있으면 그 목적 사진 안에서 가까운 순으로 300장
  if (parsed.purposes.length) {
    const ranked = await rankInPurposes(parsed.vector, parsed.purposes, limit, signal);
    if (ranked) return { purposes: parsed.purposes, moodText: parsed.moodText, ...ranked, related: [] };
  }

  // 목적이 없거나 0131 이 없는 DB — 전체에서 가까운 300장. 목적이 있으면 그 목적만 남긴다
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
